mod support;

use serde_json::{json, Value};
use std::process::Command;
use support::{job, repo_json, Engine, Output, Runner, CODE, NEW_SCAN_ID, RUNNER_ID};

const WIDGETS: &str = "a1111111-1111-4111-8111-111111111111";
const LAPTOP: &str = "c2222222-2222-4222-8222-222222222222";
const PLAIN: [&str; 4] = ["phase=recon cost=1.5", "phase=hunt cost=4", "phase=check cost=2.5", "phase=report cost=1"];

fn seeded() -> (Engine, Runner) {
    let engine = Engine::start();
    engine.add_repo(repo_json(WIDGETS, "github", None, "acme/widgets"));
    engine.add_runner(RUNNER_ID, "build-box", "connected");
    let mut runner = Runner::new(&engine);
    runner.env.push(("ELISE_TOKEN", engine.grant_cli_access("start")));
    runner.env.push(("ELISE_DASHBOARD_URL", "https://app.test".to_string()));
    (engine, runner)
}

fn asking(runner: &mut Runner) {
    runner.env.push(("ELISE_TEST_TERMINAL", "1".to_string()));
}

fn json_of(output: &Output) -> Value {
    serde_json::from_str(&output.stdout).unwrap_or_else(|why| panic!("{why}: {}{}", output.stdout, output.stderr))
}

fn paired(engine: &Engine, runner: &Runner) {
    assert_eq!(runner.run(&["pair", CODE, "--yes"], "").code, 0);
    assert!(!engine.tokens().is_empty());
}

#[test]
fn scan_returns_at_once_with_the_scan_id_and_link_and_sends_the_default_profile() {
    let (engine, runner) = seeded();

    let output = runner.run(&["scan", "acme/widgets", "--yes", "--json"], "");

    assert_eq!(output.code, 0, "{}{}", output.stdout, output.stderr);
    let shown = json_of(&output);
    assert_eq!((shown["ok"].clone(), shown["exitCode"].clone()), (json!(true), json!(0)));
    assert_eq!(
        shown["scan"],
        json!({
            "id": NEW_SCAN_ID,
            "repo": "acme/widgets",
            "branch": "main",
            "profile": "standard",
            "capUsd": 12.0,
            "runner": { "id": RUNNER_ID, "name": "build-box" },
            "status": "queued",
            "link": format!("https://app.test/scans/{NEW_SCAN_ID}"),
        })
    );
    assert_eq!(
        engine.scan_posts(),
        [json!({ "provider": "github", "repo": "https://github.com/acme/widgets", "profile": "standard", "runner_id": RUNNER_ID })]
    );
    assert!(engine.repo_posts().is_empty());
}

#[test]
fn scan_text_prints_the_id_and_link() {
    let (_engine, runner) = seeded();

    let output = runner.run(&["scan", "acme/widgets", "--yes"], "");

    assert_eq!(output.code, 0, "{}{}", output.stdout, output.stderr);
    assert!(output.stdout.contains(&format!("Scan queued: {NEW_SCAN_ID}")), "{}", output.stdout);
    assert!(output.stdout.contains(&format!("https://app.test/scans/{NEW_SCAN_ID}")), "{}", output.stdout);
}

#[test]
fn scan_sends_the_branch_budget_and_profile_whatever_name_the_profile_goes_by() {
    let (engine, runner) = seeded();

    let output = runner.run(&["scan", "acme/widgets", "--branch", "dev", "--profile", "exhaustive", "--budget=7.5", "--yes"], "");

    assert_eq!(output.code, 0, "{}{}", output.stdout, output.stderr);
    let sent = &engine.scan_posts()[0];
    assert_eq!((sent["ref"].clone(), sent["profile"].clone(), sent["max_budget_usd"].clone()), (json!("dev"), json!("deep"), json!(7.5)));
}

#[test]
fn scan_with_no_terminal_and_no_yes_exits_2_and_starts_nothing() {
    let (engine, runner) = seeded();

    let output = runner.run(&["scan", "acme/widgets", "--json"], "");

    assert_eq!(output.code, 2, "{}", output.stdout);
    assert_eq!(json_of(&output)["error"]["code"], "needs_yes");
    assert!(engine.scan_posts().is_empty() && engine.repo_posts().is_empty());
    assert!(engine.access_requests().is_empty());
}

#[test]
fn scan_in_a_terminal_shows_a_summary_and_starts_only_after_a_yes() {
    let (engine, mut runner) = seeded();
    asking(&mut runner);

    let declined = runner.run(&["scan", "acme/widgets", "--profile", "quick", "--budget", "4"], "n\n");
    let none = runner.run(&["scan", "acme/widgets"], "\n");
    let accepted = runner.run(&["scan", "acme/widgets", "--profile", "quick", "--budget", "4"], "y\n");

    assert_eq!((declined.code, none.code, accepted.code), (1, 1, 0), "{}{}", accepted.stdout, accepted.stderr);
    assert_eq!(engine.scan_posts().len(), 1);
    for line in ["Repo:    acme/widgets", "Branch:  main", "Profile: quick", "Cap:     $4.00", "Runner:  build-box"] {
        assert!(declined.stdout.contains(line), "{line}: {}", declined.stdout);
    }
    assert!(declined.stderr.contains("Nothing was started"), "{}", declined.stderr);
}

#[test]
fn scan_adds_a_repo_that_is_new_before_it_starts_the_scan() {
    let (engine, runner) = seeded();

    let output = runner.run(&["scan", "acme/fresh", "--yes"], "");

    assert_eq!(output.code, 0, "{}{}", output.stdout, output.stderr);
    assert_eq!(engine.repo_posts(), [json!({ "provider": "github", "repo": "https://github.com/acme/fresh" })]);
    assert_eq!(engine.scan_posts()[0]["repo"], "https://github.com/acme/fresh");
    assert!(output.stdout.contains("new: it will be added"), "{}", output.stdout);
}

#[test]
fn scan_with_a_dot_scans_the_checkouts_repo_and_current_branch() {
    let (engine, mut runner) = seeded();
    let folder = support::temp_home();
    let git = |args: &[&str]| {
        let done = Command::new("git")
            .args(args)
            .current_dir(&folder)
            .env_remove("GIT_DIR")
            .env_remove("GIT_WORK_TREE")
            .env_remove("GIT_INDEX_FILE")
            .env_remove("GIT_PREFIX")
            .output()
            .expect("git runs");
        assert!(done.status.success(), "git {args:?}: {}", String::from_utf8_lossy(&done.stderr));
    };
    git(&["init", "-q", "-b", "feature"]);
    git(&["remote", "add", "origin", "git@github.com:acme/widgets.git"]);
    runner.cwd = Some(folder);

    let output = runner.run(&["scan", "--yes"], "");

    assert_eq!(output.code, 0, "{}{}", output.stdout, output.stderr);
    let sent = &engine.scan_posts()[0];
    assert_eq!((sent["repo"].clone(), sent["ref"].clone()), (json!("https://github.com/acme/widgets"), json!("feature")));
    assert!(engine.repo_posts().is_empty());
}

#[test]
fn the_runner_is_the_named_one_then_this_computers_then_the_accounts_only_one() {
    let (engine, runner) = seeded();
    engine.add_runner(LAPTOP, "laptop", "connected");
    engine.add_runner("c3333333-3333-4333-8333-333333333333", "old", "waiting");

    let named = runner.run(&["scan", "acme/widgets", "--runner", "LAPTOP", "--yes"], "");
    paired(&engine, &runner);
    let here = runner.run(&["scan", "acme/widgets", "--yes"], "");

    assert_eq!((named.code, here.code), (0, 0), "{}{}{}{}", named.stdout, named.stderr, here.stdout, here.stderr);
    let sent: Vec<Value> = engine.scan_posts().iter().map(|body| body["runner_id"].clone()).collect();
    assert_eq!(sent, [json!(LAPTOP), json!(RUNNER_ID)]);
}

#[test]
fn several_runners_and_no_choice_exits_2_and_lists_them() {
    let (engine, runner) = seeded();
    engine.add_runner(LAPTOP, "laptop", "connected");

    let output = runner.run(&["scan", "acme/widgets", "--yes", "--json"], "");

    assert_eq!(output.code, 2, "{}", output.stdout);
    let failed = json_of(&output);
    assert_eq!(failed["error"]["code"], "runner_needed");
    assert_eq!(failed["matches"], json!([{ "id": RUNNER_ID, "name": "build-box" }, { "id": LAPTOP, "name": "laptop" }]));
    assert!(output.stderr.contains("build-box") && output.stderr.contains("laptop"), "{}", output.stderr);
    assert!(engine.scan_posts().is_empty());
}

#[test]
fn an_unknown_runner_name_and_an_account_with_no_runner_exit_2() {
    let (engine, runner) = seeded();
    let unknown = runner.run(&["scan", "acme/widgets", "--runner", "nope", "--yes", "--json"], "");
    let (empty, bare) = {
        let engine = Engine::start();
        engine.add_repo(repo_json(WIDGETS, "github", None, "acme/widgets"));
        let mut bare = Runner::new(&engine);
        bare.env.push(("ELISE_TOKEN", engine.grant_cli_access("start")));
        (engine, bare)
    };

    let none = bare.run(&["scan", "acme/widgets", "--yes", "--json"], "");

    assert_eq!((unknown.code, none.code), (2, 2), "{}{}", unknown.stdout, none.stdout);
    assert_eq!(json_of(&unknown)["error"]["code"], "unknown_runner");
    assert_eq!(json_of(&none)["error"]["code"], "no_runner");
    assert!(engine.scan_posts().is_empty() && empty.scan_posts().is_empty());
}

#[test]
fn wait_exits_with_the_scans_result() {
    let cases = [
        (vec!["queued", "running", "succeeded"], None, 0, "succeeded"),
        (vec!["running", "failed"], None, 1, "scan_failed"),
        (vec!["running", "stopped"], None, 7, "scan_stopped"),
        (vec!["succeeded"], Some("PARTIAL: money ran out; two units were not covered\n"), 9, "partial_scan"),
        (vec!["succeeded"], Some("# Report\n"), 0, "succeeded"),
    ];
    for (statuses, report, code, word) in cases {
        let (engine, runner) = seeded();
        engine.script_new_scan(&statuses);
        if let Some(report) = report {
            engine.set_report(NEW_SCAN_ID, report);
        }

        let output = runner.run(&["scan", "acme/widgets", "--yes", "--wait", "--json"], "");

        assert_eq!(output.code, code, "{statuses:?}: {}{}", output.stdout, output.stderr);
        let shown = json_of(&output);
        assert_eq!(shown["exitCode"], code, "{statuses:?}");
        assert_eq!(shown["scan"]["partial"], json!(code == 9), "{statuses:?}");
        if code == 0 {
            assert_eq!(
                (shown["ok"].clone(), shown["scan"]["status"].clone(), shown["scan"]["costUsd"].clone()),
                (json!(true), json!(word), json!(3.25))
            );
        } else {
            assert_eq!(shown["error"]["code"], word, "{statuses:?}");
        }
    }
}

#[test]
fn wait_text_follows_the_status_and_ends_with_the_result() {
    let (engine, runner) = seeded();
    engine.script_new_scan(&["queued", "running", "succeeded"]);

    let output = runner.run(&["scan", "acme/widgets", "--yes", "--wait"], "");

    assert_eq!(output.code, 0, "{}{}", output.stdout, output.stderr);
    for line in [format!("Scan {NEW_SCAN_ID}: running"), "Scan succeeded. Cost $3.25.".to_string()] {
        assert!(output.stdout.contains(&line), "{line}: {}", output.stdout);
    }
}

#[test]
fn wait_that_times_out_exits_8_and_leaves_the_scan_running() {
    let (engine, runner) = seeded();
    engine.script_new_scan(&["running"]);

    let output = runner.run(&["scan", "acme/widgets", "--yes", "--wait", "--timeout", "1", "--json"], "");

    assert_eq!(output.code, 8, "{}{}", output.stdout, output.stderr);
    let shown = json_of(&output);
    assert_eq!((shown["error"]["code"].clone(), shown["scan"]["status"].clone()), (json!("wait_timeout"), json!("running")));
    assert!(output.stderr.contains("keeps running"), "{}", output.stderr);
    assert!(!engine.scan_posts().is_empty());
}

#[test]
fn run_claims_the_scan_on_this_computer_and_exits_with_its_result() {
    let (engine, mut runner) = seeded();
    paired(&engine, &runner);
    runner.stub_tools(&["claude", "node"]);
    engine.queue_job(job(NEW_SCAN_ID, PLAIN));

    let output = runner.run(&["scan", "acme/widgets", "--run", "--yes"], "");

    assert_eq!(output.code, 0, "{}{}", output.stdout, output.stderr);
    let results = engine.results();
    assert_eq!(results.len(), 1);
    assert_eq!((results[0].0.as_str(), results[0].1["state"].clone()), (NEW_SCAN_ID, json!("succeeded")));
    assert_eq!(engine.scan_posts()[0]["runner_id"], RUNNER_ID);
    assert!(output.stdout.contains("Scan succeeded."), "{}", output.stdout);
}

#[test]
fn run_without_this_computers_runner_exits_3_and_starts_nothing() {
    let (engine, runner) = seeded();

    let output = runner.run(&["scan", "acme/widgets", "--run", "--yes", "--json"], "");

    assert_eq!(output.code, 3, "{}", output.stdout);
    assert_eq!(json_of(&output)["error"]["code"], "unpaired");
    assert!(engine.scan_posts().is_empty());
}

#[test]
fn scan_needs_start_scope_and_a_clean_command_line() {
    let (engine, _) = seeded();
    let mut reader = Runner::new(&engine);
    reader.env.push(("ELISE_TOKEN", engine.grant_cli_access("read")));
    let (_, runner) = seeded();

    let read_only = reader.run(&["scan", "acme/widgets", "--yes", "--json"], "");

    assert_eq!(read_only.code, 3, "{}", read_only.stdout);
    assert_eq!(json_of(&read_only)["error"]["code"], "needs_scope");
    for (args, word) in [
        (vec!["--profile", "fast"], "bad_profile"),
        (vec!["--budget", "0"], "bad_budget"),
        (vec!["--wait", "--timeout", "soon"], "bad_timeout"),
        (vec!["--timeout", "5m"], "timeout_needs_wait"),
    ] {
        let mut command = vec!["scan", "acme/widgets", "--yes", "--json"];
        command.extend(args.iter().copied());
        let output = runner.run(&command, "");
        assert_eq!(output.code, 2, "{args:?}: {}", output.stdout);
        assert_eq!(json_of(&output)["error"]["code"], word, "{args:?}");
    }
}

#[test]
fn a_refused_start_is_an_error_with_its_message() {
    let (engine, runner) = seeded();
    engine.refuse_scan_start(400, "A Scan needs a plan");

    let output = runner.run(&["scan", "acme/widgets", "--yes", "--json"], "");

    assert_eq!(output.code, 1, "{}", output.stdout);
    assert_eq!(json_of(&output)["error"]["message"], "A Scan needs a plan");
}
