mod support;

use serde_json::Value;
use support::{job, Engine, Output, Runner, CODE};

fn paired(engine: &Engine) -> Runner {
    let runner = Runner::new(engine);
    let paired = runner.run(&["pair", CODE, "--yes"], "");
    assert_eq!(paired.code, 0, "{}{}", paired.stdout, paired.stderr);
    runner
}

fn events_of(output: &Output) -> Vec<Value> {
    output
        .stdout
        .lines()
        .map(|line| {
            let event: Value = serde_json::from_str(line).unwrap_or_else(|why| panic!("not a JSON line ({why}): {line}"));
            assert_eq!(event["schemaVersion"], 1, "{event}");
            assert!(event["event"].as_str().is_some(), "{event}");
            assert!(event["scanId"].as_str().is_some(), "{event}");
            assert!(event["at"].as_str().is_some_and(|at| at.ends_with('Z') && at.contains('T')), "{event}");
            event
        })
        .collect()
}

fn names(events: &[Value]) -> Vec<String> {
    events
        .iter()
        .map(|event| match event["phase"].as_str() {
            Some(phase) => format!("{} {phase}", event["event"].as_str().unwrap()),
            None => event["event"].as_str().unwrap().to_string(),
        })
        .collect()
}

#[test]
fn a_succeeded_scan_prints_its_events_in_order_with_prose_on_stderr_and_no_model_content() {
    let engine = Engine::start();
    let mut runner = paired(&engine);
    runner.stub_tools(&["claude", "node"]);
    engine.queue_job(job("scan_1", ["phase=recon cost=1.5", "phase=hunt", "phase=check live=detail", "phase=report"]));

    let output = runner.run(&["run", "--once", "--json"], "");

    assert_eq!(output.code, 0, "{}{}", output.stdout, output.stderr);
    let events = events_of(&output);
    assert_eq!(
        names(&events),
        [
            "claimed",
            "phase_started recon",
            "phase_finished recon",
            "phase_started hunt",
            "phase_finished hunt",
            "phase_started check",
            "finding",
            "phase_finished check",
            "phase_started report",
            "phase_finished report",
            "result",
        ]
    );
    assert_eq!(events[0]["repo"], "acme/widgets");
    assert_eq!(events[2]["costUsd"], 1.5);
    assert_eq!(events[2]["poolLeftUsd"], 10.5);
    let finding = &events[6];
    assert_eq!(finding["fingerprint"], "fp-detail");
    assert_eq!(finding["verdict"], "confirmed");
    assert_eq!(finding["severity"], "high");
    let result = events.last().unwrap();
    assert_eq!((result["state"].as_str(), result["sent"].as_bool()), (Some("succeeded"), Some(true)), "{result}");
    assert!(!output.stdout.contains("MODEL-WORDS"), "model content in the events:\n{}", output.stdout);
    assert!(output.stderr.contains("[acme/widgets scan_1] Scan succeeded."), "{}", output.stderr);
}

#[test]
fn a_failed_scan_ends_its_events_with_a_failed_result_and_exits_with_code_1() {
    let engine = Engine::start();
    let mut runner = paired(&engine);
    runner.stub_tools(&["claude", "node"]);
    engine.queue_job(job("scan_2", ["phase=recon cost=1", "phase=hunt stop=crash", "phase=check", "phase=report"]));

    let output = runner.run(&["run", "--once", "--json"], "");

    assert_eq!(output.code, 1, "{}{}", output.stdout, output.stderr);
    let events = events_of(&output);
    assert_eq!(
        names(&events),
        ["claimed", "phase_started recon", "phase_finished recon", "phase_started hunt", "phase_finished hunt", "result"]
    );
    let result = events.last().unwrap();
    assert_eq!((result["state"].as_str(), result["sent"].as_bool()), (Some("failed"), Some(true)), "{result}");
    assert!(result.get("message").is_none() && result.get("error").is_none(), "{result}");
}

#[cfg(unix)]
#[test]
fn a_scan_stopped_from_elise_ends_its_events_with_stopped_and_exits_with_code_7() {
    let engine = Engine::start();
    let mut runner = paired(&engine);
    let stubs = runner.stub_tools(&["claude", "node"]);
    engine.queue_job(job("scan_3", ["phase=recon cost=1", "phase=hunt stop=wait", "phase=check", "phase=report"]));
    let running = runner.start(&["run", "--once", "--json"]);
    stubs.waiting_agent();

    engine.cancel_job("scan_3");
    let output = running.finish();

    assert_eq!(output.code, 7, "{}{}", output.stdout, output.stderr);
    let events = events_of(&output);
    assert_eq!(
        names(&events),
        ["claimed", "phase_started recon", "phase_finished recon", "phase_started hunt", "phase_finished hunt", "stopped"]
    );
    let work = stubs.work_folder("scan_3");
    assert_eq!(events.last().unwrap()["workFolder"], work.display().to_string());
    assert!(engine.results().is_empty());
}

#[test]
fn run_once_with_nothing_to_claim_prints_one_failure_object_and_exits_with_code_6() {
    let engine = Engine::start();
    let mut runner = paired(&engine);
    runner.stub_tools(&["claude", "node"]);

    let output = runner.run(&["run", "--once", "--json"], "");

    assert_eq!(output.code, 6, "{}{}", output.stdout, output.stderr);
    let body: Value =
        serde_json::from_str(output.stdout.trim()).unwrap_or_else(|why| panic!("not one JSON object ({why}): {}", output.stdout));
    assert_eq!((body["ok"].as_bool(), body["exitCode"].as_i64()), (Some(false), Some(6)), "{body}");
    assert_eq!(body["error"]["code"], "nothing_to_claim");
    assert!(body["error"]["next"].as_str().is_some() && body["schemaVersion"] == 1, "{body}");
    assert!(output.stderr.contains("Nothing to claim."), "{}", output.stderr);
}

#[test]
fn run_on_an_unpaired_computer_prints_one_failure_object_and_exits_with_code_3() {
    let engine = Engine::start();
    let runner = Runner::new(&engine);

    let output = runner.run(&["run", "--once", "--json"], "");

    assert_eq!(output.code, 3, "{}{}", output.stdout, output.stderr);
    let body: Value =
        serde_json::from_str(output.stdout.trim()).unwrap_or_else(|why| panic!("not one JSON object ({why}): {}", output.stdout));
    assert_eq!((body["ok"].as_bool(), body["error"]["code"].as_str()), (Some(false), Some("unpaired")), "{body}");
}

#[test]
fn findings_still_print_when_the_engine_refuses_the_live_upload_with_a_conflict() {
    let engine = Engine::start();
    let mut runner = paired(&engine);
    runner.stub_tools(&["claude", "node"]);
    engine.answer_findings_with(409);
    engine.queue_job(job("scan_2", ["phase=recon", "phase=hunt", "phase=check live=spread", "phase=report"]));

    let output = runner.run(&["run", "--once", "--json"], "");

    assert_eq!(output.code, 0, "{}{}", output.stdout, output.stderr);
    let found = events_of(&output).iter().filter(|event| event["event"] == "finding").count();
    assert_eq!(found, 3, "{}", output.stdout);
}
