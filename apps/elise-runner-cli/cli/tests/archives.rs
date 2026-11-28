mod support;

use serde_json::{json, Value};
use std::path::PathBuf;
use support::{archive_json, upload_app_json, zip_of, Engine, Output, Runner, NEW_APP_ID, NEW_SCAN_ID, RUNNER_ID};

const BILLING: &str = "e2222222-2222-4222-8222-222222222222";
const FIRST_ZIP: &str = "f1111111-1111-4111-8111-111111111111";
const SECOND_ZIP: &str = "f2222222-2222-4222-8222-222222222222";
const THIRD_ZIP: &str = "f3333333-3333-4333-8333-333333333333";

fn seeded() -> (Engine, Runner) {
    let engine = Engine::start();
    engine.add_repo(upload_app_json(BILLING, "Billing"));
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

fn file(name: &str, bytes: &[u8]) -> String {
    let path: PathBuf = support::temp_home().join(name);
    std::fs::write(&path, bytes).unwrap();
    path.to_string_lossy().into_owned()
}

fn good_zip() -> Vec<u8> {
    zip_of(&[("app/main.rs", "fn main() {}")])
}

fn nothing_was_sent(engine: &Engine) {
    assert!(engine.repo_posts().is_empty() && engine.archive_uploads().is_empty() && engine.scan_posts().is_empty());
    assert!(engine.access_requests().iter().all(|request| request.starts_with("GET ")), "{:?}", engine.access_requests());
}

#[test]
fn scan_zip_makes_the_app_streams_the_zip_and_starts_the_scan() {
    let (engine, runner) = seeded();
    let bytes = good_zip();
    let path = file("shop.zip", &bytes);

    let output = runner.run(&["scan", "--zip", &path, "--app", "Shop", "--yes", "--json"], "");

    assert_eq!(output.code, 0, "{}{}", output.stdout, output.stderr);
    assert_eq!(engine.repo_posts(), [json!({ "provider": "upload", "repo": "Shop" })]);
    let uploads = engine.archive_uploads();
    assert_eq!(uploads.len(), 1);
    assert_eq!(uploads[0].path, format!("/repos/{NEW_APP_ID}/archives?label=shop.zip"));
    assert_eq!(uploads[0].content_type.as_deref(), Some("application/zip"));
    assert_eq!(uploads[0].declared_length, Some(bytes.len()));
    assert_eq!(uploads[0].bytes, bytes);
    assert_eq!(
        engine.scan_posts(),
        [json!({
            "provider": "upload",
            "repo": "Shop",
            "profile": "standard",
            "runner_id": RUNNER_ID,
            "archive_id": "f0000001-0000-4000-8000-000000000000",
        })]
    );
    let shown = json_of(&output);
    assert_eq!(shown["scan"]["id"], NEW_SCAN_ID);
    assert_eq!(shown["scan"]["repo"], "Shop");
    assert_eq!(shown["scan"]["branch"], Value::Null);
    assert_eq!(shown["scan"]["status"], "queued");
    assert_eq!(shown["scan"]["app"], json!({ "id": NEW_APP_ID, "created": true }));
    assert_eq!(
        shown["scan"]["archive"],
        json!({ "id": "f0000001-0000-4000-8000-000000000000", "label": "shop.zip", "sizeBytes": bytes.len() })
    );
}

#[test]
fn scan_zip_into_an_app_that_exists_creates_nothing_and_asks_first_in_a_terminal() {
    let (engine, mut runner) = seeded();
    asking(&mut runner);
    let path = file("billing-v2.zip", &good_zip());

    let declined = runner.run(&["scan", "--zip", &path, "--app", "billing"], "n\n");
    let accepted = runner.run(&["scan", "--zip", &path, "--app", BILLING, "--budget", "3"], "y\n");

    assert_eq!((declined.code, accepted.code), (1, 0), "{}{}", accepted.stdout, accepted.stderr);
    for line in ["App:     Billing", "Zip:     billing-v2.zip", "Profile: standard", "Cap:     $3.00", "Runner:  build-box"] {
        assert!(accepted.stdout.contains(line), "{line}: {}", accepted.stdout);
    }
    assert!(declined.stderr.contains("Nothing was uploaded or started"), "{}", declined.stderr);
    assert!(engine.repo_posts().is_empty());
    assert_eq!(engine.archive_uploads().len(), 1);
    assert_eq!(engine.archive_uploads()[0].path, format!("/repos/{BILLING}/archives?label=billing-v2.zip"));
    assert_eq!(engine.scan_posts()[0]["repo"], "Billing");
}

#[test]
fn scan_zip_with_no_terminal_and_no_yes_exits_2_and_sends_nothing() {
    let (engine, runner) = seeded();
    let path = file("billing.zip", &good_zip());

    let output = runner.run(&["scan", "--zip", &path, "--app", "Billing", "--json"], "");

    assert_eq!(output.code, 2, "{}", output.stdout);
    assert_eq!(json_of(&output)["error"]["code"], "needs_yes");
    assert!(engine.access_requests().is_empty());
}

#[test]
fn a_zip_that_breaks_a_rule_fails_early_with_the_dashboards_reason_and_sends_nothing() {
    let (engine, runner) = seeded();
    let sparse = support::temp_home().join("big.zip");
    std::fs::File::create(&sparse).unwrap().set_len(50 * 1024 * 1024 + 1).unwrap();
    let deep = format!("{}x.txt", "d/".repeat(21));
    let cases = [
        (file("notes.txt", &good_zip()), "not_a_zip_file", "Upload a .zip file"),
        (sparse.to_string_lossy().into_owned(), "zip_too_large", "A zip can be at most 50 MB"),
        (file("fake.zip", b"this is only text"), "not_a_zip", "The file is not a zip"),
        (file("deep.zip", &zip_of(&[(deep.as_str(), "x")])), "path_too_deep", "A path in a zip can be at most 20 levels deep"),
    ];

    for (path, code, message) in cases {
        let output = runner.run(&["scan", "--zip", &path, "--app", "Billing", "--yes", "--json"], "");

        assert_eq!(output.code, 2, "{code}: {}{}", output.stdout, output.stderr);
        let shown = json_of(&output);
        assert_eq!((shown["error"]["code"].as_str(), shown["error"]["message"].as_str()), (Some(code), Some(message)));
        assert!(output.stderr.contains(message), "{}", output.stderr);
    }
    nothing_was_sent(&engine);
    assert!(engine.access_requests().is_empty(), "{:?}", engine.access_requests());
}

#[test]
fn a_zip_that_cannot_be_read_and_a_bad_app_name_are_refused_before_anything_is_sent() {
    let (engine, runner) = seeded();
    let missing = support::temp_home().join("gone.zip").to_string_lossy().into_owned();
    let path = file("ok.zip", &good_zip());

    let gone = runner.run(&["scan", "--zip", &missing, "--app", "Billing", "--yes", "--json"], "");
    let named = runner.run(&["scan", "--zip", &path, "--app", "a/b", "--yes", "--json"], "");

    assert_eq!((gone.code, named.code), (2, 2), "{}{}", gone.stdout, named.stdout);
    assert_eq!(json_of(&gone)["error"]["code"], "zip_not_found");
    let error = &json_of(&named)["error"];
    assert_eq!(error["code"], "bad_app_name");
    assert!(error["message"].as_str().unwrap().starts_with("An app name is letters, digits"), "{error}");
    nothing_was_sent(&engine);
}

#[test]
fn an_app_that_holds_20_zips_is_refused_before_the_upload() {
    let (engine, runner) = seeded();
    for number in 0..20 {
        engine.add_archive(BILLING, archive_json(&format!("f{number:07}-0000-4000-8000-000000000000"), BILLING, "old.zip"));
    }
    let path = file("one-more.zip", &good_zip());

    let output = runner.run(&["archives", "add", "Billing", &path, "--json"], "");

    assert_eq!(output.code, 2, "{}{}", output.stdout, output.stderr);
    let error = &json_of(&output)["error"];
    assert_eq!(error["code"], "too_many_zips");
    assert_eq!(error["message"], "An upload app can hold at most 20 zips: remove one first");
    nothing_was_sent(&engine);
}

#[test]
fn what_the_engine_refuses_is_said_in_its_words() {
    let (engine, runner) = seeded();
    engine.refuse_archive_uploads(409, "An account can store at most 500 MB of zips: remove some first");
    let path = file("billing.zip", &good_zip());

    let output = runner.run(&["scan", "--zip", &path, "--app", "Billing", "--yes", "--json"], "");

    assert_eq!(output.code, 1, "{}{}", output.stdout, output.stderr);
    let error = &json_of(&output)["error"];
    assert_eq!(error["code"], "refused");
    assert_eq!(error["message"], "An account can store at most 500 MB of zips: remove some first");
    assert!(engine.scan_posts().is_empty());
}

#[test]
fn the_zip_and_app_flags_go_together_and_take_no_repo_or_branch() {
    let (engine, runner) = seeded();
    let path = file("billing.zip", &good_zip());
    let cases: [(&[&str], &str); 4] = [
        (&["scan", "--zip", &path, "--yes", "--json"], "zip_needs_app"),
        (&["scan", "--app", "Billing", "--yes", "--json"], "app_needs_zip"),
        (&["scan", "acme/widgets", "--zip", &path, "--app", "Billing", "--yes", "--json"], "zip_takes_no_repo"),
        (&["scan", "--zip", &path, "--app", "Billing", "--branch", "main", "--yes", "--json"], "zip_takes_no_branch"),
    ];

    for (args, code) in cases {
        let output = runner.run(args, "");

        assert_eq!(output.code, 2, "{code}: {}", output.stdout);
        assert_eq!(json_of(&output)["error"]["code"], code);
    }
    assert!(engine.access_requests().is_empty());
}

#[test]
fn archives_add_makes_the_app_if_it_is_new_and_uploads_the_zip() {
    let (engine, runner) = seeded();
    let bytes = good_zip();
    let path = file("shop.zip", &bytes);

    let output = runner.run(&["archives", "add", "Shop", &path, "--json"], "");

    assert_eq!(output.code, 0, "{}{}", output.stdout, output.stderr);
    let shown = json_of(&output);
    assert_eq!(shown["app"], json!({ "id": NEW_APP_ID, "name": "Shop", "created": true }));
    assert_eq!(shown["archive"]["label"], "shop.zip");
    assert_eq!(shown["archive"]["sizeBytes"], bytes.len());
    assert_eq!(engine.repo_posts(), [json!({ "provider": "upload", "repo": "Shop" })]);
    assert_eq!(engine.archive_uploads()[0].bytes, bytes);
    assert!(engine.scan_posts().is_empty());
}

#[test]
fn archives_add_needs_scope_start() {
    let engine = Engine::start();
    engine.add_repo(upload_app_json(BILLING, "Billing"));
    let mut runner = Runner::new(&engine);
    runner.env.push(("ELISE_TOKEN", engine.grant_cli_access("read")));
    let path = file("billing.zip", &good_zip());

    let output = runner.run(&["archives", "add", "Billing", &path, "--json"], "");

    assert_eq!(output.code, 2, "{}{}", output.stdout, output.stderr);
    assert_eq!(json_of(&output)["error"]["code"], "needs_scope");
    assert!(engine.archive_uploads().is_empty());
}

fn with_three_zips() -> (Engine, Runner) {
    let (engine, runner) = seeded();
    engine.add_archive(BILLING, archive_json(FIRST_ZIP, BILLING, "v1.zip"));
    engine.add_archive(BILLING, archive_json(SECOND_ZIP, BILLING, "v2.zip"));
    engine.add_archive(BILLING, archive_json(THIRD_ZIP, BILLING, "v2.zip"));
    (engine, runner)
}

#[test]
fn archives_list_shows_the_zips_of_an_app_named_or_given_by_id() {
    let (_engine, runner) = with_three_zips();

    let by_name = runner.run(&["archives", "list", "billing", "--json"], "");
    let by_id = runner.run(&["archives", "list", BILLING, "--json"], "");
    let text = runner.run(&["archives", "list", "Billing"], "");

    assert_eq!((by_name.code, by_id.code, text.code), (0, 0, 0), "{}{}", by_name.stdout, by_name.stderr);
    let shown = json_of(&by_name);
    assert_eq!(shown["app"], json!({ "id": BILLING, "name": "Billing" }));
    assert_eq!(shown["archives"].as_array().unwrap().len(), 3);
    assert_eq!(
        shown["archives"][0],
        json!({
            "id": FIRST_ZIP,
            "label": "v1.zip",
            "sizeBytes": 2048,
            "contentSha256": "abc123",
            "uploadedAt": "2026-11-18T09:00:00.000Z",
        })
    );
    assert_eq!(json_of(&by_id)["archives"], shown["archives"]);
    assert!(text.stdout.contains("LABEL") && text.stdout.contains(FIRST_ZIP), "{}", text.stdout);
}

#[test]
fn archives_list_of_an_unknown_app_exits_1() {
    let (_engine, runner) = seeded();

    let named = runner.run(&["archives", "list", "nothing", "--json"], "");
    let by_id = runner.run(&["archives", "list", FIRST_ZIP, "--json"], "");

    assert_eq!((named.code, by_id.code), (1, 1));
    assert_eq!(json_of(&named)["error"]["code"], "app_not_found");
    assert_eq!(json_of(&by_id)["error"]["code"], "app_not_found");
}

#[test]
fn archives_remove_deletes_a_zip_by_label_or_by_id() {
    let (engine, runner) = with_three_zips();

    let by_label = runner.run(&["archives", "remove", "Billing", "v1.zip", "--yes", "--json"], "");
    let by_id = runner.run(&["archives", "remove", "billing", THIRD_ZIP, "--yes", "--json"], "");

    assert_eq!((by_label.code, by_id.code), (0, 0), "{}{}", by_label.stdout, by_label.stderr);
    assert_eq!(engine.archive_removals(), [FIRST_ZIP, THIRD_ZIP]);
    assert_eq!(
        json_of(&by_label),
        json!({
            "schemaVersion": 1,
            "ok": true,
            "exitCode": 0,
            "app": { "id": BILLING, "name": "Billing" },
            "archive": { "id": FIRST_ZIP, "label": "v1.zip" },
            "removed": true,
        })
    );
}

#[test]
fn archives_remove_with_a_label_that_fits_several_zips_lists_them_and_deletes_nothing() {
    let (engine, runner) = with_three_zips();

    let output = runner.run(&["archives", "remove", "Billing", "v2.zip", "--yes", "--json"], "");

    assert_eq!(output.code, 2, "{}{}", output.stdout, output.stderr);
    let shown = json_of(&output);
    assert_eq!(shown["error"]["code"], "ambiguous_archive");
    let ids: Vec<&str> = shown["matches"].as_array().unwrap().iter().map(|found| found["id"].as_str().unwrap()).collect();
    assert_eq!(ids, [SECOND_ZIP, THIRD_ZIP]);
    assert!(engine.archive_removals().is_empty());
}

#[test]
fn archives_remove_of_a_zip_that_is_not_there_exits_1() {
    let (engine, runner) = with_three_zips();

    let output = runner.run(&["archives", "remove", "Billing", "v9.zip", "--yes", "--json"], "");

    assert_eq!(output.code, 1, "{}{}", output.stdout, output.stderr);
    assert_eq!(json_of(&output)["error"]["code"], "archive_not_found");
    assert!(engine.archive_removals().is_empty());
}

#[test]
fn archives_remove_asks_in_a_terminal_and_with_no_terminal_needs_yes() {
    let (engine, mut runner) = with_three_zips();

    let silent = runner.run(&["archives", "remove", "Billing", "v1.zip", "--json"], "");
    asking(&mut runner);
    let declined = runner.run(&["archives", "remove", "Billing", "v1.zip"], "n\n");
    let accepted = runner.run(&["archives", "remove", "Billing", "v1.zip"], "y\n");

    assert_eq!((silent.code, declined.code, accepted.code), (2, 1, 0), "{}{}", accepted.stdout, accepted.stderr);
    assert_eq!(json_of(&silent)["error"]["code"], "needs_yes");
    assert_eq!(engine.archive_removals(), [FIRST_ZIP]);
}
