use elise_runner_core::engine_client::{Denied, EngineClient, Scope};
use elise_runner_core::scan_ref::{self, FoundScan, ScanRef};
use elise_runner_core::store::{FileStore, GivenToken, TokenStore};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Mutex, OnceLock};

const OWN_ACCOUNT: &str = "5b0c3f0e-1d2a-4c3b-8e4f-6a7b8c9d0e1f";
const OTHER_ACCOUNT: &str = "7c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f";
const REPO: &str = "11111111-1111-4111-8111-111111111111";
const OTHER_REPO: &str = "22222222-2222-4222-8222-222222222222";

static REQUESTS: Mutex<Vec<String>> = Mutex::new(Vec::new());

fn scan_id(number: usize) -> String {
    format!("{number:09}-{number:08x}")
}

fn scan(number: usize, repo: &str) -> serde_json::Value {
    serde_json::json!({
        "scanId": scan_id(number), "repo": "acme/widgets", "repoId": repo, "branch": "main", "status": "succeeded",
        "profile": "standard", "createdAt": "2026-11-20T10:00:00.000Z", "finishedAt": null,
    })
}

fn query_value(query: &str, name: &str) -> Option<String> {
    query.split('&').find_map(|pair| pair.split_once('=').filter(|(key, _)| *key == name).map(|(_, value)| value.to_string()))
}

fn answer(method: &str, path: &str, bearer: &str, account: &str) -> (u16, serde_json::Value) {
    let (route, query) = path.split_once('?').unwrap_or((path, ""));
    if bearer != "elc_good" {
        return (401, serde_json::json!({ "data": null, "error": { "message": "unauthorized" } }));
    }
    if route == "/me" {
        let accounts = [OTHER_ACCOUNT, OWN_ACCOUNT].map(|id| serde_json::json!({ "id": id }));
        return (200, serde_json::json!({ "data": { "accounts": accounts }, "error": null }));
    }
    if account != OWN_ACCOUNT {
        return (403, serde_json::json!({ "data": null, "error": { "message": "This CLI access belongs to another account" } }));
    }
    if method == "GET" && route == "/scans" {
        let limit: usize = query_value(query, "limit").and_then(|limit| limit.parse().ok()).unwrap_or(50);
        let cursor = query_value(query, "cursor");
        let repo = query_value(query, "repoId");
        let mut scans: Vec<serde_json::Value> = (0..250).map(|number| scan(number, REPO)).collect();
        scans.push(scan(999_999_999, OTHER_REPO));
        let rows: Vec<&serde_json::Value> = scans
            .iter()
            .filter(|row| repo.as_ref().is_none_or(|id| row["repoId"] == id.as_str()))
            .filter(|row| cursor.as_ref().is_none_or(|after| row["scanId"].as_str().unwrap() > after.as_str()))
            .take(limit + 1)
            .collect();
        let next = (rows.len() > limit).then(|| rows[limit - 1]["scanId"].clone());
        let page: Vec<&&serde_json::Value> = rows.iter().take(limit).collect();
        return (200, serde_json::json!({ "data": { "scans": page, "nextCursor": next }, "error": null }));
    }
    (404, serde_json::json!({ "data": null, "error": { "message": "not found" } }))
}

fn serve(mut stream: TcpStream) {
    let mut reader = BufReader::new(stream.try_clone().unwrap());
    let mut line = String::new();
    reader.read_line(&mut line).unwrap();
    let mut parts = line.split_whitespace();
    let (method, path) = (parts.next().unwrap_or_default().to_string(), parts.next().unwrap_or_default().to_string());
    let (mut bearer, mut account, mut length) = (String::new(), String::new(), 0);
    loop {
        let mut header = String::new();
        reader.read_line(&mut header).unwrap();
        let header = header.trim_end();
        if header.is_empty() {
            break;
        }
        let (name, value) = header.split_once(':').unwrap();
        match name.to_ascii_lowercase().as_str() {
            "authorization" => bearer = value.trim().trim_start_matches("Bearer ").to_string(),
            "x-account-id" => account = value.trim().to_string(),
            "content-length" => length = value.trim().parse().unwrap(),
            _ => {}
        }
    }
    reader.read_exact(&mut vec![0; length]).unwrap();
    REQUESTS.lock().unwrap().push(format!("{method} {path} {account}"));
    let (status, body) = answer(&method, &path, &bearer, &account);
    let body = body.to_string();
    let _ = write!(
        stream,
        "HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
}

fn engine() {
    static STARTED: OnceLock<()> = OnceLock::new();
    STARTED.get_or_init(|| {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        std::env::set_var("ELISE_ENGINE_URL", format!("http://{}", listener.local_addr().unwrap()));
        std::thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                std::thread::spawn(move || serve(stream));
            }
        });
    });
}

fn requests_to(path_start: &str, account: &str) -> usize {
    REQUESTS.lock().unwrap().iter().filter(|seen| seen.starts_with(&format!("GET {path_start}")) && seen.ends_with(account)).count()
}

#[tokio::test]
async fn a_unique_prefix_is_found_across_pages_and_the_search_stops_past_it() {
    engine();
    let store = GivenToken::new("start:elc_good".to_string());
    let client = EngineClient::open(&store, true, Scope::Read).unwrap();

    let found = scan_ref::resolve(&client, &ScanRef::Prefix("000000125".into()), Some(REPO)).await.unwrap();
    let ambiguous = scan_ref::resolve(&client, &ScanRef::Prefix("00000012".into()), Some(REPO)).await.unwrap();
    let none = scan_ref::resolve(&client, &ScanRef::Prefix("00000999".into()), Some(REPO)).await.unwrap();

    assert!(matches!(&found, FoundScan::One(scan) if scan.scan_id == scan_id(125)), "{found:?}");
    assert!(matches!(&ambiguous, FoundScan::Many(scans) if scans.len() == 10), "{ambiguous:?}");
    assert_eq!(none, FoundScan::None);
    assert_eq!(requests_to(&format!("/scans?limit=100&repoId={REPO}"), OWN_ACCOUNT), 2 + 2 + 3);
}

#[tokio::test]
async fn latest_is_the_first_scan_of_the_repo_or_of_the_account() {
    engine();
    let store = GivenToken::new("elc_good".to_string());
    let client = EngineClient::open(&store, true, Scope::Read).unwrap();

    let of_repo = scan_ref::resolve(&client, &ScanRef::Latest, Some(OTHER_REPO)).await.unwrap();
    let of_account = scan_ref::resolve(&client, &ScanRef::Latest, None).await.unwrap();

    assert!(matches!(&of_repo, FoundScan::One(scan) if scan.scan_id == scan_id(999_999_999)), "{of_repo:?}");
    assert!(matches!(&of_account, FoundScan::One(scan) if scan.scan_id == scan_id(0)), "{of_account:?}");
}

#[tokio::test]
async fn the_account_is_found_by_trying_each_account_the_person_has() {
    engine();
    let store = GivenToken::new("elc_good".to_string());
    let client = EngineClient::open(&store, true, Scope::Read).unwrap();

    scan_ref::list_scans(&client, Some("33333333-3333-4333-8333-333333333333"), 1).await.unwrap();
    scan_ref::list_scans(&client, Some("33333333-3333-4333-8333-333333333333"), 1).await.unwrap();

    let path = "/scans?limit=1&repoId=33333333-3333-4333-8333-333333333333";
    assert_eq!((requests_to(path, OTHER_ACCOUNT), requests_to(path, OWN_ACCOUNT)), (1, 2));
}

#[tokio::test]
async fn a_rejected_token_is_forgotten_unless_it_comes_from_the_environment() {
    engine();
    let dir = std::env::temp_dir().join(format!("elise-core-test-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let file = FileStore::new(dir.join("cli-access"));
    file.save("start:elc_revoked").unwrap();
    let given = GivenToken::new("elc_revoked".to_string());

    let stored = EngineClient::open(&file, false, Scope::Read).unwrap();
    let from_variable = EngineClient::open(&given, true, Scope::Read).unwrap();
    let answered = scan_ref::list_scans(&stored, None, 1).await;
    let variable_answered = scan_ref::list_scans(&from_variable, None, 1).await;

    assert_eq!((answered.err(), variable_answered.err()), (Some(Denied::Revoked), Some(Denied::Revoked)));
    assert_eq!(file.token(), None);
    assert_eq!(given.token().as_deref(), Some("elc_revoked"));
}
