#[cfg(windows)]
use std::ffi::OsString;
#[cfg(any(windows, test))]
use std::path::Path;
use std::path::PathBuf;

#[cfg(any(windows, test))]
#[derive(Default, Clone)]
pub struct WinEnv {
    pub path: Option<String>,
    pub pathext: Option<String>,
    pub user_profile: Option<String>,
    pub app_data: Option<String>,
    pub nvm_home: Option<String>,
    pub nvm_symlink: Option<String>,
    pub program_files: Option<String>,
    pub system_root: Option<String>,
}

#[cfg(windows)]
impl WinEnv {
    pub fn from_process() -> WinEnv {
        let var = |name: &str| std::env::var(name).ok().filter(|v| !v.is_empty());
        WinEnv {
            path: var("PATH"),
            pathext: var("PATHEXT"),
            user_profile: var("USERPROFILE"),
            app_data: var("APPDATA"),
            nvm_home: var("NVM_HOME"),
            nvm_symlink: var("NVM_SYMLINK"),
            program_files: var("ProgramFiles"),
            system_root: var("SystemRoot"),
        }
    }
}

#[cfg(any(windows, test))]
fn split_windows_path(path: &str) -> Vec<PathBuf> {
    path.split(';').map(|part| part.trim().trim_matches('"')).filter(|part| !part.is_empty()).map(PathBuf::from).collect()
}

#[cfg(any(windows, test))]
fn extensions(pathext: Option<&str>) -> Vec<String> {
    let listed: Vec<String> = pathext.unwrap_or("").split(';').map(|ext| ext.trim().to_lowercase()).collect();
    let wanted: Vec<String> = [".exe", ".cmd"].iter().filter(|ext| listed.iter().any(|l| l == *ext)).map(|ext| ext.to_string()).collect();
    if wanted.is_empty() {
        vec![".exe".to_string(), ".cmd".to_string()]
    } else {
        wanted
    }
}

#[cfg(any(windows, test))]
fn version_key(dir: &Path) -> (u64, u64, u64) {
    let name = dir.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let mut parts = name.trim_start_matches('v').split('.').map(|part| part.parse::<u64>().unwrap_or(0));
    (parts.next().unwrap_or(0), parts.next().unwrap_or(0), parts.next().unwrap_or(0))
}

#[cfg(any(windows, test))]
fn newest_first(mut versions: Vec<PathBuf>) -> Vec<PathBuf> {
    versions.sort_by(|a, b| version_key(b).cmp(&version_key(a)).then_with(|| b.cmp(a)));
    versions
}

#[cfg(any(windows, test))]
fn usual_folders(env: &WinEnv) -> Vec<PathBuf> {
    let mut folders = Vec::new();
    if let Some(profile) = &env.user_profile {
        folders.push(PathBuf::from(profile).join(".local").join("bin"));
        folders.push(PathBuf::from(profile).join(".claude").join("local"));
    }
    if let Some(app_data) = &env.app_data {
        folders.push(PathBuf::from(app_data).join("npm"));
    }
    folders.extend(env.nvm_symlink.iter().map(PathBuf::from));
    folders.extend(env.nvm_home.iter().map(PathBuf::from));
    if let Some(program_files) = &env.program_files {
        folders.push(PathBuf::from(program_files).join("nodejs"));
    }
    folders
}

#[cfg(any(windows, test))]
pub fn windows_candidates(name: &str, env: &WinEnv) -> Vec<PathBuf> {
    let exts = extensions(env.pathext.as_deref());
    let mut folders = split_windows_path(env.path.as_deref().unwrap_or(""));
    folders.extend(usual_folders(env));
    exts.iter().flat_map(|ext| folders.iter().map(move |dir| dir.join(format!("{name}{ext}")))).collect()
}

#[cfg(any(windows, test))]
fn git_roots(env: &WinEnv, is_file: &dyn Fn(&Path) -> bool) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    for dir in split_windows_path(env.path.as_deref().unwrap_or("")) {
        let has_git = ["git.exe", "git.cmd"].iter().any(|file| is_file(&dir.join(file)));
        if !has_git {
            continue;
        }
        let mut root = dir.clone();
        let folder = |p: &Path| p.file_name().map(|n| n.to_string_lossy().to_lowercase());
        if matches!(folder(&root).as_deref(), Some("bin"))
            && matches!(root.parent().and_then(folder).as_deref(), Some("mingw64" | "mingw32"))
        {
            root.pop();
        }
        if matches!(folder(&root).as_deref(), Some("cmd" | "bin" | "mingw64" | "mingw32")) {
            root.pop();
            roots.push(root);
        }
    }
    if let Some(program_files) = &env.program_files {
        roots.push(PathBuf::from(program_files).join("Git"));
    }
    roots
}

#[cfg(any(windows, test))]
pub fn git_for_windows_verdict(git_runs: bool, env: &WinEnv, is_file: &dyn Fn(&Path) -> bool) -> Result<String, String> {
    const INSTALL: &str = "Install Git for Windows from https://gitforwindows.org, then run doctor again.";
    if !git_runs {
        return Err(format!("Git for Windows was not found on this computer. {INSTALL}"));
    }
    let bash = git_roots(env, is_file)
        .into_iter()
        .flat_map(|root| [root.join("bin").join("bash.exe"), root.join("usr").join("bin").join("bash.exe")])
        .find(|candidate| is_file(candidate));
    match bash {
        Some(bash) => Ok(format!("bash found ({})", bash.display())),
        None => Err(format!("git is installed, but its bash (bin\\bash.exe, which Claude Code needs) was not found. {INSTALL}")),
    }
}

#[cfg(any(windows, test))]
pub fn windows_agent_folders(claude_dir: &Path, node: Option<&Path>, env: &WinEnv, exists: &dyn Fn(&Path) -> bool) -> Vec<PathBuf> {
    let mut folders = vec![claude_dir.to_path_buf()];
    if let Some(node_dir) = node.and_then(Path::parent) {
        if node_dir != claude_dir {
            folders.push(node_dir.to_path_buf());
        }
    }
    let is_file = |p: &Path| exists(p);
    if let Some(root) = git_roots(env, &is_file).into_iter().find(|root| exists(&root.join("bin")) || exists(&root.join("usr").join("bin")))
    {
        for sub in [root.join("bin"), root.join("usr").join("bin")] {
            if exists(&sub) && !folders.contains(&sub) {
                folders.push(sub);
            }
        }
    }
    folders.extend(system32(env));
    folders
}

#[cfg(any(windows, test))]
pub fn windows_validator_folders(node: &Path, env: &WinEnv) -> Vec<PathBuf> {
    let mut folders: Vec<PathBuf> = node.parent().map(Path::to_path_buf).into_iter().collect();
    folders.extend(system32(env));
    folders
}

#[cfg(any(windows, test))]
fn system32(env: &WinEnv) -> Option<PathBuf> {
    env.system_root.as_ref().map(|root| PathBuf::from(root).join("System32"))
}

#[cfg(windows)]
fn joined(folders: Vec<PathBuf>) -> OsString {
    std::env::join_paths(folders).unwrap_or_default()
}

#[cfg(windows)]
pub fn windows_agent_path(claude_dir: &Path, node: Option<&Path>) -> OsString {
    joined(windows_agent_folders(claude_dir, node, &WinEnv::from_process(), &|p| p.exists()))
}

#[cfg(windows)]
pub fn windows_validator_path(node: &Path) -> OsString {
    joined(windows_validator_folders(node, &WinEnv::from_process()))
}

#[cfg(windows)]
pub fn find_on_windows(name: &str) -> Option<PathBuf> {
    let env = WinEnv::from_process();
    if let Some(found) = windows_candidates(name, &env).into_iter().find(|p| p.is_file()) {
        return Some(found);
    }
    let exts = extensions(env.pathext.as_deref());
    let versions: Vec<PathBuf> = env
        .nvm_home
        .iter()
        .filter_map(|home| std::fs::read_dir(home).ok())
        .flat_map(|entries| entries.flatten().map(|e| e.path()).filter(|p| p.is_dir()))
        .collect();
    let versions = newest_first(versions);
    exts.iter().flat_map(|ext| versions.iter().map(move |dir| dir.join(format!("{name}{ext}")))).find(|p| p.is_file())
}

pub fn on_path(name: &str) -> Option<PathBuf> {
    #[cfg(windows)]
    {
        let env = WinEnv::from_process();
        let exts = extensions(env.pathext.as_deref());
        let folders = split_windows_path(env.path.as_deref()?);
        exts.iter().flat_map(|ext| folders.iter().map(move |dir| dir.join(format!("{name}{ext}")))).find(|p| p.is_file())
    }
    #[cfg(not(windows))]
    {
        let path = std::env::var_os("PATH")?;
        let file = format!("{name}{}", std::env::consts::EXE_SUFFIX);
        std::env::split_paths(&path).map(|dir| dir.join(&file)).find(|candidate| candidate.is_file())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn env() -> WinEnv {
        WinEnv {
            path: Some("C:/tools;;C:/Program Files/Git/cmd".to_string()),
            pathext: Some(".COM;.EXE;.BAT;.CMD".to_string()),
            user_profile: Some("C:/Users/a".to_string()),
            app_data: Some("C:/Users/a/AppData/Roaming".to_string()),
            nvm_home: Some("C:/nvm".to_string()),
            nvm_symlink: Some("C:/nvm4w/nodejs".to_string()),
            program_files: Some("C:/Program Files".to_string()),
            system_root: Some("C:/Windows".to_string()),
        }
    }

    fn paths(list: &[&str]) -> Vec<PathBuf> {
        list.iter().map(PathBuf::from).collect()
    }

    #[test]
    fn the_windows_lookup_tries_path_then_the_usual_folders_with_exe_before_cmd() {
        let found = windows_candidates("claude", &env());
        let folders: Vec<PathBuf> = found[..8].iter().map(|p| p.parent().unwrap().to_path_buf()).collect();
        assert_eq!(
            folders,
            paths(&[
                "C:/tools",
                "C:/Program Files/Git/cmd",
                "C:/Users/a/.local/bin",
                "C:/Users/a/.claude/local",
                "C:/Users/a/AppData/Roaming/npm",
                "C:/nvm4w/nodejs",
                "C:/nvm",
                "C:/Program Files/nodejs",
            ])
        );
        assert_eq!(found[8..10], paths(&["C:/tools/claude.cmd", "C:/Program Files/Git/cmd/claude.cmd"]));
        assert_eq!(found[0], PathBuf::from("C:/tools/claude.exe"));
    }

    #[test]
    fn exe_always_comes_before_cmd_and_only_those_two_count() {
        let cases = [(Some(".CMD;.EXE"), vec![".exe", ".cmd"]), (Some(".COM;.BAT"), vec![".exe", ".cmd"]), (None, vec![".exe", ".cmd"])];
        for (pathext, expected) in cases {
            assert_eq!(extensions(pathext), expected, "{pathext:?}");
        }
    }

    #[test]
    fn nvm_version_folders_sort_by_number_newest_first() {
        let sorted = newest_first(paths(&["C:/nvm/v20.11.0", "C:/nvm/v9.11.2", "C:/nvm/v18.2.0", "C:/nvm/v20.9.0"]));
        assert_eq!(sorted, paths(&["C:/nvm/v20.11.0", "C:/nvm/v20.9.0", "C:/nvm/v18.2.0", "C:/nvm/v9.11.2"]));
    }

    #[test]
    fn the_agent_path_has_claudes_folder_node_git_and_the_system_folder() {
        let git_folders = ["C:/Program Files/Git/cmd/git.exe", "C:/Program Files/Git/bin", "C:/Program Files/Git/usr/bin"];
        let with_git = |p: &Path| git_folders.iter().any(|f| p == Path::new(f));
        let cases = [
            (
                "C:/nvm4w/nodejs/node.exe",
                true,
                vec![
                    "C:/Users/a/.local/bin",
                    "C:/nvm4w/nodejs",
                    "C:/Program Files/Git/bin",
                    "C:/Program Files/Git/usr/bin",
                    "C:/Windows/System32",
                ],
            ),
            ("C:/Users/a/.local/bin/node.exe", false, vec!["C:/Users/a/.local/bin", "C:/Windows/System32"]),
            ("C:/nvm4w/nodejs/node.exe", false, vec!["C:/Users/a/.local/bin", "C:/nvm4w/nodejs", "C:/Windows/System32"]),
        ];
        for (node, git_installed, expected) in cases {
            let exists = |p: &Path| git_installed && with_git(p);
            let folders = windows_agent_folders(Path::new("C:/Users/a/.local/bin"), Some(Path::new(node)), &env(), &exists);
            assert_eq!(folders, paths(&expected), "{node}");
        }
    }

    #[test]
    fn doctor_reports_git_for_windows_by_its_bash() {
        let files = ["C:/Program Files/Git/cmd/git.exe", "C:/Program Files/Git/bin/bash.exe"];
        let cases = [
            (false, vec![], Err("Git for Windows was not found")),
            (true, files.to_vec(), Ok("bash found (C:/Program Files/Git/bin/bash.exe)")),
            (true, files[..1].to_vec(), Err("its bash (bin\\bash.exe")),
        ];
        for (git_runs, present, expected) in cases {
            let is_file = |p: &Path| present.iter().any(|f| p == Path::new(f));
            let got = git_for_windows_verdict(git_runs, &env(), &is_file);
            match (got, expected) {
                (Ok(got), Ok(want)) => assert_eq!(got, want),
                (Err(got), Err(want)) => assert!(got.contains(want) && got.contains("https://gitforwindows.org"), "{got}"),
                (got, want) => panic!("{got:?} vs {want:?}"),
            }
        }
    }

    #[test]
    fn the_validator_path_is_nodes_folder_and_the_system_folder() {
        let folders = windows_validator_folders(Path::new("C:/nvm4w/nodejs/node.exe"), &env());
        assert_eq!(folders, paths(&["C:/nvm4w/nodejs", "C:/Windows/System32"]));
    }
}
