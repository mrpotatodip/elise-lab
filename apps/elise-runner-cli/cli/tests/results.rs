mod support;

use serde_json::{json, Value};
use support::{branch_json, finding_json, repo_json, scan_json, verdict_json, Engine, Output, Runner};

const WIDGETS: &str = "a1111111-1111-4111-8111-111111111111";
const GADGETS: &str = "a2222222-2222-4222-8222-222222222222";
const COMMIT: &str = "0123456789abcdef0123456789abcdef01234567";
const SCAN: &str = "000000001-aaaa";
const OLD: &str = "000000002-bbbb";
const FAILED: &str = "000000003-cccc";
const REPORT: &str = "# Report\n\nOne injection and a weak token.\n";

fn seeded() -> (Engine, Runner) {
    let engine = Engine::start();
    engine.add_repo(repo_json(WIDGETS, "github", None, "acme/widgets"));
    engine.add_repo(repo_json(GADGETS, "github", None, "acme/gadgets"));
    engine.set_branches(WIDGETS, vec![branch_json("main", true, Some(SCAN), Some(COMMIT)), branch_json("dev", false, None, None)]);
    engine.set_branches(GADGETS, vec![branch_json("main", true, None, None)]);
    engine.set_verdict(WIDGETS, COMMIT, verdict_json(COMMIT, "fail"));

    let mut scan = scan_json(SCAN, WIDGETS, "acme/widgets", "succeeded");
    scan["commitSha"] = json!(COMMIT);
    scan["finishedAt"] = json!("2026-11-20T10:06:00.000Z");
    scan["files"] = json!(["REPORT.md", "findings.json", "scan.bin"]);
    scan["artifacts"] = json!([
        { "name": "REPORT.md", "sizeBytes": REPORT.len(), "contentType": "text/markdown" },
        { "name": "findings.json", "sizeBytes": 2, "contentType": "application/json" },
        { "name": "scan.bin", "sizeBytes": 4, "contentType": "application/octet-stream" },
    ]);
    scan["usage"] = json!({
        "inputTokens": 1, "outputTokens": 1, "cacheReadTokens": 0, "cacheWriteTokens": 0, "costUsd": 1.234, "turns": 3, "durationMs": 60000,
    });
    scan["summary"] = json!({
        "total": 3,
        "severity": { "critical": 0, "high": 1, "medium": 0, "low": 1, "informational": 0 },
        "needsValidation": 1,
        "new": 2,
        "carried": 1,
        "recheck": null,
    });
    scan["runner"] = json!({ "id": "9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b", "name": "build-box" });
    engine.add_scan(scan);
    engine.add_finding(finding_json(SCAN, "acme/widgets", Some("high"), "confirmed", "SQL built from input"));
    engine.add_finding(finding_json(SCAN, "acme/widgets", Some("low"), "confirmed", "Weak token"));
    engine.add_finding(finding_json(SCAN, "acme/widgets", None, "needs_validation", "Maybe an open redirect"));
    engine.set_file(SCAN, "REPORT.md", REPORT.as_bytes());
    engine.set_file(SCAN, "findings.json", b"[]");
    engine.set_file(SCAN, "scan.bin", &[0, 159, 146, 150]);

    let mut old = scan_json(OLD, WIDGETS, "acme/widgets", "succeeded");
    old["files"] = json!(["findings.json"]);
    engine.add_scan(old);
    engine.set_file(
        OLD,
        "findings.json",
        br#"[
          {"status":"confirmed","severity":"critical","title":"Hard-coded key","location":[{"file":"cfg.ts","line":4}]},
          {"verdict":"needs_validation","title":"Odd cookie","severity":{"overall_severity":"low"},"evidence":[{"file":"web.ts","line":9}]},
          {"verdict":"rejected","title":"Dead code"}
        ]"#,
    );

    let mut failed = scan_json(FAILED, GADGETS, "acme/gadgets", "failed");
    failed["error"] = json!("The agent ran out of budget");
    engine.add_scan(failed);

    engine.set_diff(
        SCAN,
        json!({
            "scanId": SCAN,
            "previousScanId": "000000000-zzzz",
            "new": [{ "fingerprint": "f1", "status": "confirmed", "severity": "high", "title": "SQL built from input", "class": "injection", "file": "src/db.ts", "line": 12 }],
            "stillOpen": [],
            "regressed": [],
            "fixed": [{ "fingerprint": "f2", "status": "confirmed", "severity": "low", "title": "Old header", "class": "headers", "file": null, "line": null }],
            "notRechecked": [],
        }),
    );
    engine.set_diff(
        OLD,
        json!({ "scanId": OLD, "previousScanId": null, "new": [], "stillOpen": [], "regressed": [], "fixed": [], "notRechecked": [] }),
    );

    let mut runner = Runner::new(&engine);
    runner.env.push(("ELISE_TOKEN", engine.grant_cli_access("read")));
    (engine, runner)
}

fn json_of(output: &Output) -> Value {
    serde_json::from_str(&output.stdout).unwrap_or_else(|why| panic!("{why}: {}{}", output.stdout, output.stderr))
}

fn titles(shown: &Value, key: &str) -> Vec<String> {
    shown[key].as_array().unwrap().iter().map(|finding| finding["title"].as_str().unwrap().to_string()).collect()
}

#[test]
fn report_json_holds_the_summary_the_verdict_and_the_top_findings() {
    let (_engine, runner) = seeded();

    let output = runner.run(&["report", "000000001", "--json"], "");

    assert_eq!(output.code, 0, "{}{}", output.stdout, output.stderr);
    let shown = json_of(&output);
    assert_eq!((shown["schemaVersion"].clone(), shown["ok"].clone(), shown["exitCode"].clone()), (json!(1), json!(true), json!(0)));
    assert_eq!(
        shown["scan"],
        json!({
            "id": SCAN,
            "repo": "acme/widgets",
            "repoId": WIDGETS,
            "branch": "main",
            "status": "succeeded",
            "profile": "standard",
            "commit": COMMIT,
            "createdAt": "2026-11-20T10:00:00.000Z",
            "finishedAt": "2026-11-20T10:06:00.000Z",
            "costUsd": 1.234,
            "runner": "build-box",
            "error": null,
        })
    );
    assert_eq!(
        shown["summary"],
        json!({
            "total": 3,
            "severity": { "critical": 0, "high": 1, "medium": 0, "low": 1, "informational": 0 },
            "needsValidation": 1,
            "new": 2,
            "carried": 1,
        })
    );
    assert_eq!(shown["verdict"], verdict_json(COMMIT, "fail"));
    assert_eq!(titles(&shown, "topFindings"), ["SQL built from input", "Weak token", "Maybe an open redirect"]);
    let first = &shown["topFindings"][0];
    assert_eq!(
        (first["severity"].clone(), first["status"].clone(), first["file"].clone(), first["line"].clone(), first["fix"].clone()),
        (json!("high"), json!("confirmed"), json!("src/db.ts"), json!(12), json!("Use a parameter"))
    );
    assert!(shown.get("reportMarkdown").is_none());
}

#[test]
fn report_prints_the_figures_the_scan_page_shows() {
    let (_engine, runner) = seeded();

    let output = runner.run(&["report", "000000001"], "");

    assert_eq!(output.code, 0, "{}", output.stderr);
    for wanted in [
        "acme/widgets  main  Scan 000000001-aaaa",
        "Status: succeeded  Profile: standard  Commit: 0123456",
        "Cost: $1.23, estimated at list price. It ran on build-box, so nothing was billed.",
        "Findings: 3 findings (critical 0, high 1, medium 0, low 1, informational 0)",
        "2 confirmed by the Scan, 1 need a person to check by hand",
        "2 new, 1 carried over from earlier Scans and seen again",
        "Verdict at 0123456: fail",
        "One more full Scan is needed before this can pass.",
        "Top findings:",
        "SEVERITY",
        "high      confirmed",
        "SQL built from input",
        "src/db.ts:12",
        "needs validation",
        "elise report 000000001-aaaa --full",
    ] {
        assert!(output.stdout.contains(wanted), "{wanted}\n{}", output.stdout);
    }
}

#[test]
fn report_full_prints_the_whole_report_md_and_json_carries_it() {
    let (_engine, runner) = seeded();

    let text = runner.run(&["report", "latest", "--full"], "");
    let shown = runner.run(&["report", "000000001", "--full", "--json"], "");

    assert_eq!((text.code, text.stdout.as_str()), (0, REPORT));
    assert_eq!(json_of(&shown)["reportMarkdown"], REPORT);
    assert_eq!(json_of(&shown)["scan"]["id"], SCAN);
}

#[test]
fn report_full_of_a_scan_with_no_report_md_exits_1() {
    let (_engine, runner) = seeded();

    let output = runner.run(&["report", "000000002", "--full", "--json"], "");

    assert_eq!(output.code, 1, "{}", output.stdout);
    let failed = json_of(&output);
    assert_eq!((failed["error"]["code"].clone(), failed["error"]["next"].clone()), (json!("no_report"), json!("elise files")));
}

#[test]
fn an_old_scan_without_database_findings_shows_them_through_findings_json() {
    let (engine, runner) = seeded();

    let output = runner.run(&["report", "000000002", "--json"], "");

    assert_eq!(output.code, 0, "{}{}", output.stdout, output.stderr);
    let shown = json_of(&output);
    assert_eq!(titles(&shown, "topFindings"), ["Hard-coded key", "Odd cookie"]);
    assert_eq!(
        shown["summary"],
        json!({
            "total": 2,
            "severity": { "critical": 1, "high": 0, "medium": 0, "low": 1, "informational": 0 },
            "needsValidation": 1,
            "new": null,
            "carried": null,
        })
    );
    assert_eq!(shown["topFindings"][0]["file"], "cfg.ts");
    assert_eq!(shown["topFindings"][0]["fingerprint"], Value::Null);
    assert_eq!(shown["verdict"], Value::Null);
    assert!(engine.access_requests().iter().any(|request| request == &format!("GET /scans/{OLD}/files/findings.json")));
}

#[test]
fn a_scan_that_did_not_succeed_has_no_summary_findings_or_verdict() {
    let (engine, runner) = seeded();

    let shown = json_of(&runner.run(&["report", "000000003", "--json"], ""));
    let text = runner.run(&["report", "000000003"], "");

    assert_eq!((shown["scan"]["status"].clone(), shown["scan"]["error"].clone()), (json!("failed"), json!("The agent ran out of budget")));
    assert_eq!((shown["summary"].clone(), shown["verdict"].clone(), shown["topFindings"].clone()), (Value::Null, Value::Null, json!([])));
    assert!(text.stdout.contains("Status: failed") && text.stdout.contains("Error: The agent ran out of budget"), "{}", text.stdout);
    assert!(!engine.access_requests().iter().any(|request| request.contains("/findings") || request.contains("/verdict")));
}

#[test]
fn findings_of_a_scan_come_worst_first_and_each_filter_narrows_them() {
    let (_engine, runner) = seeded();

    let all = json_of(&runner.run(&["findings", "--scan", "000000001", "--json"], ""));
    let high = json_of(&runner.run(&["findings", "--scan", SCAN, "--severity", "high", "--json"], ""));
    let to_check = json_of(&runner.run(&["findings", "--scan=latest", "--status", "needs_validation", "--json"], ""));

    assert_eq!(all["scanId"], SCAN);
    assert_eq!(titles(&all, "findings"), ["SQL built from input", "Weak token", "Maybe an open redirect"]);
    assert_eq!(titles(&high, "findings"), ["SQL built from input"]);
    assert_eq!(titles(&to_check, "findings"), ["Maybe an open redirect"]);
    assert_eq!(all["findings"][0]["triage"], Value::Null);
}

#[test]
fn findings_of_an_old_scan_filter_the_findings_json_the_same_way() {
    let (_engine, runner) = seeded();

    let all = json_of(&runner.run(&["findings", "--scan", "000000002", "--json"], ""));
    let low = json_of(&runner.run(&["findings", "--scan", "000000002", "--severity", "low", "--json"], ""));
    let confirmed = json_of(&runner.run(&["findings", "--scan", "000000002", "--status", "confirmed", "--json"], ""));

    assert_eq!(titles(&all, "findings"), ["Hard-coded key", "Odd cookie", "Dead code"]);
    assert_eq!(all["findings"][2]["status"], "rejected");
    assert_eq!(titles(&low, "findings"), ["Odd cookie"]);
    assert_eq!(titles(&confirmed, "findings"), ["Hard-coded key"]);
}

#[test]
fn findings_without_a_scan_asks_the_engine_for_the_latest_findings_of_the_repo() {
    let (engine, runner) = seeded();

    let shown = json_of(&runner.run(&["findings", "--repo", "acme/widgets", "--severity", "low", "--json"], ""));
    let text = runner.run(&["findings"], "");

    assert_eq!(shown["scanId"], Value::Null);
    assert_eq!(titles(&shown, "findings"), ["Weak token"]);
    let asked = engine.access_requests().into_iter().find(|request| request.starts_with("GET /findings?")).unwrap();
    for wanted in ["repo=https%3A%2F%2Fgithub.com%2Facme%2Fwidgets", "severity=low", "limit=100"] {
        assert!(asked.contains(wanted), "{wanted}: {asked}");
    }
    assert!(!asked.contains("scanId"), "{asked}");
    assert!(text.stdout.lines().next().unwrap().contains("REPO"), "{}", text.stdout);
    assert!(text.stdout.contains("acme/widgets") && text.stdout.contains("Weak token"), "{}", text.stdout);
}

#[test]
fn findings_pages_through_every_finding() {
    let (engine, runner) = seeded();
    for number in 0..120 {
        engine.add_finding(finding_json(SCAN, "acme/widgets", Some("low"), "confirmed", &format!("More {number}")));
    }

    let shown = json_of(&runner.run(&["findings", "--scan", SCAN, "--json"], ""));

    assert_eq!(shown["findings"].as_array().unwrap().len(), 123);
}

#[test]
fn findings_with_nothing_to_show_says_that_is_not_proof() {
    let (_engine, runner) = seeded();

    let output = runner.run(&["findings", "--scan", "000000001", "--severity", "critical"], "");

    assert_eq!(output.code, 0, "{}", output.stderr);
    assert!(output.stdout.contains("not proof the code is safe"), "{}", output.stdout);
}

#[test]
fn findings_refuses_a_filter_value_it_does_not_know() {
    let (_engine, runner) = seeded();

    let severity = runner.run(&["findings", "--severity", "urgent", "--json"], "");
    let status = runner.run(&["findings", "--status", "rejected"], "");
    let missing = runner.run(&["findings", "--scan"], "");

    assert_eq!((severity.code, json_of(&severity)["error"]["code"].clone()), (2, json!("usage")));
    assert_eq!(status.code, 2);
    assert!(status.stderr.contains("confirmed, needs_validation"), "{}", status.stderr);
    assert_eq!(missing.code, 2);
}

#[test]
fn files_lists_what_the_scan_saved_and_get_writes_the_bytes_to_stdout() {
    let (_engine, runner) = seeded();

    let listed = json_of(&runner.run(&["files", "000000001", "--json"], ""));
    let text = runner.run(&["files", "000000001"], "");
    let got = runner.run(&["files", "get", "000000001", "REPORT.md"], "");

    assert_eq!(listed["scanId"], SCAN);
    assert_eq!(listed["files"][0], json!({ "name": "REPORT.md", "sizeBytes": REPORT.len(), "contentType": "text/markdown" }));
    assert_eq!(listed["files"].as_array().unwrap().len(), 3);
    assert!(
        text.stdout.contains("REPORT.md") && text.stdout.contains("text/markdown") && text.stdout.contains("scan.bin"),
        "{}",
        text.stdout
    );
    assert_eq!((got.code, got.stdout.as_str()), (0, REPORT));
}

#[test]
fn files_get_saves_to_a_path_or_into_a_folder_and_keeps_binary_bytes() {
    let (_engine, runner) = seeded();
    let folder = support::temp_home();
    let file = folder.join("out.md");

    let saved = runner.run(&["files", "get", SCAN, "REPORT.md", "--out", file.to_str().unwrap(), "--json"], "");
    let into = runner.run(&["files", "get", SCAN, "scan.bin", "--out", folder.to_str().unwrap()], "");

    assert_eq!(saved.code, 0, "{}{}", saved.stdout, saved.stderr);
    assert_eq!(std::fs::read_to_string(&file).unwrap(), REPORT);
    let shown = json_of(&saved);
    assert_eq!(
        (shown["name"].clone(), shown["bytes"].clone(), shown["path"].clone()),
        (json!("REPORT.md"), json!(REPORT.len()), json!(file.display().to_string()))
    );
    assert_eq!(into.code, 0, "{}", into.stderr);
    assert_eq!(std::fs::read(folder.join("scan.bin")).unwrap(), [0, 159, 146, 150]);
    assert!(into.stdout.contains("Saved 4 bytes"), "{}", into.stdout);
}

#[test]
fn files_get_does_not_print_binary_to_a_terminal_or_into_json() {
    let (_engine, mut runner) = seeded();
    runner.env.push(("ELISE_TEST_TERMINAL", "1".to_string()));

    let terminal = runner.run(&["files", "get", SCAN, "scan.bin"], "");
    let text_on_terminal = runner.run(&["files", "get", SCAN, "REPORT.md"], "");
    let json = runner.run(&["files", "get", SCAN, "scan.bin", "--json"], "");
    let text_json = runner.run(&["files", "get", SCAN, "REPORT.md", "--json"], "");

    assert_eq!(terminal.code, 2, "{}", terminal.stdout);
    assert!(terminal.stdout.is_empty() && terminal.stderr.contains("--out"), "{}", terminal.stderr);
    assert_eq!(text_on_terminal.stdout, REPORT);
    assert_eq!((json.code, json_of(&json)["error"]["code"].clone()), (2, json!("binary_needs_out")));
    assert_eq!(json_of(&text_json)["content"], REPORT);
}

#[test]
fn files_get_of_a_file_the_scan_did_not_save_exits_1_and_lists_the_files() {
    let (engine, runner) = seeded();

    let output = runner.run(&["files", "get", SCAN, "NOTES.md", "--json"], "");
    let slash = runner.run(&["files", "get", SCAN, "../REPORT.md"], "");
    let no_name = runner.run(&["files", "get", SCAN], "");

    assert_eq!(output.code, 1, "{}", output.stdout);
    let failed = json_of(&output);
    assert_eq!(failed["error"]["code"], "file_not_found");
    assert!(failed["error"]["message"].as_str().unwrap().contains("REPORT.md, findings.json, scan.bin"), "{failed}");
    assert!(!engine.access_requests().iter().any(|request| request.contains("NOTES.md")));
    assert_eq!(slash.code, 2);
    assert_eq!(no_name.code, 2);
}

#[test]
fn diff_shows_what_changed_and_json_is_the_engine_answer() {
    let (_engine, runner) = seeded();

    let shown = json_of(&runner.run(&["diff", "000000001", "--json"], ""));
    let text = runner.run(&["diff", "000000001"], "");
    let first = runner.run(&["diff", "000000002"], "");

    assert_eq!((shown["scanId"].clone(), shown["previousScanId"].clone()), (json!(SCAN), json!("000000000-zzzz")));
    assert_eq!(titles(&shown, "new"), ["SQL built from input"]);
    assert_eq!(titles(&shown, "fixed"), ["Old header"]);
    assert_eq!(shown["ok"], true);
    for wanted in
        ["compared with 000000000-zzzz", "New (1):", "  high  SQL built from input  src/db.ts:12", "Fixed (1):", "  low  Old header  -"]
    {
        assert!(text.stdout.contains(wanted), "{wanted}\n{}", text.stdout);
    }
    assert!(!text.stdout.contains("Still open"), "{}", text.stdout);
    assert!(first.stdout.contains("no earlier Scan to compare with"), "{}", first.stdout);
}

#[test]
fn verdict_judges_the_latest_commit_of_the_default_branch() {
    let (engine, runner) = seeded();

    let shown = json_of(&runner.run(&["verdict", "acme/widgets", "--json"], ""));
    let text = runner.run(&["verdict", "acme/widgets"], "");

    assert_eq!(shown["repo"], json!({ "id": WIDGETS, "name": "acme/widgets" }));
    assert_eq!(shown["branch"], "main");
    assert_eq!(shown["verdict"], verdict_json(COMMIT, "fail"));
    for wanted in [
        "Verdict on main at 0123456: fail",
        "One more full Scan is needed before this can pass.",
        "Scans counted: 1 of 2 needed",
        "high 1, medium 2",
        "1 need a person to check by hand",
    ] {
        assert!(text.stdout.contains(wanted), "{wanted}\n{}", text.stdout);
    }
    assert!(engine.access_requests().iter().any(|request| request == &format!("GET /repos/{WIDGETS}/verdict?commit={COMMIT}")));
}

#[test]
fn verdict_takes_a_commit_and_says_when_there_is_none_to_judge() {
    let (_engine, runner) = seeded();
    let other = "f".repeat(40);

    let unknown = runner.run(&["verdict", "acme/widgets", "--commit", &other, "--json"], "");
    let known = json_of(&runner.run(&["verdict", "acme/widgets", "--commit", &COMMIT.to_uppercase(), "--json"], ""));
    let none = runner.run(&["verdict", "acme/gadgets", "--json"], "");
    let short = runner.run(&["verdict", "acme/widgets", "--commit", "0123456", "--json"], "");

    assert_eq!((unknown.code, json_of(&unknown)["error"]["code"].clone()), (1, json!("not_found")));
    assert_eq!((known["branch"].clone(), known["verdict"]["commit"].clone()), (Value::Null, json!(COMMIT)));
    let failed = json_of(&none);
    assert_eq!((none.code, failed["error"]["code"].clone()), (1, json!("no_commit")));
    assert_eq!((short.code, json_of(&short)["error"]["code"].clone()), (2, json!("usage")));
}

#[test]
fn a_name_that_fits_no_repo_or_scan_fails_like_the_other_commands() {
    let (_engine, runner) = seeded();

    let repo = runner.run(&["verdict", "acme/nothing", "--json"], "");
    let missing = runner.run(&["report", "0fffffff", "--json"], "");
    let short = runner.run(&["diff", "0fff", "--json"], "");
    let none = runner.run(&["files"], "");

    assert_eq!((repo.code, json_of(&repo)["error"]["code"].clone()), (1, json!("repo_not_found")));
    assert_eq!((missing.code, json_of(&missing)["error"]["code"].clone()), (1, json!("scan_not_found")));
    assert_eq!((short.code, json_of(&short)["error"]["code"].clone()), (2, json!("bad_scan_id")));
    assert_eq!(none.code, 2);
}

#[test]
fn every_command_needs_cli_access_and_reads_with_the_read_scope() {
    let engine = Engine::start();
    let bare = Runner::new(&engine);
    let (_seeded, runner) = seeded();
    let commands: [&[&str]; 5] = [
        &["report", "latest", "--json"],
        &["findings", "--json"],
        &["files", "latest", "--json"],
        &["diff", "latest", "--json"],
        &["verdict", "acme/widgets", "--json"],
    ];

    for args in commands {
        let none = bare.run(args, "");
        let read = runner.run(args, "");

        assert_eq!((none.code, json_of(&none)["error"]["code"].clone()), (3, json!("no_cli_access")), "{args:?}");
        assert_eq!(read.code, 0, "{args:?}: {}{}", read.stdout, read.stderr);
    }
}

#[test]
fn no_command_prints_the_token() {
    let (engine, runner) = seeded();
    let token = engine.access_tokens().remove(0);

    for args in [&["report", "latest", "--full"][..], &["findings", "--scan", SCAN], &["diff", SCAN], &["verdict", "acme/widgets"]] {
        let output = runner.run(args, "");

        assert!(!output.stdout.contains(&token) && !output.stderr.contains(&token), "{args:?}");
    }
}
