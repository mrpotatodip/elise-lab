use crate::table::{self, Spec, Topic, COMMANDS, EXIT_CODES, GROUPS, TOPICS};
use serde_json::{json, Value};

pub fn overview() -> String {
    let mut text =
        String::from("elise: the Elise CLI. It runs Scans started in Elise on this computer.\n\nUsage: elise <command> [flags]\n");
    for group in GROUPS {
        text.push_str(&format!("\n{group}:\n"));
        for spec in COMMANDS.iter().filter(|spec| spec.group == *group) {
            text.push_str(&format!("  {:<10}{}\n", spec.name, spec.summary));
        }
    }
    text.push_str("\nTopics:\n");
    for topic in TOPICS {
        text.push_str(&format!("  {:<12}{}\n", topic.name, topic.summary));
    }
    text.push_str(&format!("\nExit codes:\n{}", exit_lines(EXIT_CODES.iter().map(|(code, _, _)| *code))));
    text.push_str("\nRun `elise <command> --help` for a command and `elise help <topic>` for a topic.\n");
    text
}

fn exit_lines(codes: impl Iterator<Item = i32>) -> String {
    let lines: Vec<String> = codes
        .filter_map(|code| EXIT_CODES.iter().find(|(known, _, _)| *known == code))
        .map(|(code, _, meaning)| format!("  {code}  {meaning}\n"))
        .collect();
    lines.concat()
}

pub fn page(spec: &Spec) -> String {
    let mut text = format!("elise {}: {}\n\nUsage:\n  {}\n\n{}\n", spec.name, spec.summary, spec.usage, spec.about);
    {
        text.push_str("\nFlags:\n");
        for flag in table::flags(spec) {
            let short = flag.short.map(|short| format!(", {short}")).unwrap_or_default();
            let value = flag.value.map(|value| format!(" {value}")).unwrap_or_default();
            text.push_str(&format!(
                "  {}{short}{value}\n      {}\n      Default: {}. Cost: {}\n",
                flag.name, flag.about, flag.default, flag.cost
            ));
        }
    }
    text.push_str(&format!("\nNeeds: {}\n", spec.needs));
    if !spec.env.is_empty() {
        text.push_str("\nEnvironment:\n");
        for (name, about) in spec.env {
            text.push_str(&format!("  {name}  {about}\n"));
        }
    }
    text.push_str("\nExamples:\n");
    for example in spec.examples {
        text.push_str(&format!("  {example}\n"));
    }
    text.push_str(&format!("\nExit codes:\n{}", exit_lines(spec.exits.iter().copied())));
    text.push_str(&format!("\nJSON shape: {}\n", spec.json));
    text
}

pub fn topic(topic: &Topic) -> String {
    let mut text = format!("elise help {}: {}\n\n{}", topic.name, topic.summary, topic.body);
    if topic.name == "exit-codes" {
        text.push_str(&format!("\n{}", exit_lines(EXIT_CODES.iter().map(|(code, _, _)| *code))));
        text.push_str("  (run --once with several Scans exits 0 only if every one succeeded)\n");
    }
    text
}

pub fn commands_list() -> String {
    COMMANDS.iter().map(|spec| format!("{:<10}{}\n", spec.name, spec.summary)).collect()
}

pub fn commands_json() -> Value {
    let commands: Vec<Value> = COMMANDS
        .iter()
        .map(|spec| {
            let flags: Vec<Value> = table::flags(spec)
                .map(|flag| {
                    json!({ "name": flag.name, "short": flag.short, "value": flag.value, "default": flag.default, "cost": flag.cost, "about": flag.about })
                })
                .collect();
            let env: Vec<Value> = spec.env.iter().map(|(name, about)| json!({ "name": name, "about": about })).collect();
            json!({
                "name": spec.name, "group": spec.group, "summary": spec.summary, "usage": spec.usage, "about": spec.about,
                "flags": flags, "needs": spec.needs, "env": env, "examples": spec.examples, "exits": spec.exits, "json": spec.json,
            })
        })
        .collect();
    let exit_codes: Vec<Value> =
        EXIT_CODES.iter().map(|(code, name, meaning)| json!({ "code": code, "name": name, "meaning": meaning })).collect();
    let topics: Vec<Value> = TOPICS.iter().map(|topic| json!({ "name": topic.name, "summary": topic.summary })).collect();
    json!({ "schemaVersion": 1, "commands": commands, "exitCodes": exit_codes, "topics": topics })
}
