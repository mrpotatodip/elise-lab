// The process-test harness: the debug `elise-runner` run against a stub engine on a local port,
// with `ELISE_RUNNER_HOME` set to a temp folder so the token lands in the file store and no test
// ever touches a keychain.

use std::collections::BTreeSet;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

pub const CODE: &str = "PAIR-CODE-1";
pub const RUNNER_NAME: &str = "build-box";
pub const ACCOUNT_NAME: &str = "Acme Security";

// What the stub engine knows: the tokens it issued that are still live, and every token it was
// asked to revoke.
#[derive(Default)]
struct State {
    issued: usize,
    live: BTreeSet<String>,
    revoked: Vec<String>,
    // Elise is down for revokes only: `DELETE /runners/me` answers 503.
    revokes_fail: bool,
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

    // A URL where nothing listens: Elise cannot be reached.
    pub fn unreachable_url() -> String {
        let listener = TcpListener::bind("127.0.0.1:0").expect("a free local port");
        format!("http://{}", listener.local_addr().unwrap())
    }

    // The tokens issued so far, in order: `tokens()[0]` is the first pairing's.
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

    // An admin removes every Runner in the dashboard: Elise rejects their tokens from now on.
    pub fn remove_all_runners(&self) {
        self.state.lock().unwrap().live.clear();
    }

    // Elise answers revokes with an error from now on: an old token cannot be dropped.
    pub fn fail_revokes(&self) {
        self.state.lock().unwrap().revokes_fail = true;
    }
}

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
    let (status, body) = answer(&request, &mut state.lock().unwrap());
    let reason = if status == 200 { "OK" } else { "Error" };
    let _ = write!(
        stream,
        "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
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
        _ => (REJECTED.0, REJECTED.1.to_string()),
    }
}

// A temp folder of the test's own, used as `ELISE_RUNNER_HOME`.
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

// One Runner on this computer: its own home folder, pointed at one engine. Each run gets a clean
// environment (no inherited token, home or URL) plus `env`.
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

    // Runs the program and checks that no token the engine issued is in what it printed.
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

    // Only for `pair --print-token`, the one command that prints the token.
    pub fn run_allowing_token(&self, args: &[&str], stdin: &str) -> Output {
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
        let mut child = command.spawn().expect("the elise-runner binary starts");
        // A program that exits without reading its input closes the pipe; that is not a failure.
        let _ = child.stdin.take().unwrap().write_all(stdin.as_bytes());
        let output = child.wait_with_output().unwrap();
        Output {
            code: output.status.code().expect("the program exited, not killed"),
            stdout: String::from_utf8(output.stdout).unwrap(),
            stderr: String::from_utf8(output.stderr).unwrap(),
        }
    }

    // The files in the Runner's home folder.
    pub fn home_files(&self) -> Vec<PathBuf> {
        std::fs::read_dir(&self.home).unwrap().map(|entry| entry.unwrap().path()).collect()
    }
}
