mod support;

use serde_json::{json, Value};
use support::{repo_json, scan_json, Engine, Output, Runner};

const WIDGETS: &str = "a1111111-1111-4111-8111-111111111111";
const GADGETS: &str = "a2222222-2222-4222-8222-222222222222";
const NEWEST: &str = "0aaaaaaaa-newest";
const SIBLING: &str = "0aaaaaaab-second";
const FAILED: &str = "0bbbbbbbb-failed";
const RUNNING: &str = "0cccccccc-running";
const DONE: &str = "0dddddddd-done";

fn seeded(scope: &str) -> (Engine, Runner) {
    let engine = Engine::start();
    engine.add_repo(repo_json(WIDGETS, "github", None, "acme/widgets"));
    engine.add_repo(repo_json(GADGETS, "github", None, "acme/gadgets"));
    let mut done = scan_json(DONE, GADGETS, "acme/gadgets", "succeeded");
    done["finishedAt"] = json!("2026-11-20T10:05:00.000Z");
    done["commitSha"] = json!("0123456789abcdef0123456789abcdef01234567");
    done["runner"] = json!({ "id": "c1111111-1111-4111-8111-111111111111", "name": "build-box" });
    done["usage"] = json!({
        "inputTokens": 100, "outputTokens": 50, "cacheReadTokens": 10, "cacheWriteTokens": 5,
        "costUsd": 1.5, "turns": 12, "durationMs": 185000,
        "phases": [{ "phase": "recon", "inputTokens": 1, "outputTokens": 1, "cacheReadTokens": 0, "cacheWriteTokens": 0, "costUsd": 0.5, "turns": 3, "durationMs": 1000 }],
    });
    done["summary"] = json!({
        "total": 3,
        "severity": { "critical": 0, "high": 1, "medium": 2, "low": 0, "informational": 0 },
        "needsValidation": 1, "new": 3, "carried": 0, "recheck": null,
    });
    engine.add_scan(scan_json(NEWEST, WIDGETS, "acme/widgets", "succeeded"));
    engine.add_scan(scan_json(SIBLING, WIDGETS, "acme/widgets", "queued"));
    engine.add_scan(scan_json(FAILED, WIDGETS, "acme/widgets", "failed"));
    engine.add_scan(scan_json(RUNNING, GADGETS, "acme/gadgets", "running"));
    engine.add_scan(done);
    let mut runner = Runner::new(&engine);
    runner.env.push(("ELISE_TOKEN", engine.grant_cli_access(scope)));
    (engine, runner)
}

fn json_of(output: &Output) -> Value {
    serde_json::from_str(&output.stdout).unwrap_or_else(|why| panic!("{why}: {}{}", output.stdout, output.stderr))
}

fn failure(output: &Output, exit: i32, code: &str) -> Value {
    assert_eq!(output.code, exit, "{}{}", output.stdout, output.stderr);
    let value = json_of(output);
    assert_eq!(
        (value["ok"].as_bool(), value["exitCode"].as_i64(), value["error"]["code"].as_str()),
        (Some(false), Some(exit as i64), Some(code)),
        "{value}"
    );
    value
}

fn posts(engine: &Engine) -> Vec<String> {
    engine.access_requests().into_iter().filter(|request| request.starts_with("POST")).collect()
}

#[test]
fn scans_lists_the_newest_first_and_one_repo_when_asked() {
    let (_engine, runner) = seeded("read");

    let all = json_of(&runner.run(&["scans", "--json"], ""));
    let one = json_of(&runner.run(&["scans", "--repo", "acme/gadgets", "--json"], ""));

    let ids =
        |value: &Value| value["scans"].as_array().unwrap().iter().map(|scan| scan["id"].as_str().unwrap().to_string()).collect::<Vec<_>>();
    assert_eq!(ids(&all), [NEWEST, SIBLING, FAILED, RUNNING, DONE]);
    assert_eq!(ids(&one), [RUNNING, DONE]);
    assert_eq!(
        all["scans"][0],
        json!({
            "id": NEWEST, "repo": "acme/widgets", "repoId": WIDGETS, "branch": "main", "status": "succeeded",
            "profile": "standard", "createdAt": "2026-11-20T10:00:00.000Z", "finishedAt": null,
        })
    );
}

#[test]
fn scans_prints_one_line_per_scan() {
    let (_engine, runner) = seeded("read");

    let output = runner.run(&["scans", "--repo=acme/widgets"], "");

    assert_eq!(output.code, 0, "{}", output.stderr);
    assert!(output.stdout.lines().next().unwrap().starts_with("SCAN"), "{}", output.stdout);
    assert!(output.stdout.contains(&format!("{NEWEST}  acme/widgets  main    standard  succeeded  2026-11-20")), "{}", output.stdout);
    assert!(!output.stdout.contains(DONE), "{}", output.stdout);
}

#[test]
fn scans_with_a_repo_that_matches_nothing_exits_1_and_without_a_value_exits_2() {
    let (_engine, runner) = seeded("read");

    failure(&runner.run(&["scans", "--repo", "acme/nothing", "--json"], ""), 1, "repo_not_found");
    failure(&runner.run(&["scans", "--repo", "--json"], ""), 2, "usage");
}

#[test]
fn scan_show_gives_status_run_details_cost_and_counts_by_prefix_or_latest() {
    let (_engine, runner) = seeded("read");

    let by_prefix = json_of(&runner.run(&["scan", "show", "0dddddddd", "--json"], ""));
    let latest = json_of(&runner.run(&["scan", "show", "latest", "--json"], ""));

    assert_eq!(latest["scan"]["id"], NEWEST);
    assert_eq!(latest["cost"], Value::Null);
    assert_eq!(by_prefix["scan"]["id"], DONE);
    assert_eq!(
        by_prefix["scan"],
        json!({
            "id": DONE, "repo": "acme/gadgets", "repoId": GADGETS, "branch": "main",
            "commit": "0123456789abcdef0123456789abcdef01234567", "status": "succeeded", "step": null,
            "profile": "standard", "profileMet": null, "model": "claude-sonnet-5-5", "effort": "high", "budgetUsd": 12.0,
            "createdAt": "2026-11-20T10:00:00.000Z", "updatedAt": "2026-11-20T10:05:00.000Z",
            "finishedAt": "2026-11-20T10:05:00.000Z", "error": null, "failureCode": null,
            "runner": { "id": "c1111111-1111-4111-8111-111111111111", "name": "build-box" },
            "resumes": null, "resumedBy": null,
        })
    );
    assert_eq!(by_prefix["cost"]["costUsd"], 1.5);
    assert_eq!(by_prefix["cost"]["phases"], json!([{ "phase": "recon", "costUsd": 0.5, "durationMs": 1000 }]));
    assert_eq!(by_prefix["summary"]["severity"]["high"], 1);
    assert_eq!(by_prefix["summary"]["needsValidation"], 1);
}

#[test]
fn scan_show_prints_the_run_in_words() {
    let (_engine, runner) = seeded("read");

    let output = runner.run(&["scan", "show", DONE], "");

    assert_eq!(output.code, 0, "{}", output.stderr);
    for line in [
        format!("Scan {DONE}  succeeded"),
        "Repo: acme/gadgets  branch main  at 0123456".to_string(),
        "Runner: build-box".to_string(),
        "Cost: $1.50, 12 turns, 3m 05s".to_string(),
        "Findings: 3 (critical 0, high 1, medium 2, low 0, informational 0), 1 need validation".to_string(),
    ] {
        assert!(output.stdout.contains(&line), "{line}\n{}", output.stdout);
    }
}

#[test]
fn a_scan_id_that_is_short_unknown_or_shared_by_several_scans_is_refused() {
    let (_engine, runner) = seeded("read");

    failure(&runner.run(&["scan", "show", "0aaaaaa", "--json"], ""), 2, "bad_scan_id");
    failure(&runner.run(&["trace", "0nothing0", "--json"], ""), 1, "scan_not_found");
    let ambiguous = failure(&runner.run(&["stop", "0aaaaaaa", "--json"], ""), 2, "ambiguous_scan");
    let matched: Vec<&str> = ambiguous["matches"].as_array().unwrap().iter().map(|found| found["id"].as_str().unwrap()).collect();
    assert_eq!(matched, [NEWEST, SIBLING]);
}

#[test]
fn trace_lists_the_phases_and_labels() {
    let (engine, runner) = seeded("read");
    engine.set_trace(
        DONE,
        json!({
            "entries": [
                { "id": "018f0000-0000-7000-8000-000000000001", "label": "reading", "phase": "recon", "startedAt": "2026-11-20T10:00:00.000Z", "endedAt": "2026-11-20T10:00:05.000Z", "count": 3 },
                { "id": "018f0000-0000-7000-8000-000000000002", "label": "searching", "phase": null, "startedAt": "2026-11-20T10:00:05.000Z", "endedAt": "2026-11-20T10:00:09.000Z", "count": 1 },
            ],
            "cursor": "2026-11-20T10:00:09.000Z",
            "candidateFindings": 4,
        }),
    );

    let shown = json_of(&runner.run(&["trace", "0dddddddd", "--json"], ""));
    let text = runner.run(&["trace", DONE], "");

    assert_eq!(shown["scanId"], DONE);
    assert_eq!(shown["candidateFindings"], 4);
    assert_eq!(
        shown["entries"][0],
        json!({ "id": "018f0000-0000-7000-8000-000000000001", "label": "reading", "phase": "recon", "startedAt": "2026-11-20T10:00:00.000Z", "endedAt": "2026-11-20T10:00:05.000Z", "count": 3 })
    );
    assert_eq!(shown["entries"][1]["phase"], Value::Null);
    assert!(text.stdout.contains("recon  reading    3"), "{}", text.stdout);
    assert!(text.stdout.contains("Candidate findings so far: 4"), "{}", text.stdout);
}

#[test]
fn trace_of_a_scan_with_no_entries_says_so() {
    let (_engine, runner) = seeded("read");

    let output = runner.run(&["trace", RUNNING], "");

    assert_eq!((output.code, output.stdout.as_str()), (0, format!("Scan {RUNNING} has no Trace yet.\n").as_str()));
}

#[test]
fn stop_stops_a_running_scan_by_prefix_and_refuses_a_finished_one() {
    let (engine, runner) = seeded("start");

    let stopped = json_of(&runner.run(&["stop", "0cccccccc", "--json"], ""));
    let again = failure(&runner.run(&["stop", RUNNING, "--json"], ""), 1, "refused");

    assert_eq!(
        (stopped["ok"].as_bool(), stopped["scanId"].as_str(), stopped["status"].as_str()),
        (Some(true), Some(RUNNING), Some("stopped"))
    );
    assert_eq!(again["error"]["message"], "The Scan has already finished");
    assert_eq!(posts(&engine).iter().filter(|call| call.contains("/stop")).count(), 2);
}

#[test]
fn stop_latest_stops_the_newest_scan() {
    let (engine, runner) = seeded("start");

    let output = runner.run(&["stop", "latest"], "");

    assert_eq!(output.code, 1, "{}", output.stderr);
    assert_eq!(posts(&engine), [format!("POST /scans/{NEWEST}/stop")]);
}

#[test]
fn stop_and_resume_need_scope_start_and_exit_2_before_calling_elise() {
    let (engine, mut runner) = seeded("read");
    runner.env.retain(|(name, _)| *name != "ELISE_TOKEN");
    let token = engine.grant_cli_access("read");
    runner.env.push(("ELISE_TOKEN", format!("read:{token}")));

    let stop = failure(&runner.run(&["stop", RUNNING, "--json"], ""), 2, "needs_scope");
    failure(&runner.run(&["resume", FAILED, "--json"], ""), 2, "needs_scope");

    assert!(stop["error"]["message"].as_str().unwrap().contains("holds scope read"), "{stop}");
    assert!(posts(&engine).is_empty(), "{:?}", posts(&engine));
}

#[test]
fn a_scope_elise_refuses_after_the_call_is_the_same_failure() {
    let (_engine, runner) = seeded("read");

    failure(&runner.run(&["stop", RUNNING, "--json"], ""), 2, "needs_scope");
    failure(&runner.run(&["resume", FAILED, "--json"], ""), 2, "needs_scope");
}

#[test]
fn resume_starts_a_resume_of_a_failed_scan_and_says_the_local_folder_state() {
    let (engine, runner) = seeded("start");

    let output = runner.run(&["resume", "0bbbbbbbb", "--json"], "");

    assert_eq!(output.code, 0, "{}{}", output.stdout, output.stderr);
    let value = json_of(&output);
    assert_eq!(
        (value["scanId"].as_str(), value["resumable"].as_bool(), value["started"].as_bool()),
        (Some(FAILED), Some(false), Some(true))
    );
    assert_eq!(value["phases"], json!([]));
    assert_eq!((value["newScanId"].as_str(), value["status"].as_str()), (Some("0bbbbbbbb-failed-resumed"), Some("queued")));
    assert_eq!(posts(&engine), [format!("POST /scans/{FAILED}/resume")]);
}

#[test]
fn resume_still_says_which_phases_the_kept_work_folder_holds() {
    let (engine, mut runner) = seeded("start");
    let kept = "0eeeeeeee-kept";
    engine.add_scan(scan_json(kept, WIDGETS, "acme/widgets", "failed"));
    let paired = runner.run(&["pair", support::CODE, "--yes"], "");
    assert_eq!(paired.code, 0, "{}{}", paired.stdout, paired.stderr);
    runner.stub_tools(&["claude", "node"]);
    engine.queue_job(support::job(kept, ["phase=recon cost=1.5", "phase=hunt stop=crash", "phase=check", "phase=report"]));
    assert_eq!(runner.run(&["run", "--once"], "").code, 1);

    let output = runner.run(&["resume", "0eeeeeeee", "--json"], "");

    assert_eq!(output.code, 0, "{}{}", output.stdout, output.stderr);
    let value = json_of(&output);
    assert_eq!((value["resumable"].as_bool(), value["started"].as_bool()), (Some(true), Some(true)));
    assert_eq!(value["phases"], json!(["recon"]));
}

#[test]
fn resume_in_words_names_the_new_scan() {
    let (_engine, runner) = seeded("start");

    let output = runner.run(&["resume", FAILED], "");

    assert_eq!(output.code, 0, "{}", output.stderr);
    assert!(output.stdout.contains(&format!("Started a resume of Scan {FAILED} as Scan {FAILED}-resumed (queued).")), "{}", output.stdout);
    assert!(output.stdout.contains("holds no work folder"), "{}", output.stdout);
}

#[test]
fn resume_of_a_scan_that_is_not_stopped_or_failed_is_refused_with_elises_reason() {
    let (_engine, runner) = seeded("start");

    let value = failure(&runner.run(&["resume", DONE, "--json"], ""), 1, "refused");

    assert_eq!(value["error"]["message"], "Only a stopped or failed Scan can be resumed");
}

#[test]
fn scans_commands_without_cli_access_exit_3() {
    let engine = Engine::start();
    let runner = Runner::new(&engine);

    failure(&runner.run(&["scans", "--json"], ""), 3, "no_cli_access");
    failure(&runner.run(&["scan", "show", "latest", "--json"], ""), 3, "no_cli_access");
    failure(&runner.run(&["trace", "latest", "--json"], ""), 3, "no_cli_access");
    failure(&runner.run(&["stop", "latest", "--json"], ""), 3, "no_cli_access");
}

#[test]
fn the_scan_commands_need_a_scan() {
    let (_engine, runner) = seeded("start");

    for command in [["scan", "show"], ["trace", "--json"], ["stop", "--json"]] {
        let mut args = command.to_vec();
        args.push("--json");
        failure(&runner.run(&args, ""), 2, "usage");
    }
}
