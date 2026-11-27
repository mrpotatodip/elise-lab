use crate::json;
use crate::table::{flags, COMMANDS, EXIT_CODES, GROUPS, TOPICS};
use crate::Exit;
use std::path::PathBuf;

const DESCRIPTION: &str = "Use the Elise CLI (`elise`) to pair a computer as a Runner, run security Scans on it and check its setup. Use when asked to run, resume or check an Elise Scan or Runner from a terminal, or to script it in CI.";

pub fn text() -> String {
    let mut text = format!("---\nname: elise\ndescription: {DESCRIPTION}\n---\n\n# The Elise CLI\n\n");
    text.push_str(
        "`elise` is the command-line program of EliseLAB. It acts as a Runner: it claims Scans from Elise and runs them on this computer with the person's own Claude. This file is generated from the program's own command table. Run `elise commands --json` for the same facts as one JSON object, and `elise <command> --help` for a full page.\n\n",
    );
    text.push_str("## Rules for an agent\n\n");
    text.push_str("- Add `--json` to a command. It prints one JSON object on standard output with `schemaVersion`, `ok` and `exitCode`; prose goes to standard error. `run --json` prints one object per line.\n");
    text.push_str("- Read the exit code. It equals `exitCode` in the JSON. A failure is `{ ok: false, error: { code, message, next } }`, and `next` is the command to run.\n");
    text.push_str("- Never wait for input. With no terminal on stdin, or with `--no-input`, the program never asks a question; a command that needs an answer exits 2 and names the flag that gives it (`pair` needs `--yes`).\n");
    text.push_str("- No command prints a token, except `pair --print-token`. Never put a token in a log or a message.\n");
    text.push_str("- A command that costs money or time says so under its flags. Do not run it unless the person asked for it.\n\n");
    text.push_str("## Exit codes\n\nA code is only ever added, never changed.\n\n");
    for (code, name, meaning) in EXIT_CODES {
        text.push_str(&format!("- {code} {name}: {meaning}\n"));
    }
    text.push_str("\n## Commands\n");
    for group in GROUPS {
        for spec in COMMANDS.iter().filter(|spec| spec.group == *group) {
            command_section(&mut text, spec);
        }
    }
    for spec in COMMANDS.iter().filter(|spec| !GROUPS.contains(&spec.group)) {
        command_section(&mut text, spec);
    }
    text.push_str("\n## Help topics\n\nRun `elise help <topic>`.\n\n");
    for topic in TOPICS {
        text.push_str(&format!("- {}: {}\n", topic.name, topic.summary));
    }
    text
}

fn command_section(text: &mut String, spec: &crate::table::Spec) {
    text.push_str(&format!("\n### elise {}\n\n{}\n\n{}\n\n", spec.name, spec.summary, spec.about));
    text.push_str(&format!("Usage: `{}`\n\nNeeds: {}\n\n", spec.usage, spec.needs));
    text.push_str("Flags:\n");
    for flag in flags(spec) {
        let value = flag.value.map(|value| format!(" <{value}>")).unwrap_or_default();
        let short = flag.short.map(|short| format!(", {short}")).unwrap_or_default();
        text.push_str(&format!("- `{}{value}`{short}: {} Default: {}. Cost: {}\n", flag.name, flag.about, flag.default, flag.cost));
    }
    for (name, about) in spec.env {
        text.push_str(&format!("- environment {name}: {about}\n"));
    }
    let exits: Vec<String> = spec.exits.iter().map(i32::to_string).collect();
    text.push_str(&format!("\nExit codes: {}\n\nJSON: {}\n\nExamples:\n", exits.join(", "), spec.json));
    for example in spec.examples {
        text.push_str(&format!("    {example}\n"));
    }
}

pub fn snippet() -> String {
    "\
## Elise CLI

Use the `elise` command to run and check Elise Scans. Run `elise commands --json` once to learn every command, flag, exit code and JSON shape.
Add `--json` to a command and read the exit code. Never answer a prompt: use `--yes` and `--no-input`.
Never print a token. Run `elise skill install` to refresh the full skill file."
        .to_string()
}

pub fn install(dir: Option<&str>, json: bool) -> Exit {
    let dir = match dir {
        Some(dir) => PathBuf::from(dir),
        None => match dirs::home_dir() {
            Some(home) => home.join(".claude").join("skills").join("elise"),
            None => return failed(json, "this computer has no home folder; give one with --dir"),
        },
    };
    let file = dir.join("SKILL.md");
    if let Err(why) = std::fs::create_dir_all(&dir).and_then(|()| std::fs::write(&file, text())) {
        return failed(json, &format!("could not write {}: {why}", file.display()));
    }
    let snippet = snippet();
    if json {
        let fields = serde_json::json!({ "path": file.display().to_string(), "snippet": snippet });
        return json::emit(Exit::Ok, fields, None);
    }
    println!("Wrote {}", file.display());
    println!("\nFor AGENTS.md or CLAUDE.md, add:\n\n{snippet}");
    Exit::Ok
}

fn failed(json: bool, message: &str) -> Exit {
    eprintln!("elise: {message}");
    if json {
        let failure = json::Failure { code: "write_failed", message, next: "elise skill install --dir <path>" };
        return json::emit(Exit::Error, serde_json::json!({}), Some(failure));
    }
    Exit::Error
}
