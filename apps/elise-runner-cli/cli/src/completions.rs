use crate::table::{Spec, COMMANDS, TOPICS};

pub const SHELLS: &[&str] = &["zsh", "bash", "fish"];

pub fn supported() -> String {
    SHELLS.join(", ")
}

pub fn script(shell: &str) -> Option<String> {
    match shell {
        "zsh" => Some(zsh()),
        "bash" => Some(bash()),
        "fish" => Some(fish()),
        _ => None,
    }
}

fn flag_words(spec: &Spec) -> Vec<&'static str> {
    spec.flags.iter().flat_map(|flag| [Some(flag.name), flag.short]).flatten().collect()
}

fn quote(text: &str) -> String {
    format!("'{}'", text.replace('\'', "'\\''"))
}

fn bash() -> String {
    let names: Vec<&str> = COMMANDS.iter().map(|spec| spec.name).collect();
    let mut text = String::from("# bash completion for elise. Load it with: source <(elise completions bash)\n_elise() {\n");
    text.push_str("  local cur=\"${COMP_WORDS[COMP_CWORD]}\"\n  COMPREPLY=()\n");
    text.push_str(&format!(
        "  if [ \"$COMP_CWORD\" -eq 1 ]; then\n    COMPREPLY=( $(compgen -W \"{} --help --version\" -- \"$cur\") )\n    return\n  fi\n",
        names.join(" ")
    ));
    text.push_str("  case \"${COMP_WORDS[1]}\" in\n");
    for spec in COMMANDS {
        let mut words = flag_words(spec);
        words.push("--help");
        let extra: Vec<&str> = match spec.name {
            "help" => TOPICS.iter().map(|topic| topic.name).chain(names.iter().copied()).collect(),
            "completions" => crate::completions::SHELLS.to_vec(),
            _ => Vec::new(),
        };
        words.extend(extra);
        text.push_str(&format!("    {}) COMPREPLY=( $(compgen -W \"{}\" -- \"$cur\") ) ;;\n", spec.name, words.join(" ")));
    }
    text.push_str("  esac\n}\ncomplete -F _elise elise\n");
    text
}

fn zsh() -> String {
    let mut text = String::from("#compdef elise\n# zsh completion for elise. Load it with: source <(elise completions zsh)\n_elise() {\n");
    text.push_str("  local -a commands\n  commands=(\n");
    for spec in COMMANDS {
        text.push_str(&format!("    {}\n", quote(&format!("{}:{}", spec.name, spec.summary.replace(':', "\\:")))));
    }
    text.push_str("  )\n  if (( CURRENT == 2 )); then\n    _describe 'command' commands\n    return\n  fi\n");
    text.push_str("  case ${words[2]} in\n");
    for spec in COMMANDS {
        let mut specs: Vec<String> = Vec::new();
        for flag in spec.flags {
            let about = flag.about.replace('[', "(").replace(']', ")").replace(':', "\\:");
            let value = flag.value.map(|value| format!(":{value}:")).unwrap_or_default();
            for word in [Some(flag.name), flag.short].into_iter().flatten() {
                specs.push(quote(&format!("{word}[{about}]{value}")));
            }
        }
        specs.push(quote("--help[Show the help page.]"));
        match spec.name {
            "help" => {
                let words: Vec<&str> = TOPICS.iter().map(|topic| topic.name).chain(COMMANDS.iter().map(|spec| spec.name)).collect();
                specs.push(quote(&format!("1:topic or command:({})", words.join(" "))));
            }
            "completions" => specs.push(quote(&format!("1:shell:({})", crate::completions::SHELLS.join(" ")))),
            _ => {}
        }
        text.push_str(&format!("    {}) _arguments {} ;;\n", spec.name, specs.join(" ")));
    }
    text.push_str("  esac\n}\ncompdef _elise elise\n");
    text
}

fn fish() -> String {
    let mut text = String::from("# fish completion for elise. Load it with: elise completions fish | source\ncomplete -c elise -f\n");
    for spec in COMMANDS {
        text.push_str(&format!("complete -c elise -n __fish_use_subcommand -a {} -d {}\n", spec.name, fish_quote(spec.summary)));
    }
    for spec in COMMANDS {
        let seen = format!("'__fish_seen_subcommand_from {}'", spec.name);
        for flag in spec.flags {
            let short = flag.short.map(|short| format!(" -s {}", short.trim_start_matches('-'))).unwrap_or_default();
            let value = if flag.value.is_some() { " -r" } else { "" };
            text.push_str(&format!(
                "complete -c elise -n {seen} -l {}{short}{value} -d {}\n",
                flag.name.trim_start_matches('-'),
                fish_quote(flag.about)
            ));
        }
        text.push_str(&format!("complete -c elise -n {seen} -l help -d 'Show the help page.'\n"));
        match spec.name {
            "help" => {
                let words: Vec<&str> = TOPICS.iter().map(|topic| topic.name).chain(COMMANDS.iter().map(|spec| spec.name)).collect();
                text.push_str(&format!("complete -c elise -n {seen} -a {}\n", quote(&words.join(" "))));
            }
            "completions" => text.push_str(&format!("complete -c elise -n {seen} -a {}\n", quote(&crate::completions::SHELLS.join(" ")))),
            _ => {}
        }
    }
    text
}

fn fish_quote(text: &str) -> String {
    format!("'{}'", text.replace('\\', "\\\\").replace('\'', "\\'"))
}
