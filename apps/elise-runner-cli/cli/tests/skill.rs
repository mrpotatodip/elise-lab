mod support;

use serde_json::Value;
use std::path::{Path, PathBuf};
use support::{Engine, Runner};

fn runner() -> Runner {
    let mut runner = Runner::new(&Engine::start());
    runner.url = Engine::unreachable_url();
    runner
}

fn target(runner: &Runner) -> PathBuf {
    runner.home.join("skills-folder")
}

fn install(runner: &Runner, dir: &Path) -> support::Output {
    runner.run(&["skill", "install", "--dir", dir.to_str().unwrap()], "")
}

fn table(runner: &Runner) -> Value {
    let output = runner.run(&["commands", "--json"], "");
    serde_json::from_str(&output.stdout).expect("commands --json prints one JSON object")
}

#[test]
fn install_writes_a_skill_file_with_frontmatter_into_the_folder_given() {
    let runner = runner();
    let dir = target(&runner);
    let output = install(&runner, &dir);
    assert_eq!(output.code, 0, "{}", output.stderr);
    let text = std::fs::read_to_string(dir.join("SKILL.md")).expect("SKILL.md is in the folder given");
    let mut lines = text.lines();
    assert_eq!(lines.next(), Some("---"));
    let front: Vec<&str> = lines.by_ref().take_while(|line| *line != "---").collect();
    assert!(front.contains(&"name: elise"), "{front:?}");
    assert!(front.iter().any(|line| line.starts_with("description: ") && line.len() > 40), "{front:?}");
}

#[test]
fn the_skill_text_covers_every_command_flag_exit_code_and_json_shape_of_the_table() {
    let runner = runner();
    let table = table(&runner);
    let dir = target(&runner);
    install(&runner, &dir);
    let text = std::fs::read_to_string(dir.join("SKILL.md")).unwrap();
    for command in table["commands"].as_array().unwrap() {
        let name = command["name"].as_str().unwrap();
        for field in ["summary", "usage", "json"] {
            let want = command[field].as_str().unwrap();
            assert!(text.contains(want), "skill lacks {name} {field}: {want}");
        }
        for flag in command["flags"].as_array().unwrap() {
            let flag = flag["name"].as_str().unwrap();
            assert!(text.contains(flag), "skill lacks {name} {flag}");
        }
        for example in command["examples"].as_array().unwrap() {
            assert!(text.contains(example.as_str().unwrap()), "skill lacks a {name} example");
        }
    }
    for code in table["exitCodes"].as_array().unwrap() {
        assert!(text.contains(code["meaning"].as_str().unwrap()), "skill lacks exit code {code}");
    }
    assert!(text.contains("--json") && text.contains("--no-input"));
}

#[test]
fn installing_twice_replaces_the_file() {
    let runner = runner();
    let dir = target(&runner);
    install(&runner, &dir);
    std::fs::write(dir.join("SKILL.md"), "stale").unwrap();
    let second = install(&runner, &dir);
    assert_eq!(second.code, 0, "{}", second.stderr);
    let text = std::fs::read_to_string(dir.join("SKILL.md")).unwrap();
    assert!(text.starts_with("---\n"), "{text}");
    assert!(!text.contains("stale"));
}

#[test]
fn install_prints_a_snippet_for_agents_md_and_names_the_file_written() {
    let runner = runner();
    let dir = target(&runner);
    let output = install(&runner, &dir);
    assert!(output.stdout.contains("AGENTS.md"), "{}", output.stdout);
    assert!(output.stdout.contains("elise commands --json"), "{}", output.stdout);
    assert!(output.stdout.contains("SKILL.md"), "{}", output.stdout);
}

#[test]
fn install_with_json_prints_one_object_with_the_path_and_the_snippet() {
    let runner = runner();
    let dir = target(&runner);
    let output = runner.run(&["skill", "install", "--dir", dir.to_str().unwrap(), "--json"], "");
    assert_eq!(output.code, 0, "{}", output.stderr);
    let result: Value = serde_json::from_str(&output.stdout).expect("one JSON object");
    assert_eq!(result["ok"], true);
    assert_eq!(result["exitCode"], 0);
    assert_eq!(result["path"], dir.join("SKILL.md").to_str().unwrap());
    assert!(result["snippet"].as_str().unwrap().contains("elise commands --json"));
}

#[test]
fn a_folder_that_cannot_be_written_fails_with_exit_1_and_a_json_error() {
    let runner = runner();
    let blocker = runner.home.join("a-file");
    std::fs::write(&blocker, "x").unwrap();
    let dir = blocker.join("inside");
    let output = runner.run(&["skill", "install", "--dir", dir.to_str().unwrap(), "--json"], "");
    assert_eq!(output.code, 1);
    let result: Value = serde_json::from_str(&output.stdout).unwrap();
    assert_eq!(result["ok"], false);
    assert_eq!(result["error"]["code"], "write_failed");
}

#[test]
fn skill_without_install_or_with_a_missing_dir_value_exits_2() {
    let runner = runner();
    let bare = runner.run(&["skill"], "");
    assert_eq!(bare.code, 2);
    assert!(bare.stderr.contains("install"), "{}", bare.stderr);
    let missing = runner.run(&["skill", "install", "--dir"], "");
    assert_eq!(missing.code, 2);
    assert!(missing.stderr.contains("--dir"), "{}", missing.stderr);
}
