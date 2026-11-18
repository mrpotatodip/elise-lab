// Builds the `full` Skill into the binary: every file of the engine's `security-audit` skill folder
// (the folder the desktop bundle copies) becomes one `(path, bytes)` entry of `SKILL_FILES`, so the
// one `elise-runner` file is all a person installs.

use std::fs;
use std::path::{Path, PathBuf};

fn main() {
    let manifest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let skill = manifest.join("../../elise-engine-api/skills/security-audit").canonicalize().expect("the engine's security-audit skill folder exists");
    println!("cargo:rerun-if-changed={}", skill.display());

    let mut files = Vec::new();
    walk(&skill, &skill, &mut files);
    files.sort();
    assert!(files.iter().any(|(name, _)| name == "SKILL.md"), "the skill folder has a SKILL.md");

    let entries: String = files.iter().map(|(name, path)| format!("    ({name:?}, include_bytes!({:?})),\n", path.display().to_string())).collect();
    let out = PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("skill_files.rs");
    fs::write(out, format!("pub const SKILL_FILES: &[(&str, &[u8])] = &[\n{entries}];\n")).unwrap();
}

// Every file under `dir`, as its path from `root` with `/` between folders, and its full path.
fn walk(root: &Path, dir: &Path, files: &mut Vec<(String, PathBuf)>) {
    for entry in fs::read_dir(dir).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            walk(root, &path, files);
        } else {
            let name = path.strip_prefix(root).unwrap().components().map(|part| part.as_os_str().to_string_lossy().to_string()).collect::<Vec<_>>().join("/");
            files.push((name, path));
        }
    }
}
