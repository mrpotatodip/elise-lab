#![allow(dead_code)]

use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

pub const CODE: &str = "PAIR-CODE-1";
pub const RUNNER_NAME: &str = "build-box";
pub const ACCOUNT_NAME: &str = "Acme Security";

#[derive(Default)]
struct State {
    issued: usize,
    live: BTreeSet<String>,
    revoked: Vec<String>,
    revokes_fail: bool,
    jobs: VecDeque<String>,
    claims: Vec<String>,
    archives: BTreeMap<String, Vec<u8>>,
    archive_downloads: Vec<String>,
    results: Vec<(String, String)>,
    remove_after_result: bool,
    findings: Vec<(String, String)>,
    findings_answer: Option<u16>,
    findings_failures: usize,
    findings_before_result: Vec<usize>,
    cancelled: BTreeSet<String>,
    job_checks: Vec<String>,
    job_checks_fail: Option<u16>,
    claims_held: bool,
    a_claim_was_held: bool,
    no_login_routes: bool,
    login_starts: Vec<String>,
    login_pending: bool,
    login_approved: bool,
    login_refused: bool,
    login_expires_at: Option<String>,
    login_script: VecDeque<String>,
    login_check_times: Vec<std::time::Instant>,
    login_choice: Option<(bool, Option<String>)>,
    access_issued: usize,
    access_live: BTreeSet<String>,
    access_calls: Vec<String>,
    access_scopes: BTreeMap<String, String>,
    access_requests: Vec<String>,
    other_account_first: bool,
    repos: Vec<serde_json::Value>,
    projects: Vec<serde_json::Value>,
    branches: BTreeMap<String, Vec<serde_json::Value>>,
    verdicts: BTreeMap<(String, String), serde_json::Value>,
    scans: Vec<serde_json::Value>,
}

pub const USER_CODE: &str = "WXYZ-1234";
pub const VERIFICATION_URL: &str = "https://app.example/device?code=WXYZ-1234";
const DEVICE_CODE: &str = "device-code-secret-77";

pub struct Engine {
    pub url: String,
    state: Arc<Mutex<State>>,
}

impl Engine {
    pub fn start() -> Engine {
        let listener = TcpListener::bind("127.0.0.1:0").expect("a free local port");
        let url = format!("http://{}", listener.local_addr().unwrap());
        let state = Arc::new(Mutex::new(State::default()));
        let shared = state.clone();
        std::thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let state = shared.clone();
                std::thread::spawn(move || serve(stream, &state));
            }
        });
        Engine { url, state }
    }

    pub fn unreachable_url() -> String {
        let listener = TcpListener::bind("127.0.0.1:0").expect("a free local port");
        format!("http://{}", listener.local_addr().unwrap())
    }

    pub fn tokens(&self) -> Vec<String> {
        let issued = self.state.lock().unwrap().issued;
        (1..=issued).map(token_number).collect()
    }

    pub fn live(&self) -> BTreeSet<String> {
        self.state.lock().unwrap().live.clone()
    }

    pub fn revoked(&self) -> Vec<String> {
        self.state.lock().unwrap().revoked.clone()
    }

    pub fn remove_all_runners(&self) {
        self.state.lock().unwrap().live.clear();
    }

    pub fn fail_revokes(&self) {
        self.state.lock().unwrap().revokes_fail = true;
    }

    pub fn queue_job(&self, job: String) {
        self.state.lock().unwrap().jobs.push_back(job);
    }

    // The zip an upload Scan's job downloads. A Scan with none answers as Elise does once the zip
    // was removed.
    pub fn serve_archive(&self, scan_id: &str, zip: Vec<u8>) {
        self.state.lock().unwrap().archives.insert(scan_id.to_string(), zip);
    }

    // The bodies of the claims the Runner sent, as JSON (null for an empty body).
    pub fn claims(&self) -> Vec<serde_json::Value> {
        let state = self.state.lock().unwrap();
        state
            .claims
            .iter()
            .map(|body| if body.is_empty() { serde_json::Value::Null } else { serde_json::from_str(body).expect("a claim is JSON") })
            .collect()
    }

    pub fn archive_downloads(&self) -> Vec<String> {
        self.state.lock().unwrap().archive_downloads.clone()
    }

    pub fn finding_batches(&self) -> Vec<Vec<serde_json::Value>> {
        let state = self.state.lock().unwrap();
        state.findings.iter().map(|(_, body)| batch_of(body)).collect()
    }

    pub fn batches_before_results(&self) -> Vec<usize> {
        self.state.lock().unwrap().findings_before_result.clone()
    }

    pub fn fail_findings_first(&self, times: usize) {
        self.state.lock().unwrap().findings_failures = times;
    }

    pub fn answer_findings_with(&self, status: u16) {
        self.state.lock().unwrap().findings_answer = Some(status);
    }

    pub fn results(&self) -> Vec<(String, serde_json::Value)> {
        let state = self.state.lock().unwrap();
        state.results.iter().map(|(id, body)| (id.clone(), serde_json::from_str(body).expect("a result is JSON"))).collect()
    }

    pub fn hold_claims(&self) {
        self.state.lock().unwrap().claims_held = true;
    }

    pub fn wait_for_a_held_claim(&self) {
        let held = until(|| self.state.lock().unwrap().a_claim_was_held);
        assert!(held, "no claim reached the engine");
    }

    pub fn release_claims(&self) {
        self.state.lock().unwrap().claims_held = false;
    }

    pub fn without_login_routes(&self) {
        self.state.lock().unwrap().no_login_routes = true;
    }

    pub fn login_starts(&self) -> Vec<serde_json::Value> {
        let state = self.state.lock().unwrap();
        state.login_starts.iter().map(|body| serde_json::from_str(body).expect("a login start is JSON")).collect()
    }

    pub fn wait_for_a_pending_login(&self) {
        let started = until(|| self.state.lock().unwrap().login_pending);
        assert!(started, "no login was started");
    }

    pub fn approve_login(&self) {
        self.state.lock().unwrap().login_approved = true;
    }

    pub fn approve_login_with(&self, run_scans: bool, cli_scope: Option<&str>) {
        let mut state = self.state.lock().unwrap();
        state.login_choice = Some((run_scans, cli_scope.map(str::to_string)));
        state.login_approved = true;
    }

    pub fn access_tokens(&self) -> Vec<String> {
        let issued = self.state.lock().unwrap().access_issued;
        (1..=issued).map(access_token_number).collect()
    }

    pub fn revoke_all_cli_access(&self) {
        self.state.lock().unwrap().access_live.clear();
    }

    pub fn access_calls(&self) -> Vec<String> {
        self.state.lock().unwrap().access_calls.clone()
    }

    pub fn grant_cli_access(&self, scope: &str) -> String {
        let mut state = self.state.lock().unwrap();
        state.access_issued += 1;
        let token = access_token_number(state.access_issued);
        state.access_live.insert(token.clone());
        state.access_scopes.insert(token.clone(), scope.to_string());
        token
    }

    pub fn access_requests(&self) -> Vec<String> {
        self.state.lock().unwrap().access_requests.clone()
    }

    pub fn list_another_account_first(&self) {
        self.state.lock().unwrap().other_account_first = true;
    }

    pub fn add_project(&self, project: serde_json::Value) {
        self.state.lock().unwrap().projects.push(project);
    }

    pub fn add_repo(&self, repo: serde_json::Value) {
        self.state.lock().unwrap().repos.push(repo);
    }

    pub fn set_branches(&self, repo_id: &str, branches: Vec<serde_json::Value>) {
        self.state.lock().unwrap().branches.insert(repo_id.to_string(), branches);
    }

    pub fn set_verdict(&self, repo_id: &str, commit: &str, verdict: serde_json::Value) {
        self.state.lock().unwrap().verdicts.insert((repo_id.to_string(), commit.to_string()), verdict);
    }

    pub fn add_scan(&self, scan: serde_json::Value) {
        self.state.lock().unwrap().scans.push(scan);
    }

    pub fn login_expires_at(&self, expires_at: &str) {
        self.state.lock().unwrap().login_expires_at = Some(expires_at.to_string());
    }

    pub fn script_login_checks(&self, answers: &[&str]) {
        self.state.lock().unwrap().login_script = answers.iter().map(|answer| answer.to_string()).collect();
    }

    pub fn login_checks(&self) -> Vec<std::time::Instant> {
        self.state.lock().unwrap().login_check_times.clone()
    }

    pub fn refuse_login_checks(&self) {
        self.state.lock().unwrap().login_refused = true;
    }

    pub fn cancel_job(&self, scan_id: &str) {
        self.state.lock().unwrap().cancelled.insert(scan_id.to_string());
    }

    pub fn fail_job_checks(&self, status: u16) {
        self.state.lock().unwrap().job_checks_fail = Some(status);
    }

    pub fn job_checks(&self) -> Vec<String> {
        self.state.lock().unwrap().job_checks.clone()
    }

    pub fn wait_for_a_job_check(&self) {
        let asked = until(|| !self.state.lock().unwrap().job_checks.is_empty());
        assert!(asked, "the Runner never asked for the job state");
    }

    pub fn remove_runners_after_the_next_result(&self) {
        self.state.lock().unwrap().remove_after_result = true;
    }
}

pub fn job(scan_id: &str, phase_prompts: [&str; 4]) -> String {
    job_at(scan_id, REPO_URL, phase_prompts)
}

pub fn job_with_profile(scan_id: &str, profile: &str, phase_prompts: [&str; 4]) -> String {
    let mut job: serde_json::Value = serde_json::from_str(&job_at(scan_id, REPO_URL, phase_prompts)).unwrap();
    job["profile"] = profile.into();
    job.to_string()
}

pub fn job_at(scan_id: &str, repo: &str, phase_prompts: [&str; 4]) -> String {
    let phases: Vec<serde_json::Value> = ["recon", "hunt", "check", "report"]
        .iter()
        .zip(phase_prompts)
        .map(|(phase, prompt)| serde_json::json!({ "phase": phase, "prompt": prompt }))
        .collect();
    serde_json::json!({
        "scanId": scan_id,
        "repo": repo,
        "ref": null,
        "skill": "full",
        "profile": "standard",
        "model": "test-model",
        "effort": "high",
        "profileCapUsd": 12,
        "maxBudgetUsd": 50,
        "prompt": "single prompt",
        "phasePrompts": phases,
        "priorsJson": "",
    })
    .to_string()
}

// An upload Scan's job: the app's name as its repo, and an archive source.
pub fn archive_job(scan_id: &str, app: &str, phase_prompts: [&str; 4]) -> String {
    let mut job: serde_json::Value = serde_json::from_str(&job_at(scan_id, app, phase_prompts)).unwrap();
    job["source"] = serde_json::json!({ "kind": "archive", "archiveId": "7a2e1d0c-3b4f-4a51-8c62-9d03e4f5a6b7" });
    job.to_string()
}

// A zip of these files, deflated as zip tools write them.
pub fn zip_of(files: &[(&str, &str)]) -> Vec<u8> {
    let mut writer = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    for (name, text) in files {
        writer.start_file(*name, zip::write::SimpleFileOptions::default()).unwrap();
        writer.write_all(text.as_bytes()).unwrap();
    }
    writer.finish().unwrap().into_inner()
}

pub const REPO_URL: &str = "https://github.com/acme/widgets";
pub const REPO: &str = "acme/widgets";

fn token_number(n: usize) -> String {
    format!("elise-test-token-{n}-0f9a7c")
}

fn issued_tokens(state: &State) -> Vec<String> {
    (1..=state.issued).map(token_number).chain((1..=state.access_issued).map(access_token_number)).collect()
}

const ACCOUNT_ID: &str = "5b0c3f0e-1d2a-4c3b-8e4f-6a7b8c9d0e1f";
const RUNNER_ID: &str = "9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b";
const ACCESS_ID: &str = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

fn access_token_number(n: usize) -> String {
    format!("elc_test{n}0f9a7c")
}

struct Request {
    method: String,
    path: String,
    bearer: Option<String>,
    account: Option<String>,
    body: String,
}

fn read_request(stream: &TcpStream) -> Option<Request> {
    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    reader.read_line(&mut line).ok()?;
    let mut parts = line.split_whitespace();
    let method = parts.next()?.to_string();
    let path = parts.next()?.to_string();
    let mut length = 0;
    let mut bearer = None;
    let mut account = None;
    loop {
        let mut header = String::new();
        reader.read_line(&mut header).ok()?;
        let header = header.trim_end();
        if header.is_empty() {
            break;
        }
        let (name, value) = header.split_once(':')?;
        let value = value.trim();
        match name.to_ascii_lowercase().as_str() {
            "content-length" => length = value.parse().ok()?,
            "authorization" => bearer = value.strip_prefix("Bearer ").map(str::to_string),
            "x-account-id" => account = Some(value.to_string()),
            _ => {}
        }
    }
    let mut body = vec![0; length];
    reader.read_exact(&mut body).ok()?;
    Some(Request { method, path, bearer, account, body: String::from_utf8(body).ok()? })
}

fn serve(mut stream: TcpStream, state: &Mutex<State>) {
    let Some(request) = read_request(&stream) else {
        return;
    };
    if request.path == "/runners/claim" {
        hold_while_claims_are_held(state);
    }
    if let Some(zip) = archive_of(&request, &mut state.lock().unwrap()) {
        let _ = write!(
            stream,
            "HTTP/1.1 200 OK\r\nContent-Type: application/zip\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            zip.len()
        );
        let _ = stream.write_all(&zip);
        return;
    }
    let (status, body) = answer(&request, &mut state.lock().unwrap());
    if status == 0 {
        return;
    }
    let reason = if status == 200 { "OK" } else { "Error" };
    let _ = write!(
        stream,
        "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
}

fn hold_while_claims_are_held(state: &Mutex<State>) {
    until(|| {
        let mut state = state.lock().unwrap();
        state.a_claim_was_held |= state.claims_held;
        !state.claims_held
    });
}

// The zip of a job, for a live token, when the engine has one for that Scan.
fn archive_of(request: &Request, state: &mut State) -> Option<Vec<u8>> {
    let live = request.bearer.as_ref().is_some_and(|token| state.live.contains(token));
    let scan_id = request.path.strip_prefix("/runners/jobs/")?.strip_suffix("/archive")?.to_string();
    if request.method != "GET" || !live {
        return None;
    }
    state.archive_downloads.push(scan_id.clone());
    state.archives.get(&scan_id).cloned()
}

fn batch_of(body: &str) -> Vec<serde_json::Value> {
    let body: serde_json::Value = serde_json::from_str(body).expect("a batch is JSON");
    body["findings"].as_array().expect("a batch holds findings").clone()
}

pub const ARCHIVE_REMOVED: &str = "The zip this Scan reads was removed before the Runner could download it, so the Scan did not run.";

const REJECTED: (u16, &str) = (401, r#"{"data":null,"error":{"code":"unauthorized"}}"#);

fn answer(request: &Request, state: &mut State) -> (u16, String) {
    let live = request.bearer.as_ref().is_some_and(|token| state.live.contains(token));
    if live && request.path == "/runners/claim" {
        state.claims.push(request.body.clone());
    }
    if state.no_login_routes && request.path.starts_with("/runners/login/") {
        return (404, r#"{"data":null,"error":{"code":"not_found"}}"#.to_string());
    }
    match (request.method.as_str(), request.path.as_str()) {
        ("POST", "/runners/login/start") => {
            state.login_starts.push(request.body.clone());
            state.login_pending = true;
            state.login_approved = false;
            let expires_at = state.login_expires_at.as_deref().unwrap_or("2099-01-01T00:00:00.000Z");
            let body = format!(
                r#"{{"data":{{"userCode":"{USER_CODE}","verificationUrl":"{VERIFICATION_URL}","deviceCode":"{DEVICE_CODE}","expiresAt":"{expires_at}"}},"error":null}}"#
            );
            (200, body)
        }
        ("POST", "/runners/login/check") if state.login_pending && !state.login_script.is_empty() => {
            state.login_check_times.push(std::time::Instant::now());
            let data = state.login_script.pop_front().unwrap_or_default();
            (200, format!(r#"{{"data":{data},"error":null}}"#))
        }
        ("POST", "/runners/login/check") if state.login_refused || !request.body.contains(DEVICE_CODE) || !state.login_pending => {
            (403, r#"{"data":null,"error":{"code":"forbidden"}}"#.to_string())
        }
        ("POST", "/runners/login/check") if !state.login_approved => (200, r#"{"data":{"status":"pending"},"error":null}"#.to_string()),
        ("POST", "/runners/login/check") => {
            state.login_pending = false;
            let (run_scans, cli_scope) = state.login_choice.clone().unwrap_or((true, None));
            let mut data = serde_json::json!({ "status": "approved", "accountId": ACCOUNT_ID, "accountName": ACCOUNT_NAME });
            if run_scans {
                state.issued += 1;
                let token = token_number(state.issued);
                state.live.insert(token.clone());
                data["runnerId"] = RUNNER_ID.into();
                data["name"] = RUNNER_NAME.into();
                data["token"] = token.into();
            }
            if let Some(scope) = cli_scope {
                state.access_issued += 1;
                let token = access_token_number(state.access_issued);
                state.access_live.insert(token.clone());
                state.access_scopes.insert(token.clone(), scope.clone());
                data["cliAccess"] = serde_json::json!({ "id": ACCESS_ID, "name": RUNNER_NAME, "scope": scope, "token": token });
            }
            (200, serde_json::json!({ "data": data, "error": null }).to_string())
        }
        _ if request.bearer.as_ref().is_some_and(|token| token.starts_with("elc_")) => cli_answer(request, state),
        ("POST", "/runners/enroll") => {
            if !request.body.contains(&format!("\"{CODE}\"")) {
                return (403, r#"{"data":null,"error":{"code":"invalid_code"}}"#.to_string());
            }
            state.issued += 1;
            let token = token_number(state.issued);
            state.live.insert(token.clone());
            let body = format!(r#"{{"data":{{"name":"{RUNNER_NAME}","accountName":"{ACCOUNT_NAME}","token":"{token}"}},"error":null}}"#);
            (200, body)
        }
        ("GET", "/runners/me") if live => {
            (200, format!(r#"{{"data":{{"name":"{RUNNER_NAME}","accountName":"{ACCOUNT_NAME}"}},"error":null}}"#))
        }
        ("DELETE", "/runners/me") if state.revokes_fail => (503, r#"{"data":null,"error":{"code":"unavailable"}}"#.to_string()),
        ("DELETE", "/runners/me") if live => {
            let token = request.bearer.clone().unwrap();
            state.live.remove(&token);
            state.revoked.push(token);
            (200, r#"{"data":{"ok":true},"error":null}"#.to_string())
        }
        ("GET", path) if live && path.starts_with("/runners/jobs/") && path.ends_with("/archive") => {
            (404, format!(r#"{{"data":null,"error":{{"code":"NOT_FOUND","message":"{ARCHIVE_REMOVED}"}}}}"#))
        }
        ("GET", path) if live && path.starts_with("/runners/jobs/") => {
            let scan_id = path.trim_start_matches("/runners/jobs/").to_string();
            state.job_checks.push(scan_id.clone());
            if let Some(status) = state.job_checks_fail {
                return (status, r#"{"data":null,"error":{"code":"unavailable"}}"#.to_string());
            }
            let job_state = if state.cancelled.contains(&scan_id) { "cancelled" } else { "claimed" };
            (200, format!(r#"{{"data":{{"state":"{job_state}"}},"error":null}}"#))
        }
        ("POST", "/runners/claim") if live => match state.jobs.pop_front() {
            Some(job) => (200, format!(r#"{{"data":{job},"error":null}}"#)),
            None => (200, r#"{"data":null,"error":null}"#.to_string()),
        },
        ("POST", path) if live && path.starts_with("/runners/jobs/") && path.ends_with("/findings") => {
            if state.findings_failures > 0 {
                state.findings_failures -= 1;
                return (503, r#"{"data":null,"error":{"code":"unavailable"}}"#.to_string());
            }
            let scan_id = path.trim_start_matches("/runners/jobs/").trim_end_matches("/findings").to_string();
            state.findings.push((scan_id, request.body.clone()));
            match state.findings_answer {
                Some(status @ (0 | 400..=599)) => (status, r#"{"data":null,"error":{"code":"conflict"}}"#.to_string()),
                _ => (200, format!(r#"{{"data":{{"accepted":{},"dropped":0}},"error":null}}"#, batch_of(&request.body).len())),
            }
        }
        ("POST", path) if live && path.starts_with("/runners/jobs/") && path.ends_with("/result") => {
            let scan_id = path.trim_start_matches("/runners/jobs/").trim_end_matches("/result").to_string();
            state.findings_before_result.push(state.findings.len());
            state.results.push((scan_id, request.body.clone()));
            if state.remove_after_result {
                state.live.clear();
            }
            (200, r#"{"data":{"ok":true},"error":null}"#.to_string())
        }
        _ => (REJECTED.0, REJECTED.1.to_string()),
    }
}

pub const OTHER_ACCOUNT_ID: &str = "7c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f";
pub const SCOPE_REFUSED: &str = "This CLI access cannot do this";
const OTHER_ACCOUNT_REFUSED: &str = "This CLI access belongs to another account";

fn data(value: serde_json::Value) -> (u16, String) {
    (200, serde_json::json!({ "data": value, "error": null }).to_string())
}

fn refusal(status: u16, message: &str) -> (u16, String) {
    (status, serde_json::json!({ "data": null, "error": { "code": "refused", "message": message } }).to_string())
}

fn query_value(query: &str, name: &str) -> Option<String> {
    query.split('&').find_map(|pair| pair.split_once('=').filter(|(key, _)| *key == name).map(|(_, value)| value.to_string()))
}

fn cli_answer(request: &Request, state: &mut State) -> (u16, String) {
    let token = request.bearer.clone().unwrap_or_default();
    let (route, query) = request.path.split_once('?').unwrap_or((request.path.as_str(), ""));
    if route == "/me" {
        state.access_calls.push(token.clone());
    }
    if !state.access_live.contains(&token) {
        return (REJECTED.0, REJECTED.1.to_string());
    }
    state.access_requests.push(format!("{} {}", request.method, request.path));
    let scope = state.access_scopes.get(&token).map(String::as_str).unwrap_or("start");
    if request.method != "GET" && scope == "read" {
        return refusal(403, SCOPE_REFUSED);
    }
    let segments: Vec<&str> = route.trim_matches('/').split('/').collect();
    if segments != ["me"] {
        match request.account.as_deref() {
            None => return refusal(400, "x-account-id: must be the ID of one of your accounts"),
            Some(account) if account != ACCOUNT_ID => return refusal(403, OTHER_ACCOUNT_REFUSED),
            Some(_) => {}
        }
    }
    let repo_of = |state: &State, id: &str| state.repos.iter().find(|repo| repo["id"] == id).cloned();
    match (request.method.as_str(), segments.as_slice()) {
        ("GET", ["me"]) => {
            let mut accounts =
                vec![serde_json::json!({ "id": ACCOUNT_ID, "name": ACCOUNT_NAME, "slug": "acme", "role": "admin", "roleLabel": "Admin" })];
            if state.other_account_first {
                accounts.insert(
                    0,
                    serde_json::json!({ "id": OTHER_ACCOUNT_ID, "name": "Other", "slug": "other", "role": "admin", "roleLabel": "Admin" }),
                );
            }
            data(serde_json::json!({
                "user": { "id": "user-1", "name": "Dev", "email": "dev@example.com" },
                "partyType": "person",
                "isSuperuser": false,
                "accounts": accounts,
            }))
        }
        ("GET", ["repos"]) => data(serde_json::json!({ "repos": state.repos })),
        ("GET", ["repos", id]) => match repo_of(state, id) {
            Some(mut repo) => {
                repo["branches"] = state.branches.get(*id).cloned().unwrap_or_default().into();
                repo["history"] = serde_json::json!([]);
                data(repo)
            }
            None => refusal(404, "Repo not found"),
        },
        ("GET", ["repos", id, "verdict"]) => {
            let commit = query_value(query, "commit").unwrap_or_default();
            match state.verdicts.get(&(id.to_string(), commit)) {
                Some(verdict) => data(verdict.clone()),
                None => refusal(404, "No verdict for that commit"),
            }
        }
        ("GET", ["projects"]) => data(serde_json::json!(state.projects)),
        ("GET", ["scans"]) => {
            let limit: usize = query_value(query, "limit").and_then(|limit| limit.parse().ok()).unwrap_or(50);
            let (repo_id, cursor) = (query_value(query, "repoId"), query_value(query, "cursor"));
            let mut scans: Vec<&serde_json::Value> = state
                .scans
                .iter()
                .filter(|scan| repo_id.as_ref().is_none_or(|id| scan["repoId"] == id.as_str()))
                .filter(|scan| cursor.as_ref().is_none_or(|after| scan["scanId"].as_str().unwrap_or_default() > after.as_str()))
                .collect();
            scans.sort_by_key(|scan| scan["scanId"].as_str().unwrap_or_default().to_string());
            let next = (scans.len() > limit).then(|| scans[limit - 1]["scanId"].clone());
            scans.truncate(limit);
            data(serde_json::json!({ "scans": scans, "nextCursor": next }))
        }
        ("GET", ["scans", id]) => match state.scans.iter().find(|scan| scan["scanId"] == *id) {
            Some(scan) => data(scan.clone()),
            None => refusal(404, "Scan not found"),
        },
        _ => (REJECTED.0, REJECTED.1.to_string()),
    }
}

pub fn repo_json(id: &str, provider: &str, host: Option<&str>, canonical: &str) -> serde_json::Value {
    let url = match (provider, host) {
        ("github", _) => format!("https://github.com/{canonical}"),
        (_, Some(host)) => format!("https://{host}/{canonical}"),
        _ => canonical.to_string(),
    };
    serde_json::json!({
        "id": id,
        "provider": provider,
        "host": host,
        "url": url,
        "canonical": canonical,
        "isPrivate": false,
        "projectId": null,
        "defaultBranch": "main",
        "branchNames": ["main"],
        "scans": 0,
        "lastScanId": null,
        "lastScanStatus": null,
        "lastScanAt": null,
        "open": {
            "total": 0,
            "severity": { "critical": 0, "high": 0, "medium": 0, "low": 0, "informational": 0 },
            "needsValidation": 0,
            "regressed": 0,
            "unchecked": 0,
        },
    })
}

pub fn branch_json(name: &str, is_default: bool, latest_scan_id: Option<&str>, latest_commit: Option<&str>) -> serde_json::Value {
    serde_json::json!({
        "id": "3f1e2d4c-5b6a-4978-8a9b-0c1d2e3f4a5b",
        "name": name,
        "isDefault": is_default,
        "open": {
            "total": 0,
            "severity": { "critical": 0, "high": 0, "medium": 0, "low": 0, "informational": 0 },
            "needsValidation": 0,
            "regressed": 0,
            "unchecked": 0,
        },
        "latestScanId": latest_scan_id,
        "latestCommit": latest_commit,
        "latestScanAt": latest_scan_id.map(|_| "2026-11-20T10:00:00.000Z"),
        "fullScanId": null,
    })
}

pub fn scan_json(scan_id: &str, repo_id: &str, repo: &str, status: &str) -> serde_json::Value {
    serde_json::json!({
        "scanId": scan_id,
        "accountId": ACCOUNT_ID,
        "repo": repo,
        "repoId": repo_id,
        "skill": "full",
        "model": "claude-sonnet-5-5",
        "effort": "high",
        "profile": "standard",
        "maxBudgetUsd": 12,
        "branch": "main",
        "status": status,
        "createdAt": "2026-11-20T10:00:00.000Z",
        "updatedAt": "2026-11-20T10:05:00.000Z",
        "finishedAt": null,
        "error": null,
        "files": null,
    })
}

pub fn verdict_json(commit: &str, verdict: &str) -> serde_json::Value {
    serde_json::json!({
        "verdict": verdict,
        "basis": "ai_audit",
        "commit": commit,
        "reasons": if verdict == "pass" { serde_json::json!([]) } else { serde_json::json!([{ "code": "too_few_scans", "message": "One more full Scan is needed before this can pass." }]) },
        "scans": { "required": 2, "counted": 1, "ids": [] },
        "limits": { "critical": 0, "high": 0, "medium": 5 },
        "counts": { "critical": 0, "high": 1, "medium": 2, "low": 0, "informational": 0, "needsValidation": 1 },
        "open": [],
        "accepted": [],
        "dismissed": [],
    })
}

pub fn temp_home() -> PathBuf {
    static NEXT: AtomicUsize = AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!("elise-test-{}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::SeqCst)));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

pub struct Output {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

pub struct Runner {
    pub home: PathBuf,
    pub url: String,
    pub env: Vec<(&'static str, String)>,
    pub cwd: Option<PathBuf>,
    engine: Arc<Mutex<State>>,
}

impl Runner {
    pub fn new(engine: &Engine) -> Runner {
        Runner {
            home: temp_home(),
            url: engine.url.clone(),
            env: vec![("ELISE_LOGIN_CHECK_MS", "50".to_string()), ("ELISE_JOB_CHECK_MS", "200".to_string())],
            cwd: None,
            engine: engine.state.clone(),
        }
    }

    pub fn run(&self, args: &[&str], stdin: &str) -> Output {
        let output = self.run_allowing_token(args, stdin);
        for token in issued_tokens(&self.engine.lock().unwrap()) {
            assert!(
                !output.stdout.contains(&token) && !output.stderr.contains(&token),
                "a token leaked into the output of {args:?}:\n{}\n{}",
                output.stdout,
                output.stderr
            );
        }
        output
    }

    pub fn run_allowing_token(&self, args: &[&str], stdin: &str) -> Output {
        let mut child = self.command(args).spawn().expect("the elise binary starts");
        let _ = child.stdin.take().unwrap().write_all(stdin.as_bytes());
        let output = child.wait_with_output().unwrap();
        Output {
            code: output.status.code().expect("the program exited, not killed"),
            stdout: String::from_utf8(output.stdout).unwrap(),
            stderr: String::from_utf8(output.stderr).unwrap(),
        }
    }

    fn command(&self, args: &[&str]) -> Command {
        let mut command = Command::new(env!("CARGO_BIN_EXE_elise"));
        command
            .args(args)
            .env_remove("ELISE_RUNNER_TOKEN")
            .env_remove("ELISE_TOKEN")
            .env_remove("GIT_DIR")
            .env_remove("GIT_WORK_TREE")
            .env_remove("GIT_INDEX_FILE")
            .env_remove("GIT_PREFIX")
            .env_remove("SSH_CONNECTION")
            .env_remove("DISPLAY")
            .env_remove("WAYLAND_DISPLAY")
            .env("ELISE_RUNNER_HOME", &self.home)
            .env("ELISE_ENGINE_URL", &self.url)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        for (name, value) in &self.env {
            command.env(name, value);
        }
        if let Some(cwd) = &self.cwd {
            command.current_dir(cwd);
        }
        command
    }

    pub fn start(&self, args: &[&str]) -> Running {
        let mut child = self.command(args).spawn().expect("the elise binary starts");
        let collect = |mut pipe: Box<dyn Read + Send>| {
            let text = Arc::new(Mutex::new(String::new()));
            let shared = text.clone();
            std::thread::spawn(move || {
                let mut chunk = [0; 4096];
                while let Ok(read) = pipe.read(&mut chunk) {
                    if read == 0 {
                        break;
                    }
                    shared.lock().unwrap().push_str(&String::from_utf8_lossy(&chunk[..read]));
                }
            });
            text
        };
        let stdout = collect(Box::new(child.stdout.take().unwrap()));
        let stderr = collect(Box::new(child.stderr.take().unwrap()));
        Running { child, stdout, stderr, engine: self.engine.clone() }
    }

    pub fn home_files(&self) -> Vec<PathBuf> {
        std::fs::read_dir(&self.home).unwrap().map(|entry| entry.unwrap().path()).collect()
    }

    pub fn stub_browser(&mut self) -> Browser {
        let root = temp_home();
        let (bin, record) = (root.join("bin"), root.join("opened"));
        std::fs::create_dir_all(&bin).unwrap();
        for opener in ["open", "xdg-open"] {
            install_stub(&bin, opener);
        }
        self.env.push(("PATH", path_with(&bin, system_path())));
        self.env.push(("DISPLAY", ":0".to_string()));
        Browser { record }
    }

    pub fn stub_tools(&mut self, tools: &[&str]) -> Stubs {
        self.stub_tool_folder(tools, true)
    }

    pub fn stub_tools_without_git(&mut self, tools: &[&str]) -> Stubs {
        self.stub_tool_folder(tools, false)
    }

    fn stub_tool_folder(&mut self, tools: &[&str], with_git: bool) -> Stubs {
        let root = temp_home();
        let (bin, record, tmp) = (root.join("bin"), root.join("record"), root.join("tmp"));
        for dir in [&bin, &record, &tmp] {
            std::fs::create_dir_all(dir).unwrap();
        }
        if with_git {
            install_stub(&bin, "git");
        }
        for tool in tools {
            assert!(["claude", "node", "real-node"].contains(tool), "no stub for {tool}");
            if *tool == "real-node" {
                install_real_node(&bin);
            } else {
                install_stub(&bin, tool);
            }
        }
        let rest = if with_git { system_path() } else { vec![] };
        self.env.push(("PATH", path_with(&bin, rest)));
        for name in ["TMPDIR", "TEMP", "TMP"] {
            self.env.push((name, tmp.display().to_string()));
        }
        Stubs { record, tmp }
    }
}

pub struct Running {
    child: std::process::Child,
    stdout: Arc<Mutex<String>>,
    stderr: Arc<Mutex<String>>,
    engine: Arc<Mutex<State>>,
}

impl Running {
    pub fn wait_for_output(&self, text: &str) {
        let ready = until(|| self.stdout.lock().unwrap().contains(text));
        assert!(ready, "no {text:?} in the output: {}", self.stdout.lock().unwrap());
    }

    pub fn wait_for_error_output(&self, text: &str) {
        let ready = until(|| self.stderr.lock().unwrap().contains(text));
        assert!(ready, "no {text:?} in the error output: {}", self.stderr.lock().unwrap());
    }

    #[cfg(unix)]
    pub fn signal(&self, name: &str) {
        let sent = Command::new("kill").args(["-s", name, &self.child.id().to_string()]).status().unwrap();
        assert!(sent.success(), "kill -s {name} failed");
    }

    pub fn finish(mut self) -> Output {
        let mut status = None;
        until(|| {
            status = self.child.try_wait().unwrap();
            status.is_some()
        });
        let Some(status) = status else {
            let _ = self.child.kill();
            panic!("the program did not exit: {}{}", self.stdout.lock().unwrap(), self.stderr.lock().unwrap());
        };
        std::thread::sleep(std::time::Duration::from_millis(100));
        let output = Output {
            code: status.code().expect("the program exited, not killed"),
            stdout: self.stdout.lock().unwrap().clone(),
            stderr: self.stderr.lock().unwrap().clone(),
        };
        for token in issued_tokens(&self.engine.lock().unwrap()) {
            assert!(!output.stdout.contains(&token) && !output.stderr.contains(&token), "a token leaked into the output");
        }
        output
    }
}

fn until(mut done: impl FnMut() -> bool) -> bool {
    for _ in 0..600 {
        if done() {
            return true;
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    false
}

#[cfg(unix)]
pub fn alive(pid: u32) -> bool {
    Command::new("kill").args(["-0", &pid.to_string()]).stderr(Stdio::null()).status().unwrap().success()
}

#[cfg(windows)]
pub fn alive(pid: u32) -> bool {
    let listed = Command::new("tasklist").args(["/FI", &format!("PID eq {pid}"), "/NH"]).output().unwrap();
    String::from_utf8_lossy(&listed.stdout).split_whitespace().any(|word| word == pid.to_string())
}

pub struct Browser {
    record: PathBuf,
}

impl Browser {
    pub fn opened(&self) -> Vec<String> {
        std::fs::read_to_string(&self.record).unwrap_or_default().lines().map(str::to_string).collect()
    }

    pub fn wait_for_a_call(&self) {
        let called = until(|| !self.opened().is_empty());
        assert!(called, "the browser was never opened");
    }
}

pub struct Stubs {
    pub record: PathBuf,
    pub tmp: PathBuf,
}

impl Stubs {
    // What git was asked to do, one call per line.
    pub fn git_calls(&self) -> String {
        std::fs::read_to_string(self.record.join("git.txt")).unwrap_or_default()
    }

    pub fn sign_claude_out(&self) {
        std::fs::write(self.record.join("claude-signed-out"), "").unwrap();
    }

    pub fn fail_branch_list(&self, stderr: &str) {
        std::fs::write(self.record.join("ls-remote.stderr"), stderr).unwrap();
    }

    pub fn git_config(&self) -> String {
        std::fs::read_to_string(self.record.join("git-config.txt")).unwrap_or_default()
    }

    pub fn git_helper_answers(&self) -> String {
        std::fs::read_to_string(self.record.join("git-helper.txt")).unwrap_or_default()
    }

    pub fn repair_prompt(&self) -> String {
        std::fs::read_to_string(self.record.join("repair-prompt.txt")).unwrap_or_default()
    }

    pub fn work_folder(&self, scan_id: &str) -> PathBuf {
        self.tmp.join(format!("eliselab-runner-{scan_id}"))
    }

    pub fn waiting_agents(&self, count: usize) -> Vec<u32> {
        let file = self.record.join("waiting-all.txt");
        let read =
            || std::fs::read_to_string(&file).unwrap_or_default().lines().filter_map(|line| line.trim().parse().ok()).collect::<Vec<u32>>();
        let ready = until(|| read().len() >= count);
        assert!(ready, "fewer than {count} stub agents started waiting");
        read()
    }

    pub fn waiting_agent(&self) -> u32 {
        let file = self.record.join("waiting.pid");
        let ready = until(|| file.is_file());
        assert!(ready, "the stub claude never started waiting");
        std::fs::read_to_string(file).unwrap().trim().parse().unwrap()
    }
}

fn install_stub(bin: &std::path::Path, tool: &str) {
    std::fs::copy(env!("CARGO_BIN_EXE_elise-stub-tool"), bin.join(format!("{tool}{}", std::env::consts::EXE_SUFFIX))).unwrap();
}

fn install_real_node(bin: &std::path::Path) {
    let path = std::env::var_os("PATH").unwrap_or_default();
    let node = std::env::split_paths(&path)
        .map(|folder| folder.join(format!("node{}", std::env::consts::EXE_SUFFIX)))
        .find(|candidate| candidate.is_file())
        .expect("a test with the real validators needs node on PATH");
    let target = bin.join(format!("node{}", std::env::consts::EXE_SUFFIX));
    #[cfg(unix)]
    std::os::unix::fs::symlink(&node, &target).unwrap();
    #[cfg(not(unix))]
    std::fs::copy(&node, &target).unwrap();
}

fn system_path() -> Vec<PathBuf> {
    if cfg!(unix) {
        vec!["/usr/bin".into(), "/bin".into()]
    } else {
        vec![r"C:\Program Files\Git\usr\bin".into(), r"C:\Program Files\Git\bin".into()]
    }
}

fn path_with(first: &std::path::Path, rest: Vec<PathBuf>) -> String {
    std::env::join_paths(std::iter::once(first.to_path_buf()).chain(rest)).unwrap().to_string_lossy().into_owned()
}
