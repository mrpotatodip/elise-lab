mod support;

use support::{alive, job, Engine, Runner, CODE};

fn paired(engine: &Engine) -> Runner {
    let runner = Runner::new(engine);
    let paired = runner.run(&["pair", CODE, "--yes"], "");
    assert_eq!(paired.code, 0, "{}{}", paired.stdout, paired.stderr);
    runner
}

#[test]
fn run_once_with_nothing_to_claim_exits_with_code_6() {
    let engine = Engine::start();
    let mut runner = paired(&engine);
    runner.stub_tools(&["claude", "node"]);

    let output = runner.run(&["run", "--once"], "");

    assert_eq!(output.code, 6, "{}{}", output.stdout, output.stderr);
    assert!(engine.results().is_empty());
}

const PLAIN: [&str; 4] = ["phase=recon cost=1.5", "phase=hunt cost=4", "phase=check cost=2.5", "phase=report cost=1"];

#[test]
fn run_once_runs_a_claimed_scan_sends_its_report_logs_each_step_and_removes_the_work_folder() {
    let engine = Engine::start();
    let mut runner = paired(&engine);
    let stubs = runner.stub_tools(&["claude", "node"]);
    engine.queue_job(job("scan_1", PLAIN));

    let output = runner.run(&["run", "--once"], "");

    assert_eq!(output.code, 0, "{}{}", output.stdout, output.stderr);
    let results = engine.results();
    assert_eq!(results.len(), 1);
    let (scan_id, result) = &results[0];
    assert_eq!(scan_id, "scan_1");
    assert_eq!(result["state"], "succeeded", "{result}");
    assert_eq!(result["files"]["REPORT.md"], "# Report\n");
    assert_eq!(result["checkout"]["headBranch"], "main");
    let log: Vec<&str> = output.stdout.lines().collect();
    assert_eq!(
        log,
        [
            "[acme/widgets scan_1] Scan claimed",
            "[acme/widgets scan_1] the recon phase started",
            "[acme/widgets scan_1] the recon phase ended: spent $1.50, $10.50 left of the Pool",
            "[acme/widgets scan_1] the hunt phase started",
            "[acme/widgets scan_1] the hunt phase ended: spent $4.00, $6.50 left of the Pool",
            "[acme/widgets scan_1] the check phase started",
            "[acme/widgets scan_1] the check phase ended: spent $2.50, $4.00 left of the Pool",
            "[acme/widgets scan_1] the report phase started",
            "[acme/widgets scan_1] the report phase ended: spent $1.00, $3.00 left of the Pool",
            "[acme/widgets scan_1] result sent to Elise",
            "[acme/widgets scan_1] Scan succeeded.",
        ]
    );
    assert!(!stubs.work_folder("scan_1").exists());
}

#[test]
fn run_once_with_a_failed_scan_reports_it_keeps_the_work_folder_and_exits_with_code_1() {
    let engine = Engine::start();
    let mut runner = paired(&engine);
    let stubs = runner.stub_tools(&["claude", "node"]);
    engine.queue_job(job("scan_2", ["phase=recon cost=1", "phase=hunt stop=crash", "phase=check", "phase=report"]));

    let output = runner.run(&["run", "--once"], "");

    assert_eq!(output.code, 1, "{}{}", output.stdout, output.stderr);
    let (_, result) = &engine.results()[0];
    assert_eq!(result["state"], "failed", "{result}");
    assert!(result["error"].as_str().unwrap().contains("The hunt phase failed"), "{result}");
    let work = stubs.work_folder("scan_2");
    assert!(work.join("agent-recon.log").is_file(), "the work folder is kept");
    let last = output.stdout.lines().last().unwrap();
    assert!(last.starts_with("[acme/widgets scan_2] Scan failed: The hunt phase failed"), "{last}");
    assert!(last.ends_with(&format!("Work folder kept: {}", work.display())), "{last}");
}

#[test]
fn a_missing_claude_or_node_is_reported_as_a_failed_scan_naming_it() {
    for (present, missing) in [("node", "`claude`"), ("claude", "`node`")] {
        let engine = Engine::start();
        let mut runner = paired(&engine);
        runner.stub_tools(&[present]);
        engine.queue_job(job("scan_3", PLAIN));

        let output = runner.run(&["run", "--once"], "");

        assert_eq!(output.code, 1, "{missing}: {}{}", output.stdout, output.stderr);
        let (_, result) = &engine.results()[0];
        assert_eq!(result["state"], "failed", "{missing}: {result}");
        assert!(result["error"].as_str().unwrap().contains(missing), "{missing}: {result}");
        assert!(output.stdout.contains(missing), "{missing}: {}", output.stdout);
    }
}

#[test]
fn a_token_elise_rejects_on_claim_is_forgotten_and_the_program_exits_with_code_4() {
    let args_and_scans_run_before_the_rejection: [(&[&str], usize); 2] = [(&["run", "--once"], 0), (&["run"], 1)];
    for (args, scans) in args_and_scans_run_before_the_rejection {
        let engine = Engine::start();
        let mut runner = paired(&engine);
        runner.stub_tools(&["claude", "node"]);
        if scans == 1 {
            engine.queue_job(job("scan_4", PLAIN));
            engine.remove_runners_after_the_next_result();
        } else {
            engine.remove_all_runners();
        }

        let output = runner.run(args, "");

        assert_eq!(output.code, 4, "{args:?}: {}{}", output.stdout, output.stderr);
        assert!(output.stderr.contains("removed"), "{args:?}: {}", output.stderr);
        assert_eq!(engine.results().len(), scans, "{args:?}");
        assert!(runner.home_files().is_empty(), "{args:?}: {:?}", runner.home_files());
    }
}

#[test]
fn the_agent_gets_the_built_in_skill_and_the_runners_settings_but_never_the_token() {
    let engine = Engine::start();
    let pairer = Runner::new(&engine);
    let token = pairer.run_allowing_token(&["pair", CODE, "--yes", "--print-token"], "").stdout.trim().to_string();
    let mut runner = Runner::new(&engine);
    runner.env.push(("ELISE_RUNNER_TOKEN", token.clone()));
    let stubs = runner.stub_tools(&["claude", "node"]);
    engine.queue_job(job("scan_5", PLAIN));

    let output = runner.run(&["run", "--once"], "");

    assert_eq!(output.code, 0, "{}{}", output.stdout, output.stderr);
    let read = |name: &str| std::fs::read_to_string(stubs.record.join(name)).unwrap();
    let env = read("env.txt");
    assert!(!env.contains("ELISE_RUNNER_TOKEN") && !env.contains(&token), "{env}");
    let settings: serde_json::Value = serde_json::from_str(&read("settings.json")).unwrap();
    let deny = settings["permissions"]["deny"].as_array().unwrap();
    assert!(deny.contains(&"Read(//proc/**)".into()), "{settings}");
    let skill = concat!(env!("CARGO_MANIFEST_DIR"), "/../../elise-engine-api/skills/security-audit/SKILL.md");
    assert_eq!(read("SKILL.md"), std::fs::read_to_string(skill).unwrap());
}

#[test]
fn a_stop_signal_during_a_scan_stops_the_agent_reports_the_scan_failed_and_exits_with_code_1() {
    for signal in ["INT", "TERM"] {
        let engine = Engine::start();
        let mut runner = paired(&engine);
        let stubs = runner.stub_tools(&["claude", "node"]);
        engine.queue_job(job("scan_6", ["phase=recon cost=1", "phase=hunt stop=wait", "phase=check", "phase=report"]));
        let running = runner.start(&["run"]);
        let agent = stubs.waiting_agent();

        running.signal(signal);
        let output = running.finish();

        assert_eq!(output.code, 1, "{signal}: {}{}", output.stdout, output.stderr);
        assert!(!alive(agent), "{signal}: the stub claude is still running");
        let results = engine.results();
        assert_eq!(results.len(), 1, "{signal}");
        let (scan_id, result) = &results[0];
        assert_eq!(scan_id, "scan_6");
        assert_eq!(result["state"], "failed", "{signal}: {result}");
        assert!(result["error"].as_str().unwrap().contains("the Runner was stopped"), "{signal}: {result}");
        assert!(result["agentLog"].as_str().unwrap().contains("the agent was half way through"), "{signal}: {result}");
        let work = stubs.work_folder("scan_6");
        assert!(work.join("agent-hunt.log").is_file(), "{signal}: the work folder is kept");
        let last = output.stdout.lines().last().unwrap();
        assert!(last.ends_with(&format!("Work folder kept: {}", work.display())), "{signal}: {last}");
    }
}

#[test]
fn a_stop_signal_with_no_scan_running_exits_at_once_with_code_0() {
    for signal in ["INT", "TERM"] {
        let engine = Engine::start();
        let mut runner = paired(&engine);
        runner.stub_tools(&["claude", "node"]);
        let running = runner.start(&["run"]);
        running.wait_for_output("Waiting for Scans");

        let asked = std::time::Instant::now();
        running.signal(signal);
        let output = running.finish();

        assert_eq!(output.code, 0, "{signal}: {}{}", output.stdout, output.stderr);
        assert!(asked.elapsed() < std::time::Duration::from_secs(2), "{signal}: took {:?}", asked.elapsed());
        assert!(engine.results().is_empty(), "{signal}");
    }
}

#[test]
fn run_once_stopped_while_its_claim_is_in_flight_exits_with_code_0() {
    let engine = Engine::start();
    let mut runner = paired(&engine);
    runner.stub_tools(&["claude", "node"]);
    engine.hold_claims();
    let running = runner.start(&["run", "--once"]);
    engine.wait_for_a_held_claim();

    running.signal("TERM");
    running.wait_for_error_output("Stopping.");
    engine.release_claims();
    let output = running.finish();

    assert_eq!(output.code, 0, "{}{}", output.stdout, output.stderr);
    assert!(output.stderr.contains("No Scan was running"), "{}", output.stderr);
    assert!(engine.results().is_empty());
}
