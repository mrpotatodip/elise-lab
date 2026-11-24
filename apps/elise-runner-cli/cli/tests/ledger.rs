mod support;

use support::{job_with_profile, Engine, Runner, CODE};

const LEDGER_RUN: [&str; 4] =
    ["phase=recon list=ok cost=1", "phase=hunt update=ok cost=1", "phase=check real=1 cost=1", "phase=report cost=1"];
const BAD_LIST_RUN: [&str; 4] = ["phase=recon list=bad cost=1", "phase=hunt cost=1", "phase=check real=1 cost=1", "phase=report cost=1"];

fn paired(engine: &Engine) -> Runner {
    let runner = Runner::new(engine);
    let paired = runner.run(&["pair", CODE, "--yes"], "");
    assert_eq!(paired.code, 0, "{}{}", paired.stdout, paired.stderr);
    runner
}

fn ledger_of(result: &serde_json::Value) -> Vec<serde_json::Value> {
    serde_json::from_str(result["files"]["coverage-ledger.json"].as_str().unwrap()).unwrap()
}

#[test]
fn a_short_list_becomes_a_ledger_the_real_validator_accepts_for_each_profile() {
    for (profile, units, subsystem, lifecycle) in [
        ("quick", 3, "profile/quick/all-in-scope-subsystems", false),
        ("standard", 3, "packages/api", false),
        ("deep", 5, "packages/api", true),
    ] {
        let engine = Engine::start();
        let mut runner = paired(&engine);
        runner.stub_tools(&["claude", "real-node"]);
        engine.queue_job(job_with_profile("scan_l", profile, ["phase=recon list=ok", "phase=hunt", "phase=check real=1", "phase=report"]));

        let output = runner.run(&["run", "--once"], "");

        assert_eq!(output.code, 0, "{profile}: {}{}", output.stdout, output.stderr);
        let (_, result) = &engine.results()[0];
        assert_eq!(result["state"], "succeeded", "{profile}: {result}");
        let ledger = ledger_of(result);
        assert_eq!(ledger.len(), units, "{profile}");
        assert!(ledger.iter().all(|unit| unit["subsystem"] == subsystem), "{profile}");
        assert_eq!(ledger.iter().any(|unit| unit.get("lifecycle").is_some()), lifecycle, "{profile}");
        let paths = ledger.iter().flat_map(|unit| unit["starting_paths"].as_array().unwrap().clone());
        assert!(paths.into_iter().all(|path| !path.as_str().unwrap().ends_with('/')), "{profile}");
    }
}

#[test]
fn units_the_hunt_returns_are_merged_into_the_built_ledger() {
    let engine = Engine::start();
    let mut runner = paired(&engine);
    runner.stub_tools(&["claude", "real-node"]);
    engine.queue_job(job_with_profile("scan_m", "standard", LEDGER_RUN));

    let output = runner.run(&["run", "--once"], "");

    assert_eq!(output.code, 0, "{}{}", output.stdout, output.stderr);
    let ledger = ledger_of(&engine.results()[0].1);
    let covered: Vec<_> = ledger.iter().filter(|unit| unit["status"] == "covered").collect();
    assert_eq!(covered.len(), 1, "{ledger:?}");
    assert_eq!(covered[0]["agent_id"], "hunter-1");
    assert_eq!(ledger.iter().filter(|unit| unit["status"] == "planned").count(), 2);
}

#[test]
fn a_bad_short_list_goes_to_the_one_repair_run_in_the_validators_words() {
    let engine = Engine::start();
    let mut runner = paired(&engine);
    let stubs = runner.stub_tools(&["claude", "real-node"]);
    engine.queue_job(job_with_profile("scan_r", "standard", BAD_LIST_RUN));

    let output = runner.run(&["run", "--once"], "");

    assert_eq!(output.code, 0, "{}{}", output.stdout, output.stderr);
    assert!(output.stdout.contains("the repair run started"), "{}", output.stdout);
    let said = stubs.repair_prompt();
    assert!(said.contains("recon-list.json") && said.contains("entries[1].paths[0]"), "{said}");
    let (_, result) = &engine.results()[0];
    assert_eq!(result["state"], "succeeded", "{result}");
    assert_eq!(ledger_of(result).len(), 3);
}
