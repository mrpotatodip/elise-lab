mod support;

use support::{Engine, Runner, CODE};

const NO_LOGIN: &str = "fatal: could not read Username for 'https://HOST': terminal prompts disabled\n";
const REJECTED: &str = "remote: Invalid username or password.\nfatal: Authentication failed for 'https://HOST/doctor/probe.git/'\n";

fn paired(engine: &Engine) -> Runner {
    let runner = Runner::new(engine);
    let paired = runner.run(&["pair", CODE, "--yes"], "");
    assert_eq!(paired.code, 0, "{}{}", paired.stdout, paired.stderr);
    runner
}

fn list_gitlab_host(runner: &Runner) {
    std::fs::write(runner.home.join("settings.json"), r#"{"gitlabHosts":["git.acme.dev"]}"#).unwrap();
}

#[test]
fn doctor_with_everything_in_order_prints_a_pass_line_per_check_and_exits_0() {
    let engine = Engine::start();
    let mut runner = paired(&engine);
    list_gitlab_host(&runner);
    let stubs = runner.stub_tools(&["claude", "node"]);

    let output = runner.run(&["doctor", "github.com"], "");

    assert_eq!(output.code, 0, "{}{}", output.stdout, output.stderr);
    let lines: Vec<&str> = output.stdout.lines().collect();
    let checks: &[&str] = if cfg!(windows) {
        &["git", "git for windows", "claude", "node", "paired", "github.com", "git.acme.dev"]
    } else {
        &["git", "claude", "paired", "github.com", "git.acme.dev"]
    };
    assert_eq!(lines.len(), checks.len(), "{}", output.stdout);
    for (line, check) in lines.iter().zip(checks) {
        assert!(line.starts_with("pass") && line.contains(check), "{check}: {line}");
    }
    let calls = stubs.git_calls();
    assert!(calls.contains("https://github.com/") && calls.contains("https://git.acme.dev/"), "{calls}");
    assert!(!calls.contains("clone"), "{calls}");
}

#[test]
fn doctor_without_a_host_to_check_checks_github_and_gitlab_com() {
    let engine = Engine::start();
    let mut runner = paired(&engine);
    let stubs = runner.stub_tools(&["claude"]);

    let output = runner.run(&["doctor"], "");

    assert_eq!(output.code, 0, "{}{}", output.stdout, output.stderr);
    let calls = stubs.git_calls();
    assert!(calls.contains("https://github.com/") && calls.contains("https://gitlab.com/"), "{calls}");
    assert!(output.stdout.contains("pass  github.com") && output.stdout.contains("pass  gitlab.com"), "{}", output.stdout);
}

#[test]
fn a_host_git_cannot_reach_fails_with_the_tail_of_gits_message() {
    let engine = Engine::start();
    let mut runner = paired(&engine);
    let stubs = runner.stub_tools(&["claude"]);
    stubs.fail_branch_list("fatal: unable to access 'https://github.com/doctor/probe.git/': Could not resolve host: github.com\n");

    let output = runner.run(&["doctor", "github.com"], "");

    assert_eq!(output.code, 1, "{}{}", output.stdout, output.stderr);
    assert!(output.stdout.contains("FAIL  github.com") && output.stdout.contains("Could not resolve host"), "{}", output.stdout);
}

#[test]
fn a_host_that_answers_not_found_for_the_probe_path_passes() {
    for stderr in [
        "remote: Repository not found.\nfatal: repository 'https://github.com/doctor/probe/' not found\n",
        "remote: The project you were looking for could not be found or you don't have permission to view it.\nfatal: repository 'https://gitlab.com/doctor/probe.git/' not found\n",
    ] {
        let engine = Engine::start();
        let mut runner = paired(&engine);
        let stubs = runner.stub_tools(&["claude"]);
        stubs.fail_branch_list(stderr);

        let output = runner.run(&["doctor", "github.com"], "");

        assert_eq!(output.code, 0, "{}{}", output.stdout, output.stderr);
        assert!(output.stdout.contains("pass  github.com"), "{}", output.stdout);
    }
}

#[test]
fn a_failing_check_prints_its_fix_the_others_still_run_and_the_exit_is_1() {
    for (broken, fix) in [
        ("git", "https://git-scm.com"),
        ("claude", "claude auth login"),
        ("paired", "elise-runner pair"),
        ("github.com", "gh auth login"),
        ("gitlab.com", "glab auth login"),
        ("git.acme.dev", "credential helper"),
        ("git.unlisted.example", "gitlabHosts"),
    ] {
        let engine = Engine::start();
        let mut runner = if broken == "paired" { Runner::new(&engine) } else { paired(&engine) };
        if !broken.contains('.') || broken == "git.acme.dev" {
            list_gitlab_host(&runner);
        }
        let stubs = if broken == "git" { runner.stub_tools_without_git(&["claude"]) } else { runner.stub_tools(&["claude"]) };
        if broken == "claude" {
            stubs.sign_claude_out();
        }
        if broken.contains('.') {
            stubs.fail_branch_list(&NO_LOGIN.replace("HOST", broken));
        }
        let args = if broken.contains('.') { vec!["doctor", broken] } else { vec!["doctor"] };

        let output = runner.run(&args, "");

        assert_eq!(output.code, 1, "{broken}: {}{}", output.stdout, output.stderr);
        let failed: Vec<&str> = output.stdout.lines().filter(|line| line.starts_with("FAIL")).collect();
        let expected_failures = if cfg!(windows) && broken == "git" { 2 } else { 1 };
        assert_eq!(failed.len(), expected_failures, "{broken}: {}", output.stdout);
        let line = failed[0];
        assert!(line.contains(broken) && line.contains(fix), "{broken}: {line}");
        assert!(output.stdout.lines().any(|line| line.starts_with("pass")), "{broken}: {}", output.stdout);
    }
}

#[test]
fn a_saved_login_a_host_rejects_is_named_as_rejected() {
    let engine = Engine::start();
    let mut runner = paired(&engine);
    let stubs = runner.stub_tools(&["claude"]);
    stubs.fail_branch_list(&REJECTED.replace("HOST", "github.com"));

    let output = runner.run(&["doctor", "github.com"], "");

    assert_eq!(output.code, 1, "{}{}", output.stdout, output.stderr);
    assert!(output.stdout.contains("rejected") && output.stdout.contains("gh auth login"), "{}", output.stdout);
}

#[test]
fn a_git_token_is_used_for_the_checked_host_only_and_leaves_no_helper_behind() {
    let engine = Engine::start();
    let mut runner = paired(&engine);
    let stubs = runner.stub_tools(&["claude"]);
    runner.env.push(("ELISE_GIT_TOKEN", "git-token-5e6f".to_string()));

    let output = runner.run(&["doctor", "github.com"], "");

    assert_eq!(output.code, 0, "{}{}", output.stdout, output.stderr);
    assert!(!output.stdout.contains("git-token-5e6f") && !output.stderr.contains("git-token-5e6f"));
    assert_eq!(
        stubs.git_helper_answers().lines().filter(|line| line.contains("git-token-5e6f")).count(),
        1,
        "{}",
        stubs.git_helper_answers()
    );
    assert!(stubs.git_helper_answers().contains("github.com password=git-token-5e6f"), "{}", stubs.git_helper_answers());
    let left: Vec<_> = std::fs::read_dir(&stubs.tmp).unwrap().map(|entry| entry.unwrap().file_name()).collect();
    assert!(left.is_empty(), "{left:?}");
}

#[test]
fn doctor_takes_no_flags() {
    let engine = Engine::start();
    let runner = Runner::new(&engine);

    let output = runner.run(&["doctor", "--fix"], "");

    assert_eq!(output.code, 2, "{}{}", output.stdout, output.stderr);
}
