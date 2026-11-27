mod support;

use serde_json::Value;
use support::{Engine, Output, Runner, ACCOUNT_NAME, CODE, RUNNER_NAME};

fn json_of(output: &Output) -> Value {
    assert!(
        !output.stdout.contains("elise-test-token") && !output.stderr.contains("elise-test-token"),
        "a token-shaped value in the output:\n{}\n{}",
        output.stdout,
        output.stderr
    );
    let value: Value =
        serde_json::from_str(&output.stdout).unwrap_or_else(|why| panic!("stdout is not one JSON object ({why}): {}", output.stdout));
    assert_eq!(value["schemaVersion"], 1, "{value}");
    assert_eq!(value["exitCode"], output.code, "{value}");
    assert_eq!(value["ok"], output.code == 0, "{value}");
    if output.code != 0 {
        let error = &value["error"];
        for key in ["code", "message", "next"] {
            assert!(error[key].as_str().is_some_and(|text| !text.is_empty()), "error.{key} in {value}");
        }
    }
    value
}

fn failure_code(output: &Output, exit: i32, code: &str) -> Value {
    assert_eq!(output.code, exit, "{}{}", output.stdout, output.stderr);
    let value = json_of(output);
    assert_eq!(value["error"]["code"], code, "{value}");
    value
}

fn paired(engine: &Engine) -> Runner {
    let runner = Runner::new(engine);
    let done = runner.run(&["pair", CODE, "--yes"], "");
    assert_eq!(done.code, 0, "{}{}", done.stdout, done.stderr);
    runner
}

#[test]
fn pair_json_prints_one_object_and_keeps_prose_on_stderr() {
    let engine = Engine::start();
    let runner = Runner::new(&engine);

    let output = runner.run(&["pair", CODE, "--yes", "--json"], "");

    assert_eq!(output.code, 0, "{}{}", output.stdout, output.stderr);
    let value = json_of(&output);
    assert_eq!(value["account"], ACCOUNT_NAME);
    assert_eq!(value["runner"], RUNNER_NAME);
    assert!(value.get("token").is_none(), "{value}");
    assert!(output.stderr.contains("Paired as"), "{}", output.stderr);
}

#[test]
fn pair_print_token_json_holds_the_token_in_the_one_named_field() {
    let engine = Engine::start();
    let runner = Runner::new(&engine);

    let output = runner.run_allowing_token(&["pair", CODE, "--yes", "--print-token", "--json"], "");

    assert_eq!(output.code, 0, "{}{}", output.stdout, output.stderr);
    let value: Value = serde_json::from_str(&output.stdout).expect("one JSON object");
    assert_eq!(value["token"], engine.tokens()[0].as_str());
    assert_eq!(value["exitCode"], 0);
    assert_eq!(output.stdout.matches(engine.tokens()[0].as_str()).count(), 1);
    assert!(!output.stderr.contains(engine.tokens()[0].as_str()));
}

#[test]
fn pair_failures_are_json_with_the_exit_code() {
    let engine = Engine::start();
    let runner = Runner::new(&engine);
    failure_code(&runner.run(&["pair", "WRONG", "--yes", "--json"], ""), 1, "invalid_code");
    failure_code(&runner.run(&["pair", CODE, "--json"], "n\n"), 1, "declined");
    failure_code(&runner.run(&["pair", "--json"], ""), 2, "usage");

    let mut offline = Runner::new(&engine);
    offline.url = Engine::unreachable_url();
    failure_code(&offline.run(&["pair", CODE, "--yes", "--json"], ""), 5, "offline");

    let mut given = Runner::new(&engine);
    given.env.push(("ELISE_RUNNER_TOKEN", "given-by-the-environment".to_string()));
    failure_code(&given.run(&["pair", CODE, "--yes", "--json"], ""), 1, "read_only_token");
}

#[test]
fn status_json_says_each_state_with_its_exit_code() {
    let engine = Engine::start();
    let mut empty_tmp = Runner::new(&engine);
    empty_tmp.stub_tools(&[]);
    let unpaired = empty_tmp.run(&["status", "--json"], "");
    let value = failure_code(&unpaired, 3, "unpaired");
    assert_eq!(value["state"], "unpaired");
    assert_eq!(value["folders"], serde_json::json!([]));

    let mut runner = paired(&engine);
    let connected = runner.run(&["status", "--json"], "");
    assert_eq!(connected.code, 0, "{}{}", connected.stdout, connected.stderr);
    let value = json_of(&connected);
    assert_eq!(
        (value["state"].as_str(), value["runner"].as_str(), value["account"].as_str()),
        (Some("connected"), Some(RUNNER_NAME), Some(ACCOUNT_NAME))
    );
    assert!(value["tokenPlace"].is_string(), "{value}");

    let real_url = std::mem::replace(&mut runner.url, Engine::unreachable_url());
    let value = failure_code(&runner.run(&["status", "--json"], ""), 5, "offline");
    assert_eq!(value["state"], "offline");

    runner.url = real_url;
    engine.remove_all_runners();
    let value = failure_code(&runner.run(&["status", "--json"], ""), 4, "revoked");
    assert_eq!(value["state"], "revoked");
}

#[test]
fn unpair_json_succeeds_paired_or_not_and_fails_offline_or_read_only() {
    let engine = Engine::start();
    let runner = Runner::new(&engine);
    let nothing = runner.run(&["unpair", "--json"], "");
    assert_eq!(nothing.code, 0, "{}{}", nothing.stdout, nothing.stderr);
    assert_eq!(json_of(&nothing)["wasPaired"], false);

    let mut runner = paired(&engine);
    let real_url = std::mem::replace(&mut runner.url, Engine::unreachable_url());
    failure_code(&runner.run(&["unpair", "--json"], ""), 5, "offline");

    runner.url = real_url;
    let done = runner.run(&["unpair", "--json"], "");
    assert_eq!(done.code, 0, "{}{}", done.stdout, done.stderr);
    assert_eq!(json_of(&done)["wasPaired"], true);
    assert!(engine.live().is_empty());

    runner.env.push(("ELISE_RUNNER_TOKEN", "given-by-the-environment".to_string()));
    failure_code(&runner.run(&["unpair", "--json"], ""), 1, "read_only_token");
}

#[test]
fn login_json_succeeds_after_approval_and_fails_in_each_way() {
    let engine = Engine::start();
    let runner = Runner::new(&engine);
    let running = runner.start(&["login", "--json", "--no-browser"]);
    running.wait_for_error_output(support::USER_CODE);
    engine.approve_login();
    let output = running.finish();
    assert_eq!(output.code, 0, "{}{}", output.stdout, output.stderr);
    let value = json_of(&output);
    assert_eq!((value["runner"].as_str(), value["account"].as_str()), (Some(RUNNER_NAME), Some(ACCOUNT_NAME)));
    assert!(output.stderr.contains("Open this link"), "{}", output.stderr);

    let refused_engine = Engine::start();
    refused_engine.refuse_login_checks();
    failure_code(&Runner::new(&refused_engine).run(&["login", "--json", "--no-browser"], ""), 1, "refused");

    let old = Engine::start();
    old.without_login_routes();
    failure_code(&Runner::new(&old).run(&["login", "--json", "--no-browser"], ""), 1, "unsupported");

    let mut offline = Runner::new(&engine);
    offline.url = Engine::unreachable_url();
    failure_code(&offline.run(&["login", "--json", "--no-browser"], ""), 5, "offline");

    let mut given = Runner::new(&engine);
    given.env.push(("ELISE_RUNNER_TOKEN", "given-by-the-environment".to_string()));
    failure_code(&given.run(&["login", "--json", "--no-browser"], ""), 1, "read_only_token");
}

#[test]
fn doctor_json_lists_each_check_and_fails_with_exit_1() {
    let engine = Engine::start();
    let mut runner = paired(&engine);
    let stubs = runner.stub_tools(&["claude", "node"]);

    let output = runner.run(&["doctor", "github.com", "--json"], "");

    assert_eq!(output.code, 0, "{}{}", output.stdout, output.stderr);
    let checks = json_of(&output)["checks"].as_array().unwrap().clone();
    assert!(checks.iter().all(|check| check["status"] == "pass" && check["name"].is_string() && check["detail"].is_string()), "{checks:?}");
    assert!(checks.iter().any(|check| check["name"] == "github.com"), "{checks:?}");
    assert!(output.stderr.contains("pass  git"), "{}", output.stderr);

    stubs.sign_claude_out();
    let broken = runner.run(&["doctor", "github.com", "--json"], "");
    let value = failure_code(&broken, 1, "check_failed");
    let failed: Vec<&Value> = value["checks"].as_array().unwrap().iter().filter(|check| check["status"] == "fail").collect();
    assert_eq!(failed.len(), 1, "{value}");
    assert_eq!(failed[0]["name"], "claude");
}

#[test]
fn resume_json_says_whether_a_kept_folder_can_be_resumed() {
    let engine = Engine::start();
    let runner = paired(&engine);

    let value = failure_code(&runner.run(&["resume", "scan_99", "--json"], ""), 1, "not_resumable");

    assert_eq!((value["scanId"].as_str(), value["resumable"].as_bool()), (Some("scan_99"), Some(false)));
    failure_code(&runner.run(&["resume", "--json"], ""), 2, "usage");
}

#[test]
fn a_kept_folder_shows_in_status_and_resume_json() {
    let engine = Engine::start();
    let mut runner = paired(&engine);
    let stubs = runner.stub_tools(&["claude", "node"]);
    engine.queue_job(support::job("scan_30", ["phase=recon cost=1.5", "phase=hunt stop=crash", "phase=check", "phase=report"]));
    assert_eq!(runner.run(&["run", "--once"], "").code, 1);

    let status = json_of(&runner.run(&["status", "--json"], ""));
    let resume = runner.run(&["resume", "scan_30", "--json"], "");

    assert_eq!(
        status["folders"],
        serde_json::json!([{ "scanId": "scan_30", "path": stubs.work_folder("scan_30").display().to_string(), "resumable": true, "phases": ["recon"] }])
    );
    assert_eq!(resume.code, 0, "{}{}", resume.stdout, resume.stderr);
    let value = json_of(&resume);
    assert_eq!((value["resumable"].as_bool(), value["phases"].clone()), (Some(true), serde_json::json!(["recon"])));
}
