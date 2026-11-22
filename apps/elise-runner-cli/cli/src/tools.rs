use elise_runner_core::scan::Tools;
use std::fs;
use std::path::{Path, PathBuf};

include!(concat!(env!("OUT_DIR"), "/skill_files.rs"));

const SKILL_DIR: &str = "security-audit";

pub struct Skill {
    root: PathBuf,
}

impl Skill {
    pub fn new() -> Skill {
        Skill { root: std::env::temp_dir().join(format!("elise-runner-skill-{}", std::process::id())) }
    }

    fn write(&self) -> std::io::Result<()> {
        let _ = fs::remove_dir_all(&self.root);
        make_private_dir(&self.root)?;
        let skill = self.root.join(SKILL_DIR);
        for (name, bytes) in SKILL_FILES {
            let path = skill.join(name);
            fs::create_dir_all(path.parent().unwrap_or(&skill))?;
            fs::write(path, bytes)?;
        }
        Ok(())
    }

    pub fn tools(&self) -> Result<Tools, String> {
        self.write().map_err(|e| format!("This Runner could not write its audit skill to {}: {e}", self.root.display()))?;
        let tools = if crate::store::debug_only_runner_home_override().is_some() {
            Tools { claude: on_path("claude"), node: on_path("node"), skills: self.root.clone() }
        } else {
            Tools::locate(self.root.clone())
        };
        if tools.claude.is_none() {
            return Err("This Runner could not find `claude` (Claude Code) on this computer. Install Claude Code and sign in as the user the Runner runs as, then start the Scan again.".to_string());
        }
        if tools.node.is_none() {
            return Err("This Runner could not find `node` (Node.js) on this computer. A full audit is checked with Node.js: install it from https://nodejs.org, then start the Scan again.".to_string());
        }
        Ok(tools)
    }
}

impl Default for Skill {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for Skill {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

pub fn find_claude() -> Option<PathBuf> {
    if crate::store::debug_only_runner_home_override().is_some() {
        on_path("claude")
    } else {
        Tools::locate(PathBuf::new()).claude
    }
}

#[cfg(unix)]
fn make_private_dir(dir: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::DirBuilderExt;
    fs::DirBuilder::new().recursive(true).mode(0o700).create(dir)
}

#[cfg(not(unix))]
fn make_private_dir(dir: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dir)
}

fn on_path(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path).map(|dir| dir.join(name)).find(|candidate| candidate.is_file())
}
