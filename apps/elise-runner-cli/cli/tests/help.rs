mod support;

use serde_json::Value;
use support::{Engine, Runner};

fn offline_runner() -> Runner {
    let mut runner = Runner::new(&Engine::start());
    runner.url = Engine::unreachable_url();
    runner
}

fn table(runner: &Runner) -> Value {
    let output = runner.run(&["commands", "--json"], "");
    assert_eq!(output.code, 0, "{}", output.stderr);
    serde_json::from_str(&output.stdout).expect("commands --json prints one JSON object")
}

fn texts<'a>(value: &'a Value, key: &str) -> Vec<&'a str> {
    value[key].as_array().unwrap().iter().map(|item| item.as_str().unwrap()).collect()
}

#[test]
fn every_command_page_has_what_a_caller_needs() {
    let runner = offline_runner();
    let table = table(&runner);
    let commands = table["commands"].as_array().unwrap();
    assert!(commands.len() >= 9, "{commands:?}");

    for command in commands {
        let name = command["name"].as_str().unwrap();
        let page = runner.run(&[name, "--help"], "");
        assert_eq!(page.code, 0, "{name}: {}", page.stderr);
        let page = page.stdout;
        assert!(page.contains(command["summary"].as_str().unwrap()), "{name} summary:\n{page}");
        assert!(page.contains(command["usage"].as_str().unwrap()), "{name} usage:\n{page}");
        assert!(page.contains(command["needs"].as_str().unwrap()), "{name} needs:\n{page}");
        assert!(page.contains(command["json"].as_str().unwrap()), "{name} JSON shape:\n{page}");
        for flag in command["flags"].as_array().unwrap() {
            let flag_name = flag["name"].as_str().unwrap();
            assert!(page.contains(flag_name), "{name} {flag_name}:\n{page}");
            assert!(page.contains(flag["default"].as_str().unwrap()), "{name} {flag_name} default:\n{page}");
            assert!(page.contains(flag["cost"].as_str().unwrap()), "{name} {flag_name} cost:\n{page}");
        }
        let examples = texts(command, "examples");
        assert!((2..=4).contains(&examples.len()), "{name}: {examples:?}");
        assert!(examples.iter().any(|example| example.contains("--json")), "{name} has no --json example");
        assert!(examples.iter().any(|example| example.contains("# CI")), "{name} has no CI example");
        for example in examples {
            assert!(page.contains(example), "{name} example:\n{page}");
        }
        for code in command["exits"].as_array().unwrap() {
            assert!(page.contains(&format!("{}  ", code)), "{name} exit {code}:\n{page}");
        }
    }
}

#[test]
fn the_parser_accepts_exactly_the_flags_the_table_lists() {
    let runner = offline_runner();
    let table = table(&runner);
    let commands = table["commands"].as_array().unwrap();
    let mut every_flag: Vec<&str> = vec!["--zz-undocumented", "--parallel", "--yes", "--once", "--json"];
    for command in commands {
        for flag in command["flags"].as_array().unwrap() {
            every_flag.push(flag["name"].as_str().unwrap());
        }
    }

    for command in commands {
        let name = command["name"].as_str().unwrap();
        if name == "help" {
            continue;
        }
        let listed: Vec<&str> = command["flags"].as_array().unwrap().iter().map(|flag| flag["name"].as_str().unwrap()).collect();
        for flag in &every_flag {
            let mut args = vec![name];
            if matches!(name, "pair" | "resume") {
                args.push("X");
            }
            args.push(flag);
            if *flag == "--parallel" {
                args.push("2");
            }
            let output = runner.run(&args, "");
            let refused = output.code == 2 && output.stderr.contains("does not take");
            assert_eq!(!refused, listed.contains(flag), "{name} {flag}: exit {} {}", output.code, output.stderr);
        }
    }
}

#[test]
fn the_table_holds_the_exit_codes_and_every_topic_renders() {
    let runner = offline_runner();
    let table = table(&runner);
    let codes: Vec<i64> = table["exitCodes"].as_array().unwrap().iter().map(|code| code["code"].as_i64().unwrap()).collect();
    assert_eq!(codes, [0, 1, 2, 3, 4, 5, 6, 7]);

    let topics = table["topics"].as_array().unwrap();
    let names: Vec<&str> = topics.iter().map(|topic| topic["name"].as_str().unwrap()).collect();
    assert_eq!(names, ["auth", "exit-codes", "json", "profiles", "repos", "ids", "agents"]);
    for topic in names {
        let page = runner.run(&["help", topic], "");
        assert_eq!(page.code, 0, "{topic}: {}", page.stderr);
        assert!(!page.stdout.trim().is_empty(), "{topic}");
    }
    let exit_page = runner.run(&["help", "exit-codes"], "");
    assert!(exit_page.stdout.contains("7  run --once: a Scan was stopped from Elise"), "{}", exit_page.stdout);
}

#[test]
fn the_top_help_groups_commands_one_line_each() {
    let runner = offline_runner();
    let table = table(&runner);

    let help = runner.run(&["--help"], "");

    assert_eq!(help.code, 0);
    for command in table["commands"].as_array().unwrap() {
        let line = format!("{:<10}{}", command["name"].as_str().unwrap(), command["summary"].as_str().unwrap());
        assert!(help.stdout.lines().any(|found| found.trim() == line.trim()), "{line}\n{}", help.stdout);
    }
    assert!(help.stdout.contains("Run Scans:"), "{}", help.stdout);
}

#[test]
fn a_mistyped_command_suggests_the_right_one_and_exits_2() {
    let runner = offline_runner();

    let output = runner.run(&["stauts"], "");

    assert_eq!(output.code, 2);
    assert!(output.stderr.contains("Did you mean `elise status`?"), "{}", output.stderr);
}

#[test]
fn an_unknown_topic_exits_2() {
    let runner = offline_runner();

    let output = runner.run(&["help", "nonsense"], "");

    assert_eq!(output.code, 2);
    assert!(output.stderr.contains("no help for `nonsense`"), "{}", output.stderr);
}

const PINNED_EXIT_CODES: [(i64, &str, &str); 8] = [
    (0, "ok", "success; status: connected"),
    (1, "error", "an error"),
    (2, "usage", "bad command-line usage"),
    (3, "unpaired", "this computer has no token"),
    (4, "revoked", "Elise rejected the token"),
    (5, "offline", "Elise could not be reached"),
    (6, "nothing_to_claim", "run --once: nothing to claim"),
    (7, "stopped_from_elise", "run --once: a Scan was stopped from Elise"),
];

#[test]
fn the_exit_code_table_is_pinned_and_shown_in_all_four_places() {
    let runner = offline_runner();
    let table = table(&runner);

    let json: Vec<(i64, &str, &str)> = table["exitCodes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|code| (code["code"].as_i64().unwrap(), code["name"].as_str().unwrap(), code["meaning"].as_str().unwrap()))
        .collect();
    assert_eq!(json, PINNED_EXIT_CODES);

    let top_help = runner.run(&["--help"], "").stdout;
    let topic = runner.run(&["help", "exit-codes"], "").stdout;
    let readme = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/README.md")).unwrap();
    for (code, _, meaning) in PINNED_EXIT_CODES {
        let line = format!("  {code}  {meaning}");
        assert!(top_help.lines().any(|found| found == line), "--help lacks `{line}`:\n{top_help}");
        assert!(topic.lines().any(|found| found == line), "help exit-codes lacks `{line}`:\n{topic}");
        let row = format!("| {code} | {meaning} |");
        assert!(readme.lines().any(|found| found == row), "README lacks `{row}`");
    }
}
