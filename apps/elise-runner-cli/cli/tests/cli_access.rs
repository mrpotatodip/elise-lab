mod support;

use serde_json::Value;
use support::{Engine, Runner, USER_CODE};

fn login_with(runner: &Runner, engine: &Engine, run_scans: bool, cli_scope: Option<&str>) {
    let login = runner.start(&["login", "--no-browser"]);
    login.wait_for_output(USER_CODE);
    engine.approve_login_with(run_scans, cli_scope);
    let done = login.finish();
    assert_eq!(done.code, 0, "{}{}", done.stdout, done.stderr);
}

fn status_json(runner: &Runner) -> (i32, Value) {
    let output = runner.run(&["status", "--json"], "");
    let value: Value = serde_json::from_str(&output.stdout).unwrap_or_else(|why| panic!("{why}: {}", output.stdout));
    (output.code, value)
}

fn names_in_home(runner: &Runner) -> Vec<String> {
    let mut names: Vec<String> = runner.home_files().iter().map(|path| path.file_name().unwrap().to_string_lossy().into_owned()).collect();
    names.sort();
    names
}

#[test]
fn both_choices_store_both_credentials_and_status_shows_the_scope() {
    let engine = Engine::start();
    let runner = Runner::new(&engine);

    login_with(&runner, &engine, true, Some("start"));

    assert_eq!(names_in_home(&runner), ["cli-access", "token"]);
    let (code, status) = status_json(&runner);
    assert_eq!(code, 0, "{status}");
    assert_eq!(status["runnerTokenHeld"], true);
    assert_eq!(status["cliAccess"], serde_json::json!({ "held": true, "state": "valid", "scope": "start", "place": "file" }));
    assert_eq!(engine.access_calls(), [engine.access_tokens()[0].clone()]);
}

#[test]
fn a_cli_access_only_login_stores_no_runner_token_and_run_says_so() {
    let engine = Engine::start();
    let runner = Runner::new(&engine);

    login_with(&runner, &engine, false, Some("read"));

    assert_eq!(names_in_home(&runner), ["cli-access"]);
    assert!(engine.tokens().is_empty());
    let (code, status) = status_json(&runner);
    assert_eq!(code, 0, "{status}");
    assert_eq!((status["runnerTokenHeld"].as_bool(), status["cliAccess"]["scope"].as_str()), (Some(false), Some("read")));
    let run = runner.run(&["run", "--once", "--json"], "");
    assert_eq!(run.code, 3, "{}{}", run.stdout, run.stderr);
    assert!(run.stderr.contains("CLI access but no Runner token"), "{}", run.stderr);
}

#[test]
fn a_runner_only_login_stores_no_cli_access() {
    let engine = Engine::start();
    let runner = Runner::new(&engine);

    login_with(&runner, &engine, true, None);

    assert_eq!(names_in_home(&runner), ["token"]);
    let (code, status) = status_json(&runner);
    assert_eq!(code, 0, "{status}");
    assert_eq!(status["cliAccess"]["held"], false);
    assert!(engine.access_calls().is_empty());
}

#[test]
fn unpair_removes_both_and_a_revoked_cli_access_is_forgotten_by_status() {
    let engine = Engine::start();
    let runner = Runner::new(&engine);
    login_with(&runner, &engine, true, Some("read"));

    let done = runner.run(&["unpair", "--json"], "");

    assert_eq!(done.code, 0, "{}{}", done.stdout, done.stderr);
    let value: Value = serde_json::from_str(&done.stdout).unwrap();
    assert_eq!((value["wasPaired"].as_bool(), value["cliAccessRemoved"].as_bool()), (Some(true), Some(true)));
    assert!(names_in_home(&runner).is_empty());
    assert!(engine.live().is_empty());

    login_with(&runner, &engine, false, Some("read"));
    engine.revoke_all_cli_access();
    let (_, status) = status_json(&runner);
    assert_eq!(status["cliAccess"]["state"], "revoked");
    assert!(names_in_home(&runner).is_empty());
}

#[test]
fn elise_token_is_used_and_never_written_or_removed() {
    let engine = Engine::start();
    let granter = Runner::new(&engine);
    login_with(&granter, &engine, false, Some("start"));
    let token = engine.access_tokens()[0].clone();

    let mut given = Runner::new(&engine);
    given.env.push(("ELISE_TOKEN", token.clone()));
    let (code, status) = status_json(&given);
    assert_eq!(code, 0, "{status}");
    assert_eq!(status["cliAccess"], serde_json::json!({ "held": true, "state": "valid", "scope": null, "place": "variable" }));

    let login = given.start(&["login", "--no-browser"]);
    login.wait_for_output(USER_CODE);
    engine.approve_login_with(true, Some("read"));
    let done = login.finish();
    assert_eq!(done.code, 0, "{}{}", done.stdout, done.stderr);
    assert!(done.stderr.contains("ELISE_TOKEN is set"), "{}", done.stderr);
    assert_eq!(names_in_home(&given), ["token"]);

    let unpaired = given.run(&["unpair", "--json"], "");
    assert_eq!(unpaired.code, 0, "{}{}", unpaired.stdout, unpaired.stderr);
    let value: Value = serde_json::from_str(&unpaired.stdout).unwrap();
    assert_eq!(value["cliAccessRemoved"], false);
    assert!(names_in_home(&given).is_empty());
    let (code, status) = status_json(&given);
    assert_eq!((code, status["cliAccess"]["state"].as_str()), (0, Some("valid")));
}
