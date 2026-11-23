mod support;

use support::{Engine, Runner, ACCOUNT_NAME, CODE, RUNNER_NAME, USER_CODE, VERIFICATION_URL};

#[test]
fn login_prints_the_link_and_code_waits_and_saves_the_token_once_approved() {
    let engine = Engine::start();
    let mut runner = Runner::new(&engine);
    let browser = runner.stub_browser();

    let login = runner.start(&["login"]);
    login.wait_for_output(USER_CODE);
    engine.approve_login();
    let done = login.finish();

    assert_eq!(done.code, 0, "{}{}", done.stdout, done.stderr);
    assert!(done.stdout.contains(VERIFICATION_URL), "{}", done.stdout);
    assert!(done.stdout.contains(&format!("Code: {USER_CODE}")), "{}", done.stdout);
    assert!(done.stdout.contains(RUNNER_NAME) && done.stdout.contains(ACCOUNT_NAME), "{}", done.stdout);
    assert_eq!(runner.run(&["status"], "").code, 0);
    assert_eq!(engine.live(), engine.tokens().into_iter().collect());
    browser.wait_for_a_call();
    assert_eq!(browser.opened(), vec![VERIFICATION_URL.to_string()]);
}

#[test]
fn login_tells_the_engine_the_computer_and_the_version_and_nothing_else() {
    let engine = Engine::start();
    let runner = Runner::new(&engine);

    let login = runner.start(&["login", "--no-browser"]);
    login.wait_for_output(USER_CODE);
    engine.approve_login();
    login.finish();

    let starts = engine.login_starts();
    assert_eq!(starts.len(), 1);
    let sent = starts[0].as_object().unwrap();
    let mut keys: Vec<&str> = sent.keys().map(String::as_str).collect();
    keys.sort();
    assert_eq!(keys, ["cpu", "name", "os", "version"]);
    assert_eq!(sent["version"], env!("CARGO_PKG_VERSION"));
    assert_eq!(sent["os"], std::env::consts::OS);
    assert_eq!(sent["cpu"], std::env::consts::ARCH);
    assert!(!sent["name"].as_str().unwrap().is_empty());
}

#[test]
fn login_only_prints_with_no_browser_flag_or_over_ssh() {
    let cases: [(&str, &[&str], Option<&str>); 2] =
        [("flag", &["login", "--no-browser"], None), ("ssh", &["login"], Some("10.0.0.1 5000 10.0.0.2 22"))];
    for (name, args, ssh) in cases {
        let engine = Engine::start();
        let mut runner = Runner::new(&engine);
        let browser = runner.stub_browser();
        if let Some(ssh) = ssh {
            runner.env.push(("SSH_CONNECTION", ssh.to_string()));
        }

        let login = runner.start(args);
        login.wait_for_output(USER_CODE);
        engine.approve_login();
        let done = login.finish();

        assert_eq!(done.code, 0, "{name}: {}{}", done.stdout, done.stderr);
        assert!(done.stdout.contains(VERIFICATION_URL), "{name}: {}", done.stdout);
        std::thread::sleep(std::time::Duration::from_millis(300));
        assert!(browser.opened().is_empty(), "{name}: {:?}", browser.opened());
    }
}

#[test]
fn logging_in_again_says_it_replaces_the_runner_then_revokes_the_old_token() {
    let engine = Engine::start();
    let runner = Runner::new(&engine);
    runner.run(&["pair", CODE, "--yes"], "");

    let login = runner.start(&["login", "--no-browser"]);
    login.wait_for_output(USER_CODE);
    engine.approve_login();
    let done = login.finish();

    assert_eq!(done.code, 0, "{}{}", done.stdout, done.stderr);
    let first_line = done.stdout.lines().next().unwrap_or_default();
    assert!(first_line.contains("Logging in replaces it"), "{}", done.stdout);
    let tokens = engine.tokens();
    assert_eq!(engine.revoked(), vec![tokens[0].clone()]);
    assert_eq!(engine.live(), [tokens[1].clone()].into());
    assert_eq!(runner.run(&["status"], "").code, 0);
}

#[test]
fn login_refuses_when_the_token_comes_from_the_environment() {
    let engine = Engine::start();
    let pairer = Runner::new(&engine);
    let token = pairer.run_allowing_token(&["pair", CODE, "--yes", "--print-token"], "").stdout;
    let mut runner = Runner::new(&engine);
    runner.env.push(("ELISE_RUNNER_TOKEN", token.trim().to_string()));

    let refused = runner.run(&["login", "--no-browser"], "");

    assert_eq!(refused.code, 1, "{}{}", refused.stdout, refused.stderr);
    assert!(refused.stderr.contains("does not manage"), "{}", refused.stderr);
    assert!(engine.login_starts().is_empty());
    assert!(runner.home_files().is_empty(), "{:?}", runner.home_files());
}

#[test]
fn an_engine_without_the_login_routes_gets_the_pair_message() {
    let engine = Engine::start();
    engine.without_login_routes();
    let runner = Runner::new(&engine);

    let failed = runner.run(&["login", "--no-browser"], "");

    assert_eq!(failed.code, 1, "{}{}", failed.stdout, failed.stderr);
    assert_eq!(failed.stderr.trim(), "This Elise does not support login yet; use `elise-runner pair <code>`.");
    assert!(runner.home_files().is_empty(), "{:?}", runner.home_files());
}

// Unix only: it sends INT.
#[cfg(unix)]
#[test]
fn ctrl_c_cancels_the_wait_with_one_plain_line_and_saves_nothing() {
    let engine = Engine::start();
    let runner = Runner::new(&engine);

    let login = runner.start(&["login", "--no-browser"]);
    login.wait_for_output("Waiting for approval");
    engine.wait_for_a_pending_login();
    login.signal("INT");
    let done = login.finish();

    assert_eq!(done.code, 1, "{}{}", done.stdout, done.stderr);
    assert_eq!(done.stderr.trim(), "Login cancelled.");
    assert!(runner.home_files().is_empty(), "{:?}", runner.home_files());
    assert!(engine.live().is_empty());
}

#[test]
fn a_refusal_from_the_check_ends_the_login_with_one_sentence() {
    let engine = Engine::start();
    let runner = Runner::new(&engine);
    let login = runner.start(&["login", "--no-browser"]);
    login.wait_for_output("Waiting for approval");
    engine.refuse_login_checks();

    let done = login.finish();

    assert_eq!(done.code, 1, "{}{}", done.stdout, done.stderr);
    assert_eq!(done.stderr.trim(), "Elise did not accept this login. Run `elise-runner login` again.");
    assert!(runner.home_files().is_empty(), "{:?}", runner.home_files());
}

#[test]
fn a_denial_ends_the_login_with_one_sentence_and_saves_nothing() {
    let engine = Engine::start();
    let runner = Runner::new(&engine);
    engine.script_login_checks(&[r#"{"status":"pending"}"#, r#"{"status":"denied"}"#]);

    let done = runner.run(&["login", "--no-browser"], "");

    assert_eq!(done.code, 1, "{}{}", done.stdout, done.stderr);
    assert_eq!(done.stderr.trim(), "The request was denied in Elise.");
    assert!(runner.home_files().is_empty(), "{:?}", runner.home_files());
    assert!(engine.live().is_empty());
}

#[test]
fn an_expired_answer_ends_the_login_with_one_sentence_and_saves_nothing() {
    let engine = Engine::start();
    let runner = Runner::new(&engine);
    engine.script_login_checks(&[r#"{"status":"expired"}"#]);

    let done = runner.run(&["login", "--no-browser"], "");

    assert_eq!(done.code, 1, "{}{}", done.stdout, done.stderr);
    assert_eq!(done.stderr.trim(), "The code expired; run `elise-runner login` again.");
    assert!(runner.home_files().is_empty(), "{:?}", runner.home_files());
}

#[test]
fn the_wait_ends_at_the_expiry_the_engine_named_even_if_it_keeps_answering_pending() {
    let engine = Engine::start();
    let runner = Runner::new(&engine);
    engine.login_expires_at("2001-01-01T00:00:00.000Z");

    let done = runner.run(&["login", "--no-browser"], "");

    assert_eq!(done.code, 1, "{}{}", done.stdout, done.stderr);
    assert_eq!(done.stderr.trim(), "The code expired; run `elise-runner login` again.");
    assert!(runner.home_files().is_empty(), "{:?}", runner.home_files());
}

#[test]
fn a_slow_down_answer_makes_the_next_check_wait_the_interval_the_engine_named() {
    let engine = Engine::start();
    let runner = Runner::new(&engine);
    engine.script_login_checks(&[r#"{"status":"slow_down","interval":2}"#, r#"{"status":"pending"}"#]);

    let login = runner.start(&["login", "--no-browser"]);
    login.wait_for_output("Waiting for approval");
    while engine.login_checks().len() < 2 {
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    engine.approve_login();
    let done = login.finish();

    assert_eq!(done.code, 0, "{}{}", done.stdout, done.stderr);
    let checks = engine.login_checks();
    assert!(checks[1].duration_since(checks[0]) >= std::time::Duration::from_millis(1900), "{:?}", checks[1].duration_since(checks[0]));
}

#[test]
fn the_help_lists_login_and_its_flag() {
    let engine = Engine::start();
    let runner = Runner::new(&engine);

    let help = runner.run(&["--help"], "");

    assert!(help.stdout.contains("elise-runner login [--no-browser]"), "{}", help.stdout);
    assert!(help.stdout.contains("--no-browser  Only print"), "{}", help.stdout);
}
