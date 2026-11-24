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

fn run_with_hunt(scan_id: &str, hunt: &str) -> (Engine, Runner, support::Stubs) {
    let engine = Engine::start();
    let mut runner = paired(&engine);
    let stubs = runner.stub_tools(&["claude", "real-node"]);
    let hunt = format!("phase=hunt {hunt} cost=1");
    engine.queue_job(job_with_profile(
        scan_id,
        "standard",
        ["phase=recon list=ok cost=1", &hunt, "phase=check real=1 cost=1", "phase=report cost=1"],
    ));
    runner.run(&["run", "--once"], "");
    (engine, runner, stubs)
}

#[test]
fn an_update_that_builds_but_leaves_an_invalid_ledger_is_checked_again_after_the_repair() {
    let (engine, _runner, stubs) = run_with_hunt("scan_v", "update=invalid");

    let (_, result) = &engine.results()[0];
    assert_eq!(result["state"], "failed", "{result}");
    let said = result["error"].as_str().unwrap();
    assert!(said.contains("hunt phase") && said.contains("repair run did not fix"), "{said}");
    assert!(!said.contains("already used"), "{said}");
    assert!(stubs.repair_prompt().contains("coverage-ledger.json"));
}

#[test]
fn a_units_reviewed_paths_are_computed_from_its_checks_whatever_the_hunter_wrote() {
    let (engine, _runner, _stubs) = run_with_hunt("scan_w", "update=wrongpaths");

    let (_, result) = &engine.results()[0];
    assert_eq!(result["state"], "succeeded", "{result}");
    let ledger = ledger_of(result);
    let covered = ledger.iter().find(|unit| unit["status"] == "covered").unwrap();
    assert_eq!(covered["reviewed_paths"], serde_json::json!(["src/upload.ts", "src/second.ts"]));
}

#[test]
fn a_stopped_hunt_with_one_bad_unit_update_is_sent_with_the_good_unit_kept_and_the_bad_one_put_back() {
    let (engine, _runner, _stubs) = run_with_hunt("scan_p", "update=halfbad stop=limit");

    let (_, result) = &engine.results()[0];
    assert_eq!(result["state"], "succeeded", "{result}");
    let ledger = ledger_of(result);
    assert_eq!(ledger.iter().filter(|unit| unit["status"] == "covered").count(), 1, "{ledger:?}");
    assert_eq!(ledger.iter().filter(|unit| unit["status"] == "planned").count(), 2, "{ledger:?}");
    let report = result["files"]["REPORT.md"].as_str().unwrap();
    assert!(report.starts_with("PARTIAL: money ran out;"), "{report}");
    assert!(report.contains("1 unit's update was not kept"), "{report}");
    assert!(report.contains("kept as it was before the update, or left out if it was new"), "{report}");
    assert!(!report.contains("count as not covered"), "{report}");
}

#[test]
fn a_stopped_hunt_with_one_bad_unit_that_gives_one_error_line_keeps_the_good_unit() {
    let (engine, _runner, _stubs) = run_with_hunt("scan_q", "update=onebad stop=limit");

    let (_, result) = &engine.results()[0];
    assert_eq!(result["state"], "succeeded", "{result}");
    let ledger = ledger_of(result);
    assert_eq!(ledger.iter().filter(|unit| unit["status"] == "covered").count(), 1, "{ledger:?}");
    assert!(result["files"]["REPORT.md"].as_str().unwrap().contains("1 unit's update was not kept"));
}

#[test]
fn a_new_units_reviewed_paths_are_computed_from_its_checks_too() {
    let (engine, _runner, _stubs) = run_with_hunt("scan_n", "update=newunit");

    let (_, result) = &engine.results()[0];
    assert_eq!(result["state"], "succeeded", "{result}");
    let ledger = ledger_of(result);
    let added = ledger.iter().find(|unit| unit["surface"] == "src/new.ts#GET /new").unwrap();
    assert_eq!(added["reviewed_paths"], serde_json::json!(["src/new.ts", "src/second.ts"]));
}

#[test]
fn a_changed_order_of_canonical_refs_is_not_a_change_of_the_unit() {
    let (engine, _runner, _stubs) = run_with_hunt("scan_o", "update=reordered");

    let (_, result) = &engine.results()[0];
    assert_eq!(result["state"], "succeeded", "{result}");
    assert_eq!(ledger_of(result).iter().filter(|unit| unit["status"] == "covered").count(), 1);
}

#[test]
fn a_malformed_new_unit_is_reported_in_the_builders_words_not_as_a_stack_trace() {
    let (_engine, _runner, stubs) = run_with_hunt("scan_n", "update=malformed");

    let said = stubs.repair_prompt();
    assert!(said.contains("ledger-updates.json") && said.contains("updates[0].canonical_refs"), "{said}");
    assert!(!said.contains("node:internal") && !said.contains("Error:") && !said.contains(" at "), "{said}");
}
