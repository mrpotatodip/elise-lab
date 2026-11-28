mod support;

use serde_json::{json, Value};
use std::process::Command;
use support::{branch_json, repo_json, verdict_json, Engine, Output, Runner, USER_CODE};

const WIDGETS: &str = "a1111111-1111-4111-8111-111111111111";
const GADGETS: &str = "a2222222-2222-4222-8222-222222222222";
const CLOUD: &str = "a3333333-3333-4333-8333-333333333333";
const SHARED_COM: &str = "a4444444-4444-4444-8444-444444444444";
const SHARED_SH: &str = "a5555555-5555-4555-8555-555555555555";
const PROJECT: &str = "b1111111-1111-4111-8111-111111111111";
const COMMIT: &str = "0123456789abcdef0123456789abcdef01234567";

fn seeded(scope: &str) -> (Engine, Runner) {
    let engine = Engine::start();
    let mut widgets = repo_json(WIDGETS, "github", None, "acme/widgets");
    widgets["isPrivate"] = json!(true);
    widgets["projectId"] = json!(PROJECT);
    widgets["branchNames"] = json!(["main", "dev"]);
    widgets["lastScanId"] = json!("000000001-aaaa");
    widgets["lastScanStatus"] = json!("succeeded");
    widgets["lastScanAt"] = json!("2026-11-20T10:00:00.000Z");
    engine.add_repo(widgets);
    engine.add_repo(repo_json(GADGETS, "github", None, "acme/gadgets"));
    engine.add_repo(repo_json(CLOUD, "gitlab", Some("gitlab.com"), "grp/cloud"));
    engine.add_repo(repo_json(SHARED_COM, "gitlab", Some("gitlab.com"), "shared/app"));
    engine.add_repo(repo_json(SHARED_SH, "gitlab-sh", Some("git.example.com"), "shared/app"));
    engine.add_project(json!({ "id": PROJECT, "name": "Core platform", "createdAt": "2026-01-01T00:00:00.000Z" }));
    engine.set_branches(
        WIDGETS,
        vec![branch_json("main", true, Some("000000001-aaaa"), Some(COMMIT)), branch_json("dev", false, None, None)],
    );
    engine.set_branches(GADGETS, vec![branch_json("main", true, None, None)]);
    engine.set_verdict(WIDGETS, COMMIT, verdict_json(COMMIT, "cannot_tell"));
    let mut runner = Runner::new(&engine);
    runner.env.push(("ELISE_TOKEN", engine.grant_cli_access(scope)));
    (engine, runner)
}

fn json_of(output: &Output) -> Value {
    serde_json::from_str(&output.stdout).unwrap_or_else(|why| panic!("{why}: {}{}", output.stdout, output.stderr))
}

fn login_with_read(runner: &Runner, engine: &Engine) {
    let login = runner.start(&["login", "--no-browser"]);
    login.wait_for_output(USER_CODE);
    engine.approve_login_with(false, Some("read"));
    let done = login.finish();
    assert_eq!(done.code, 0, "{}{}", done.stdout, done.stderr);
}

#[test]
fn repos_json_lists_each_repo_with_project_provider_private_branches_and_last_scan() {
    let (_engine, runner) = seeded("read");

    let output = runner.run(&["repos", "--json"], "");

    assert_eq!(output.code, 0, "{}", output.stderr);
    let shown = json_of(&output);
    assert_eq!((shown["schemaVersion"].clone(), shown["ok"].clone(), shown["exitCode"].clone()), (json!(1), json!(true), json!(0)));
    let repos = shown["repos"].as_array().unwrap();
    assert_eq!(repos.len(), 5);
    assert_eq!(
        repos[0],
        json!({
            "id": WIDGETS,
            "name": "acme/widgets",
            "provider": "github",
            "host": "github.com",
            "url": "https://github.com/acme/widgets",
            "project": "Core platform",
            "private": true,
            "defaultBranch": "main",
            "branches": ["main", "dev"],
            "lastScan": { "id": "000000001-aaaa", "status": "succeeded", "at": "2026-11-20T10:00:00.000Z" },
        })
    );
    assert_eq!((repos[1]["project"].clone(), repos[1]["lastScan"].clone()), (Value::Null, Value::Null));
    assert_eq!((repos[2]["name"].clone(), repos[2]["provider"].clone()), (json!("gitlab:grp/cloud"), json!("gitlab")));
    assert_eq!(repos[4]["provider"], "gitlab-sh");
}

#[test]
fn repos_prints_one_line_per_repo() {
    let (_engine, runner) = seeded("read");

    let output = runner.run(&["repos"], "");

    assert_eq!(output.code, 0, "{}", output.stderr);
    let lines: Vec<&str> = output.stdout.lines().collect();
    assert_eq!(lines.len(), 6, "{}", output.stdout);
    assert!(lines[0].starts_with("REPO") && lines[0].contains("LAST SCAN"), "{}", lines[0]);
    for wanted in ["acme/widgets", "Core platform", "github", "private", "main, dev", "succeeded 2026-11-20"] {
        assert!(lines[1].contains(wanted), "{wanted}: {}", lines[1]);
    }
    assert!(lines[3].contains("gitlab:grp/cloud") && lines[3].contains("public"), "{}", lines[3]);
}

#[test]
fn a_repo_is_named_by_url_owner_name_gitlab_path_or_id() {
    let (_engine, runner) = seeded("read");
    let cases = [
        ("acme/widgets", WIDGETS),
        ("Acme/Widgets", WIDGETS),
        ("https://github.com/acme/widgets", WIDGETS),
        ("https://github.com/acme/widgets.git", WIDGETS),
        ("git@github.com:acme/widgets.git", WIDGETS),
        ("github.com/acme/widgets/tree/main", WIDGETS),
        (WIDGETS, WIDGETS),
        ("gitlab:grp/cloud", CLOUD),
        ("https://gitlab.com/grp/cloud", CLOUD),
        ("https://git.example.com/shared/app", SHARED_SH),
        ("https://gitlab.com/shared/app", SHARED_COM),
    ];

    for (name, id) in cases {
        let output = runner.run(&["repo", name, "--json"], "");

        assert_eq!(output.code, 0, "{name}: {}{}", output.stdout, output.stderr);
        assert_eq!(json_of(&output)["repo"]["id"], id, "{name}");
    }
}

#[test]
fn a_dot_names_the_repo_of_the_checkout() {
    let (_engine, mut runner) = seeded("read");
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
    git(&["init", "-q"]);
    runner.cwd = Some(folder.clone());

    let not_yet = runner.run(&["repo", ".", "--json"], "");
    git(&["remote", "add", "origin", "git@github.com:acme/gadgets.git"]);
    let named = runner.run(&["repo", ".", "--json"], "");

    assert_eq!(not_yet.code, 2, "{}", not_yet.stdout);
    assert_eq!(json_of(&not_yet)["error"]["code"], "not_a_checkout");
    assert_eq!(named.code, 0, "{}{}", named.stdout, named.stderr);
    assert_eq!(json_of(&named)["repo"]["id"], GADGETS);
}

#[test]
fn a_dot_outside_a_checkout_exits_2() {
    let (_engine, mut runner) = seeded("read");
    runner.cwd = Some(support::temp_home());

    let output = runner.run(&["repo", "."], "");

    assert_eq!(output.code, 2, "{}", output.stderr);
    assert!(output.stderr.contains("not one") && output.stderr.contains("Name the repo instead"), "{}", output.stderr);
}

#[test]
fn a_name_that_fits_several_repos_exits_2_and_lists_them() {
    let (_engine, runner) = seeded("read");

    let output = runner.run(&["repo", "gitlab:shared/app", "--json"], "");
    let text = runner.run(&["repo", "gitlab:shared/app"], "");

    assert_eq!(output.code, 2, "{}", output.stdout);
    let failed = json_of(&output);
    assert_eq!(
        (failed["ok"].clone(), failed["exitCode"].clone(), failed["error"]["code"].clone()),
        (json!(false), json!(2), json!("ambiguous_repo"))
    );
    let ids: Vec<&str> = failed["matches"].as_array().unwrap().iter().map(|found| found["id"].as_str().unwrap()).collect();
    assert_eq!(ids, [SHARED_COM, SHARED_SH]);
    assert_eq!(failed["matches"][1]["host"], "git.example.com");
    assert_eq!(text.code, 2);
    for id in [SHARED_COM, SHARED_SH] {
        assert!(text.stderr.contains(id), "{}", text.stderr);
    }
}

#[test]
fn a_name_that_fits_no_repo_exits_1_and_a_bad_name_exits_2() {
    let (_engine, runner) = seeded("read");

    let missing = runner.run(&["repo", "acme/nothing", "--json"], "");
    let wrong_provider = runner.run(&["repo", "gitlab:acme/widgets", "--json"], "");
    let bad = runner.run(&["repo", "widgets", "--json"], "");
    let none = runner.run(&["repo"], "");

    assert_eq!((missing.code, json_of(&missing)["error"]["code"].clone()), (1, json!("repo_not_found")));
    assert_eq!(wrong_provider.code, 1);
    assert_eq!((bad.code, json_of(&bad)["error"]["code"].clone()), (2, json!("bad_repo_name")));
    assert_eq!(none.code, 2);
    assert_eq!(json_of(&bad)["error"]["next"], "elise help repos");
}

#[test]
fn repo_json_has_the_branches_and_the_verdict_of_the_default_branch() {
    let (_engine, runner) = seeded("read");

    let output = runner.run(&["repo", "acme/widgets", "--json"], "");

    assert_eq!(output.code, 0, "{}", output.stderr);
    let shown = json_of(&output);
    assert_eq!(shown["repo"]["name"], "acme/widgets");
    assert_eq!(shown["repo"]["project"], "Core platform");
    assert_eq!(
        shown["branches"],
        json!([
            { "name": "main", "isDefault": true, "latestScanId": "000000001-aaaa", "latestCommit": COMMIT, "latestScanAt": "2026-11-20T10:00:00.000Z" },
            { "name": "dev", "isDefault": false, "latestScanId": null, "latestCommit": null, "latestScanAt": null },
        ])
    );
    assert_eq!(
        shown["verdict"],
        json!({
            "branch": "main",
            "commit": COMMIT,
            "verdict": "cannot_tell",
            "reasons": [{ "code": "too_few_scans", "message": "One more full Scan is needed before this can pass." }],
            "scans": { "required": 2.0, "counted": 1.0 },
            "counts": { "critical": 0, "high": 1, "medium": 2, "low": 0, "informational": 0, "needsValidation": 1 },
        })
    );
}

#[test]
fn a_repo_without_a_succeeded_scan_has_a_null_verdict() {
    let (engine, runner) = seeded("read");

    let output = runner.run(&["repo", "acme/gadgets", "--json"], "");
    let text = runner.run(&["repo", "acme/gadgets"], "");

    assert_eq!(output.code, 0, "{}", output.stderr);
    assert_eq!(json_of(&output)["verdict"], Value::Null);
    assert!(text.stdout.contains("Verdict: none yet"), "{}", text.stdout);
    assert!(!engine.access_requests().iter().any(|request| request.contains("/verdict")));
}

#[test]
fn repo_prints_the_branches_and_the_verdict() {
    let (_engine, runner) = seeded("read");

    let output = runner.run(&["repo", "acme/widgets"], "");

    assert_eq!(output.code, 0, "{}", output.stderr);
    for wanted in [
        "acme/widgets  (github, private)",
        "Project: Core platform",
        "main (default)  latest Scan 000000001-aaaa on 2026-11-20",
        "dev  no Scan yet",
        "Verdict on main at 0123456: cannot_tell",
        "One more full Scan is needed",
    ] {
        assert!(output.stdout.contains(wanted), "{wanted}\n{}", output.stdout);
    }
}

#[test]
fn a_computer_with_no_cli_access_exits_3_and_says_how_to_get_it() {
    let engine = Engine::start();
    let runner = Runner::new(&engine);

    let output = runner.run(&["repos", "--json"], "");

    assert_eq!(output.code, 3, "{}", output.stdout);
    let failed = json_of(&output);
    assert_eq!((failed["error"]["code"].clone(), failed["error"]["next"].clone()), (json!("no_cli_access"), json!("elise login")));
    assert!(engine.access_requests().is_empty());
}

#[test]
fn a_revoked_cli_access_exits_4_and_is_forgotten() {
    let engine = Engine::start();
    let runner = Runner::new(&engine);
    login_with_read(&runner, &engine);
    let before = runner.run(&["repos", "--json"], "");
    engine.revoke_all_cli_access();

    let after = runner.run(&["repos", "--json"], "");
    let again = runner.run(&["repos", "--json"], "");

    assert_eq!(before.code, 0, "{}{}", before.stdout, before.stderr);
    assert_eq!((after.code, json_of(&after)["error"]["code"].clone()), (4, json!("revoked")));
    assert_eq!((again.code, json_of(&again)["error"]["code"].clone()), (3, json!("no_cli_access")));
    assert!(runner.home_files().iter().all(|path| path.file_name().unwrap() != "cli-access"));
}

#[test]
fn an_unreachable_engine_exits_5() {
    let (_engine, mut runner) = seeded("read");
    runner.url = Engine::unreachable_url();

    let output = runner.run(&["repos", "--json"], "");

    assert_eq!((output.code, json_of(&output)["error"]["code"].clone()), (5, json!("offline")));
}

#[test]
fn the_account_is_the_one_the_cli_access_belongs_to_even_when_the_person_has_two() {
    let (engine, runner) = seeded("read");
    engine.list_another_account_first();

    let output = runner.run(&["repos", "--json"], "");

    assert_eq!(output.code, 0, "{}{}", output.stdout, output.stderr);
    let calls: Vec<String> = engine.access_requests().into_iter().filter(|call| call != "GET /me").collect();
    assert_eq!(calls, ["GET /repos", "GET /repos", "GET /projects"]);
}
