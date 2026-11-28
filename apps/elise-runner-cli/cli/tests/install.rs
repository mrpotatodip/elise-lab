#![cfg(unix)]

mod support;

use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use std::process::Command;

const FAKE_CURL: &str = r#"#!/bin/sh
out=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    *) url="$1"; shift ;;
  esac
done
echo "$url" > "$FAKE_CURL_RECORD"
printf '#!/bin/sh\necho fake elise\n' > "$out"
"#;

fn install(dir: &Path, bin: &Path, record: &Path) -> std::process::Output {
    let path = format!("{}:{}", bin.display(), std::env::var("PATH").unwrap());
    Command::new("sh")
        .arg(Path::new(env!("CARGO_MANIFEST_DIR")).join("../install.sh"))
        .env("PATH", path)
        .env("ELISE_RUNNER_INSTALL_DIR", dir)
        .env("ELISE_RUNNER_VERSION", "elise-runner-v9.9.9")
        .env("FAKE_CURL_RECORD", record)
        .output()
        .expect("sh runs install.sh")
}

#[test]
fn install_saves_elise_and_removes_a_stale_elise_runner_with_one_line() {
    let root = support::temp_home();
    let (dir, bin, record) = (root.join("dest"), root.join("bin"), root.join("url.txt"));
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::create_dir_all(&bin).unwrap();
    std::fs::write(bin.join("curl"), FAKE_CURL).unwrap();
    std::fs::set_permissions(bin.join("curl"), std::fs::Permissions::from_mode(0o755)).unwrap();
    std::fs::write(dir.join("elise-runner"), "old binary").unwrap();

    let output = install(&dir, &bin, &record);
    let stdout = String::from_utf8(output.stdout).unwrap();

    assert!(output.status.success(), "{stdout}{}", String::from_utf8_lossy(&output.stderr));
    assert_eq!(std::fs::read_to_string(dir.join("elise")).unwrap(), "#!/bin/sh\necho fake elise\n");
    assert_eq!(std::fs::metadata(dir.join("elise")).unwrap().permissions().mode() & 0o777, 0o755);
    assert!(!dir.join("elise-runner").exists(), "the stale elise-runner is still there");
    let removed: Vec<&str> = stdout.lines().filter(|line| line.contains("Removed")).collect();
    assert_eq!(removed.len(), 1, "{stdout}");
    assert!(removed[0].contains("elise-runner") && removed[0].contains("the command is now elise"), "{stdout}");
    assert!(std::fs::read_to_string(&record).unwrap().contains("/releases/download/elise-runner-v9.9.9/elise-runner-"));
}
