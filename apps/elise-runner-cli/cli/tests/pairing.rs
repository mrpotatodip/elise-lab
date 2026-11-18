// `elise-runner pair`, `status` and `unpair`, run as a process against a stub engine.

mod support;

use support::{Engine, Runner, ACCOUNT_NAME, CODE, RUNNER_NAME};

#[test]
fn pair_with_yes_saves_the_token_and_status_reports_connected() {
    let engine = Engine::start();
    let runner = Runner::new(&engine);

    let paired = runner.run(&["pair", CODE, "--yes"], "");
    assert_eq!(paired.code, 0, "{}{}", paired.stdout, paired.stderr);

    let status = runner.run(&["status"], "");
    assert_eq!(status.code, 0, "{}{}", status.stdout, status.stderr);
    assert!(status.stdout.contains("connected"), "{}", status.stdout);
    assert!(status.stdout.contains(RUNNER_NAME), "{}", status.stdout);
    assert!(status.stdout.contains(ACCOUNT_NAME), "{}", status.stdout);
    assert_eq!(engine.live(), engine.tokens().into_iter().collect());
}

#[test]
fn pair_answered_no_revokes_the_token_and_saves_nothing() {
    let engine = Engine::start();
    let runner = Runner::new(&engine);

    let declined = runner.run(&["pair", CODE], "n\n");

    assert_eq!(declined.code, 1, "{}{}", declined.stdout, declined.stderr);
    assert!(declined.stdout.contains(ACCOUNT_NAME) && declined.stdout.contains(RUNNER_NAME), "{}", declined.stdout);
    assert_eq!(engine.revoked(), engine.tokens());
    assert!(engine.live().is_empty());
    assert!(runner.home_files().is_empty(), "{:?}", runner.home_files());
}

#[test]
fn pairing_again_saves_the_new_token_and_revokes_the_old_one() {
    let engine = Engine::start();
    let runner = Runner::new(&engine);
    runner.run(&["pair", CODE, "--yes"], "");

    let again = runner.run(&["pair", CODE, "--yes"], "");

    assert_eq!(again.code, 0, "{}{}", again.stdout, again.stderr);
    assert!(again.stdout.contains("replaces"), "{}", again.stdout);
    let tokens = engine.tokens();
    assert_eq!(engine.revoked(), vec![tokens[0].clone()]);
    assert_eq!(engine.live(), [tokens[1].clone()].into());
    assert_eq!(runner.run(&["status"], "").code, 0);
}

#[test]
fn pairing_again_names_the_old_runner_when_its_token_cannot_be_revoked() {
    let engine = Engine::start();
    let runner = Runner::new(&engine);
    runner.run(&["pair", CODE, "--yes"], "");
    engine.fail_revokes();

    let again = runner.run(&["pair", CODE, "--yes"], "");

    assert_eq!(again.code, 0, "{}{}", again.stdout, again.stderr);
    assert!(again.stderr.contains("Could not reach Elise to revoke"), "{}", again.stderr);
    assert!(again.stderr.contains(&format!("\"{RUNNER_NAME}\"")), "{}", again.stderr);
    assert_eq!(engine.live(), engine.tokens().into_iter().collect());
}

#[test]
fn pair_with_print_token_prints_the_token_once_with_a_warning_and_saves_nothing() {
    let engine = Engine::start();
    let runner = Runner::new(&engine);

    let printed = runner.run_allowing_token(&["pair", CODE, "--yes", "--print-token"], "");

    assert_eq!(printed.code, 0, "{}{}", printed.stdout, printed.stderr);
    assert_eq!(printed.stdout, format!("{}\n", engine.tokens()[0]));
    assert!(!printed.stderr.contains(&engine.tokens()[0]), "{}", printed.stderr);
    assert!(printed.stderr.contains("credential"), "{}", printed.stderr);
    assert!(printed.stderr.contains("shell history"), "{}", printed.stderr);
    assert!(runner.home_files().is_empty(), "{:?}", runner.home_files());
    assert_eq!(engine.live(), engine.tokens().into_iter().collect());
}

#[test]
fn an_invalid_or_expired_code_fails_with_a_plain_message() {
    let engine = Engine::start();
    let runner = Runner::new(&engine);

    let failed = runner.run(&["pair", "NOT-A-CODE", "--yes"], "");

    assert_eq!(failed.code, 1);
    assert!(failed.stderr.contains("wrong, already used or expired"), "{}", failed.stderr);
    assert!(runner.home_files().is_empty(), "{:?}", runner.home_files());
}

#[test]
fn status_reports_each_state_with_its_exit_code() {
    // (state, how to get there, exit code, what status prints)
    let cases: [(&str, fn(&Engine, &mut Runner), i32, &str); 4] = [
        ("connected", |_, runner| { runner.run(&["pair", CODE, "--yes"], ""); }, 0, "connected"),
        ("unpaired", |_, _| {}, 3, "unpaired"),
        ("revoked", |engine, runner| {
            runner.run(&["pair", CODE, "--yes"], "");
            engine.remove_all_runners();
        }, 4, "revoked"),
        ("offline", |_, runner| {
            runner.run(&["pair", CODE, "--yes"], "");
            runner.url = Engine::unreachable_url();
        }, 5, "offline"),
    ];
    for (state, arrange, code, text) in cases {
        let engine = Engine::start();
        let mut runner = Runner::new(&engine);
        arrange(&engine, &mut runner);

        let status = runner.run(&["status"], "");

        assert_eq!(status.code, code, "{state}: {}{}", status.stdout, status.stderr);
        assert!(status.stdout.starts_with(text), "{state}: {}", status.stdout);
    }
}

#[test]
fn a_token_elise_rejects_is_forgotten() {
    let engine = Engine::start();
    let runner = Runner::new(&engine);
    runner.run(&["pair", CODE, "--yes"], "");
    engine.remove_all_runners();

    assert_eq!(runner.run(&["status"], "").code, 4);
    assert_eq!(runner.run(&["status"], "").code, 3);
    assert!(runner.home_files().is_empty(), "{:?}", runner.home_files());
}

#[test]
fn unpair_tells_elise_then_forgets_the_token() {
    let engine = Engine::start();
    let runner = Runner::new(&engine);
    runner.run(&["pair", CODE, "--yes"], "");

    let unpaired = runner.run(&["unpair"], "");

    assert_eq!(unpaired.code, 0, "{}{}", unpaired.stdout, unpaired.stderr);
    assert_eq!(engine.revoked(), engine.tokens());
    assert_eq!(runner.run(&["status"], "").code, 3);
}

#[test]
fn unpair_keeps_the_token_when_elise_cannot_be_reached() {
    let engine = Engine::start();
    let mut runner = Runner::new(&engine);
    runner.run(&["pair", CODE, "--yes"], "");
    let reachable = std::mem::replace(&mut runner.url, Engine::unreachable_url());

    let unpaired = runner.run(&["unpair"], "");

    assert_eq!(unpaired.code, 5, "{}{}", unpaired.stdout, unpaired.stderr);
    runner.url = reachable;
    assert_eq!(runner.run(&["status"], "").code, 0);
    assert!(engine.revoked().is_empty());
}

#[test]
fn a_token_from_the_environment_is_used_but_never_managed() {
    let engine = Engine::start();
    let pairer = Runner::new(&engine);
    let token = pairer.run_allowing_token(&["pair", CODE, "--yes", "--print-token"], "").stdout;
    let mut runner = Runner::new(&engine);
    runner.env.push(("ELISE_RUNNER_TOKEN", token.trim().to_string()));

    let status = runner.run(&["status"], "");
    assert_eq!(status.code, 0, "{}{}", status.stdout, status.stderr);
    assert!(status.stdout.contains("ELISE_RUNNER_TOKEN"), "{}", status.stdout);

    for refused in [&["pair", CODE, "--yes"][..], &["unpair"][..]] {
        let output = runner.run(refused, "");
        assert_eq!(output.code, 1, "{refused:?}: {}{}", output.stdout, output.stderr);
        assert!(output.stderr.contains("does not manage"), "{refused:?}: {}", output.stderr);
    }
    assert_eq!(engine.tokens().len(), 1);
    assert!(engine.revoked().is_empty());
    assert!(runner.home_files().is_empty(), "{:?}", runner.home_files());
}

#[test]
fn with_elise_runner_home_the_token_is_in_an_owner_only_file_there() {
    use std::os::unix::fs::PermissionsExt;
    let engine = Engine::start();
    let runner = Runner::new(&engine);

    runner.run(&["pair", CODE, "--yes"], "");

    let files = runner.home_files();
    assert_eq!(files.len(), 1, "{files:?}");
    let mode = std::fs::metadata(&files[0]).unwrap().permissions().mode();
    assert_eq!(mode & 0o777, 0o600, "{mode:o}");
    assert_eq!(std::fs::read_to_string(&files[0]).unwrap(), engine.tokens()[0]);
    let status = runner.run(&["status"], "");
    assert!(status.stdout.contains(&files[0].display().to_string()), "{}", status.stdout);
}

#[test]
fn the_command_line_is_checked() {
    // (arguments, exit code, text on stdout or stderr)
    let cases: [(&[&str], i32, &str); 6] = [
        (&["--help"], 0, "Exit codes:"),
        (&["--version"], 0, concat!("elise-runner ", env!("CARGO_PKG_VERSION"))),
        (&[], 2, "no command given"),
        (&["pair"], 2, "needs the pairing code"),
        (&["status", "--yes"], 2, "does not take `--yes`"),
        (&["scan"], 2, "unknown command"),
    ];
    let engine = Engine::start();
    let runner = Runner::new(&engine);
    for (args, code, text) in cases {
        let output = runner.run(args, "");
        assert_eq!(output.code, code, "{args:?}");
        assert!(output.stdout.contains(text) || output.stderr.contains(text), "{args:?}: {}{}", output.stdout, output.stderr);
    }
}
