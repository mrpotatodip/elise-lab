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
