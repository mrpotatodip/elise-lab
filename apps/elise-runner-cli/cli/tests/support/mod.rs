#![allow(dead_code)]

use std::collections::{BTreeSet, VecDeque};
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
    results: Vec<(String, String)>,
    remove_after_result: bool,
    claims_held: bool,
    a_claim_was_held: bool,
}

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

    pub fn remove_runners_after_the_next_result(&self) {
        self.state.lock().unwrap().remove_after_result = true;
    }
}

pub fn job(scan_id: &str, phase_prompts: [&str; 4]) -> String {
    let phases: Vec<serde_json::Value> = ["recon", "hunt", "check", "report"]
        .iter()
        .zip(phase_prompts)
        .map(|(phase, prompt)| serde_json::json!({ "phase": phase, "prompt": prompt }))
        .collect();
    serde_json::json!({
        "scanId": scan_id,
        "repo": REPO_URL,
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

pub const REPO_URL: &str = "https://github.com/acme/widgets";
pub const REPO: &str = "acme/widgets";

fn token_number(n: usize) -> String {
    format!("elise-test-token-{n}-0f9a7c")
}

struct Request {
    method: String,
    path: String,
    bearer: Option<String>,
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
            _ => {}
        }
    }
    let mut body = vec![0; length];
    reader.read_exact(&mut body).ok()?;
    Some(Request { method, path, bearer, body: String::from_utf8(body).ok()? })
}

fn serve(mut stream: TcpStream, state: &Mutex<State>) {
    let Some(request) = read_request(&stream) else {
        return;
    };
    if request.path == "/runners/claim" {
        hold_while_claims_are_held(state);
    }
    let (status, body) = answer(&request, &mut state.lock().unwrap());
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

const REJECTED: (u16, &str) = (401, r#"{"data":null,"error":{"code":"unauthorized"}}"#);

fn answer(request: &Request, state: &mut State) -> (u16, String) {
    let live = request.bearer.as_ref().is_some_and(|token| state.live.contains(token));
    match (request.method.as_str(), request.path.as_str()) {
        ("POST", "/runners/enroll") => {
            if !request.body.contains(&format!("\"{CODE}\"")) {
                return (403, r#"{"data":null,"error":{"code":"invalid_code"}}"#.to_string());
            }
            state.issued += 1;
            let token = token_number(state.issued);
            state.live.insert(token.clone());
            let body = format!(
                r#"{{"data":{{"name":"{RUNNER_NAME}","accountName":"{ACCOUNT_NAME}","token":"{token}"}},"error":null}}"#
            );
            (200, body)
        }
        ("GET", "/runners/me") if live => (
            200,
            format!(r#"{{"data":{{"name":"{RUNNER_NAME}","accountName":"{ACCOUNT_NAME}"}},"error":null}}"#),
        ),
        ("DELETE", "/runners/me") if state.revokes_fail => {
            (503, r#"{"data":null,"error":{"code":"unavailable"}}"#.to_string())
        }
        ("DELETE", "/runners/me") if live => {
            let token = request.bearer.clone().unwrap();
            state.live.remove(&token);
            state.revoked.push(token);
            (200, r#"{"data":{"ok":true},"error":null}"#.to_string())
        }
        ("POST", "/runners/claim") if live => match state.jobs.pop_front() {
            Some(job) => (200, format!(r#"{{"data":{job},"error":null}}"#)),
            None => (200, r#"{"data":null,"error":null}"#.to_string()),
        },
        ("POST", path) if live && path.starts_with("/runners/jobs/") && path.ends_with("/result") => {
            let scan_id = path.trim_start_matches("/runners/jobs/").trim_end_matches("/result").to_string();
            state.results.push((scan_id, request.body.clone()));
            if state.remove_after_result {
                state.live.clear();
            }
            (200, r#"{"data":{"ok":true},"error":null}"#.to_string())
        }
        _ => (REJECTED.0, REJECTED.1.to_string()),
    }
}

pub fn temp_home() -> PathBuf {
    static NEXT: AtomicUsize = AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!(
        "elise-runner-test-{}-{}",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::SeqCst)
    ));
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
    engine: Arc<Mutex<State>>,
}

impl Runner {
    pub fn new(engine: &Engine) -> Runner {
        Runner { home: temp_home(), url: engine.url.clone(), env: Vec::new(), engine: engine.state.clone() }
    }

    pub fn run(&self, args: &[&str], stdin: &str) -> Output {
        let output = self.run_allowing_token(args, stdin);
        let issued = self.engine.lock().unwrap().issued;
        for token in (1..=issued).map(token_number) {
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
        let mut child = self.command(args).spawn().expect("the elise-runner binary starts");
        let _ = child.stdin.take().unwrap().write_all(stdin.as_bytes());
        let output = child.wait_with_output().unwrap();
        Output {
            code: output.status.code().expect("the program exited, not killed"),
            stdout: String::from_utf8(output.stdout).unwrap(),
            stderr: String::from_utf8(output.stderr).unwrap(),
        }
    }

    fn command(&self, args: &[&str]) -> Command {
        let mut command = Command::new(env!("CARGO_BIN_EXE_elise-runner"));
        command
            .args(args)
            .env_remove("ELISE_RUNNER_TOKEN")
            .env("ELISE_RUNNER_HOME", &self.home)
            .env("ELISE_ENGINE_URL", &self.url)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        for (name, value) in &self.env {
            command.env(name, value);
        }
        command
    }

    pub fn start(&self, args: &[&str]) -> Running {
        let mut child = self.command(args).spawn().expect("the elise-runner binary starts");
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
        let issued = self.engine.lock().unwrap().issued;
        Running { child, stdout, stderr, issued }
    }

    pub fn home_files(&self) -> Vec<PathBuf> {
        std::fs::read_dir(&self.home).unwrap().map(|entry| entry.unwrap().path()).collect()
    }

    pub fn stub_tools(&mut self, tools: &[&str]) -> Stubs {
        let root = temp_home();
        let (bin, record, tmp) = (root.join("bin"), root.join("record"), root.join("tmp"));
        for dir in [&bin, &record, &tmp] {
            std::fs::create_dir_all(dir).unwrap();
        }
        executable(&bin.join("git"), STUB_GIT);
        for tool in tools {
            let text = match *tool {
                "claude" => STUB_CLAUDE.replace("__RECORD__", &record.display().to_string()),
                "node" => STUB_NODE.to_string(),
                other => panic!("no stub for {other}"),
            };
            executable(&bin.join(tool), &text);
        }
        self.env.push(("PATH", format!("{}:/usr/bin:/bin", bin.display())));
        self.env.push(("TMPDIR", tmp.display().to_string()));
        Stubs { record, tmp }
    }
}

pub struct Running {
    child: std::process::Child,
    stdout: Arc<Mutex<String>>,
    stderr: Arc<Mutex<String>>,
    issued: usize,
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
        for token in (1..=self.issued).map(token_number) {
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

pub fn alive(pid: u32) -> bool {
    Command::new("kill").args(["-0", &pid.to_string()]).stderr(Stdio::null()).status().unwrap().success()
}

pub struct Stubs {
    pub record: PathBuf,
    pub tmp: PathBuf,
}

impl Stubs {
    pub fn work_folder(&self, scan_id: &str) -> PathBuf {
        self.tmp.join(format!("eliselab-runner-{scan_id}"))
    }

    pub fn waiting_agent(&self) -> u32 {
        let file = self.record.join("waiting.pid");
        let ready = until(|| file.is_file());
        assert!(ready, "the stub claude never started waiting");
        std::fs::read_to_string(file).unwrap().trim().parse().unwrap()
    }
}

fn executable(path: &std::path::Path, text: &str) {
    use std::os::unix::fs::PermissionsExt;
    std::fs::write(path, text).unwrap();
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755)).unwrap();
}

const STUB_GIT: &str = r#"#!/bin/sh
case "$1" in
  clone) for a in "$@"; do last="$a"; done; mkdir -p "$last"; echo hello > "$last/README" ;;
  -C) case "$3 $4" in
        "rev-parse HEAD") echo 0123456789abcdef0123456789abcdef01234567 ;;
        "rev-parse --abbrev-ref") echo main ;;
      esac ;;
esac
"#;

const STUB_CLAUDE: &str = r#"#!/bin/sh
for a in "$@"; do prompt="$a"; done
case "$prompt" in
  *phase=recon*)
    env > "__RECORD__/env.txt"
    cp .claude/settings.json "__RECORD__/settings.json"
    cp .claude/skills/security-audit/SKILL.md "__RECORD__/SKILL.md" ;;
esac
case "$prompt" in *stop=crash*) echo "the agent said: boom" >&2; exit 2 ;; esac
case "$prompt" in
  *stop=wait*)
    echo "the agent was half way through"
    echo $$ > "__RECORD__/waiting.tmp"; mv "__RECORD__/waiting.tmp" "__RECORD__/waiting.pid"
    exec sleep 600 ;;
esac
case "$prompt" in
  *phase=check*) echo '{"findings":[]}' > out/findings.json; echo '{"units":[]}' > out/coverage-ledger.json ;;
  *phase=report*) echo '# Report' > out/REPORT.md ;;
esac
cost=$(printf '%s' "$prompt" | sed -n 's/.*cost=\([0-9.]*\).*/\1/p')
printf '{"type":"result","subtype":"success","is_error":false,"total_cost_usd":%s,"num_turns":1,"duration_ms":10,"usage":{}}\n' "${cost:-0}"
"#;

const STUB_NODE: &str = "#!/bin/sh\nexit 0\n";
