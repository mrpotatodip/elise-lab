use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

fn main() {
    let exe = std::env::current_exe().expect("the stub knows its own path");
    let name = exe.file_stem().and_then(|stem| stem.to_str()).unwrap_or_default().to_string();
    let root = exe.parent().and_then(Path::parent).expect("the stub sits in <root>/bin").to_path_buf();
    let args: Vec<String> = std::env::args().skip(1).collect();
    match name.as_str() {
        "git" => git(&root.join("record"), &args),
        "claude" => claude(&root.join("record"), &args),
        "node" => {}
        "open" | "xdg-open" => append(&root.join("opened"), args.first().map_or("", String::as_str)),
        other => panic!("no stub for {other}"),
    }
}

fn append(path: &Path, line: &str) {
    let mut file = OpenOptions::new().create(true).append(true).open(path).unwrap();
    writeln!(file, "{line}").unwrap();
}

fn git(record: &Path, args: &[String]) {
    append(&record.join("git.txt"), &args.join(" "));
    if let Ok(count) = std::env::var("GIT_CONFIG_COUNT") {
        fs::write(record.join("git-config.txt"), "").unwrap();
        fs::write(record.join("git-helper.txt"), "").unwrap();
        for i in 0..count.parse::<usize>().unwrap_or(0) {
            let key = std::env::var(format!("GIT_CONFIG_KEY_{i}")).unwrap_or_default();
            let value = std::env::var(format!("GIT_CONFIG_VALUE_{i}")).unwrap_or_default();
            append(&record.join("git-config.txt"), &format!("{key}={value}"));
            if let Some(helper) = value.strip_prefix('!') {
                for host in ["github.com", "gitlab.com", "evil.example"] {
                    for line in ask_helper(helper, host).lines() {
                        append(&record.join("git-helper.txt"), &format!("{host} {line}"));
                    }
                }
            }
        }
    }
    let first = args.first().map_or("", String::as_str);
    if std::env::var("STUB_GIT_FAILS").is_ok_and(|value| !value.is_empty()) && first != "ls-remote" {
        eprintln!("fatal: Authentication failed");
        std::process::exit(128);
    }
    match first {
        "ls-remote" => {
            if let Ok(text) = fs::read_to_string(record.join("ls-remote.stderr")) {
                eprint!("{text}");
                std::process::exit(128);
            }
        }
        "clone" => {
            let target = PathBuf::from(args.last().unwrap());
            fs::create_dir_all(&target).unwrap();
            fs::write(target.join("README"), "hello\n").unwrap();
        }
        "-C" => match (args.get(2).map(String::as_str), args.get(3).map(String::as_str)) {
            (Some("rev-parse"), Some("HEAD")) => println!("0123456789abcdef0123456789abcdef01234567"),
            (Some("rev-parse"), Some("--abbrev-ref")) => println!("main"),
            _ => {}
        },
        _ => {}
    }
}

fn ask_helper(helper: &str, host: &str) -> String {
    let mut child = Command::new("sh")
        .arg("-c")
        .arg(format!("{helper} get"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("sh starts the credential helper");
    let question = format!("protocol=https\nhost={host}\n\n");
    child.stdin.take().unwrap().write_all(question.as_bytes()).unwrap();
    String::from_utf8_lossy(&child.wait_with_output().unwrap().stdout).into_owned()
}

fn claude(record: &Path, args: &[String]) {
    if args.len() >= 2 && args[0] == "auth" && args[1] == "status" {
        if record.join("claude-signed-out").exists() {
            eprintln!("Not logged in");
            std::process::exit(1);
        }
        println!("Logged in");
        return;
    }
    let prompt = args.last().map_or("", String::as_str);
    if prompt.contains("phase=recon") {
        let env: String = std::env::vars().map(|(name, value)| format!("{name}={value}\n")).collect();
        fs::write(record.join("env.txt"), env).unwrap();
        fs::copy(".claude/settings.json", record.join("settings.json")).unwrap();
        fs::copy(".claude/skills/security-audit/SKILL.md", record.join("SKILL.md")).unwrap();
        let mut files = Vec::new();
        list(Path::new("repo"), "./", &mut files);
        files.sort();
        fs::write(record.join("repo.txt"), files.iter().map(|file| format!("{file}\n")).collect::<String>()).unwrap();
    }
    if prompt.contains("stop=crash") {
        eprintln!("the agent said: boom");
        std::process::exit(2);
    }
    if prompt.contains("stop=slow") {
        std::thread::sleep(std::time::Duration::from_secs(2));
    }
    if prompt.contains("stop=wait") {
        println!("the agent was half way through");
        let pid = std::process::id().to_string();
        append(&record.join("waiting-all.txt"), &pid);
        fs::write(record.join("waiting.tmp"), format!("{pid}\n")).unwrap();
        fs::rename(record.join("waiting.tmp"), record.join("waiting.pid")).unwrap();
        std::thread::sleep(std::time::Duration::from_secs(600));
        return;
    }
    if prompt.contains("phase=check") {
        fs::write("out/findings.json", "{\"findings\":[]}\n").unwrap();
        fs::write("out/coverage-ledger.json", "{\"units\":[]}\n").unwrap();
        let live = Path::new("out/live-findings.jsonl");
        if prompt.contains("live=spread") {
            append(live, r#"{"verdict":"confirmed","fingerprint":"fp-1"}"#);
            append(live, "not json");
            append(live, r#"{"verdict":"rejected","fingerprint":"fp-no"}"#);
            append(live, r#"{"verdict":"needs_validation","fingerprint":"fp-2"}"#);
            std::thread::sleep(std::time::Duration::from_secs(3));
            append(live, r#"{"verdict":"confirmed","fingerprint":"fp-3"}"#);
        } else if prompt.contains("live=late") {
            append(live, r#"{"verdict":"confirmed","fingerprint":"fp-late"}"#);
        }
    }
    if prompt.contains("phase=report") {
        fs::write("out/REPORT.md", "# Report\n").unwrap();
    }
    let cost = prompt.rfind("cost=").map(|at| &prompt[at + 5..]).map_or("", |rest| {
        let end = rest.find(|c: char| !(c.is_ascii_digit() || c == '.')).unwrap_or(rest.len());
        &rest[..end]
    });
    let cost = if cost.is_empty() { "0" } else { cost };
    println!(
        r#"{{"type":"result","subtype":"success","is_error":false,"total_cost_usd":{cost},"num_turns":1,"duration_ms":10,"usage":{{}}}}"#
    );
}

fn list(dir: &Path, prefix: &str, files: &mut Vec<String>) {
    let shown = |name: &str| format!("{prefix}{name}");
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if entry.path().is_dir() {
            list(&entry.path(), &format!("{}/", shown(&name)), files);
        } else {
            files.push(shown(&name));
        }
    }
}
