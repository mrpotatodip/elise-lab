mod support;

use serde_json::Value;
use support::{Engine, Runner};

fn runner() -> Runner {
    let mut runner = Runner::new(&Engine::start());
    runner.url = Engine::unreachable_url();
    runner
}

fn table(runner: &Runner) -> Value {
    let output = runner.run(&["commands", "--json"], "");
    serde_json::from_str(&output.stdout).expect("commands --json prints one JSON object")
}

#[test]
fn each_shell_script_completes_every_command_flag_and_topic_in_the_table() {
    let runner = runner();
    let table = table(&runner);
    for shell in ["zsh", "bash", "fish"] {
        let output = runner.run(&["completions", shell], "");
        assert_eq!(output.code, 0, "{shell}: {}", output.stderr);
        let script = output.stdout;
        assert!(script.contains("elise"), "{shell}:\n{script}");
        for command in table["commands"].as_array().unwrap() {
            let name = command["name"].as_str().unwrap();
            assert!(script.contains(name), "{shell} lacks command {name}");
            for flag in command["flags"].as_array().unwrap() {
                let long = flag["name"].as_str().unwrap().trim_start_matches('-');
                assert!(script.contains(long), "{shell} lacks {name} --{long}");
                if let Some(short) = flag["short"].as_str() {
                    assert!(script.contains(short.trim_start_matches('-')), "{shell} lacks {name} {short}");
                }
            }
        }
        for topic in table["topics"].as_array().unwrap() {
            let name = topic["name"].as_str().unwrap();
            assert!(script.contains(name), "{shell} lacks topic {name}");
        }
    }
}

fn on_path(shell: &str) -> Option<std::path::PathBuf> {
    let path = std::env::var_os("PATH").unwrap_or_default();
    std::env::split_paths(&path)
        .map(|folder| folder.join(format!("{shell}{}", std::env::consts::EXE_SUFFIX)))
        .find(|candidate| candidate.is_file())
}

#[test]
fn each_shell_script_passes_its_own_shells_syntax_check_where_the_shell_is_installed() {
    let runner = runner();
    let mut checked = vec![];
    for shell in ["bash", "zsh", "fish"] {
        let Some(binary) = on_path(shell) else {
            continue;
        };
        let script = runner.run(&["completions", shell], "").stdout;
        let mut child = std::process::Command::new(binary)
            .arg("-n")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .unwrap();
        std::io::Write::write_all(&mut child.stdin.take().unwrap(), script.as_bytes()).unwrap();
        let checked_output = child.wait_with_output().unwrap();
        assert!(checked_output.status.success(), "{shell} -n rejects the script: {}", String::from_utf8_lossy(&checked_output.stderr));
        checked.push(shell);
    }
    assert!(checked.contains(&"bash"), "bash is not on PATH");
}

#[test]
fn an_unknown_shell_exits_2_and_lists_the_supported_ones() {
    let output = runner().run(&["completions", "powershell"], "");
    assert_eq!(output.code, 2);
    assert_eq!(output.stdout, "");
    assert!(output.stderr.contains("zsh, bash, fish"), "{}", output.stderr);
}

#[test]
fn completions_without_a_shell_exits_2_and_lists_the_supported_ones() {
    let output = runner().run(&["completions"], "");
    assert_eq!(output.code, 2);
    assert!(output.stderr.contains("zsh, bash, fish"), "{}", output.stderr);
}
