// `upload`: a zip the person uploaded to an upload app. Not a git host: the job's source is `archive`,
// and the Runner downloads the zip from Elise (which serves it only to the Runner that claimed the
// job) and unpacks it as the work folder's `repo`.

use crate::engine::{download_client, engine_url, Refusal};
use std::fs;
use std::io::{Read, Seek, Write};
use std::path::Path;
use std::time::Duration;

const MB: u64 = 1024 * 1024;

// Twins of UPLOAD_ARCHIVE_MAX_MB, UPLOAD_UNPACKED_MAX_MB, UPLOAD_FILES_MAX and UPLOAD_PATH_DEPTH_MAX in
// packages/contracts/src/elise/constants.ts. Elise checks them from the zip's own directory when it
// is uploaded; that directory is the zip's claim, so the Runner holds them again while it unpacks.
pub(super) const ARCHIVE_MAX_BYTES: u64 = 50 * MB;
const UNPACKED_MAX_BYTES: u64 = 250 * MB;
const FILES_MAX: usize = 20_000;
const PATH_DEPTH_MAX: usize = 20;

const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(300);

// -----
// Downloads the zip of the job this Runner claimed into `to`, stopping at the archive limit
// whatever the server sends. Elise answers a zip removed since the Scan started with a refusal whose
// message says so; it becomes the Scan's error.
// -----
pub(super) async fn download(token: &str, scan_id: &str, to: &Path) -> Result<(), String> {
    let answer = download_client(DOWNLOAD_TIMEOUT)
        .get(format!("{}/runners/jobs/{scan_id}/archive", engine_url()))
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| format!("Could not download the zip from Elise: {e}"))?;
    let status = answer.status();
    if !status.is_success() {
        let said = answer.json::<Refusal>().await.map(|refusal| refusal.error.message).unwrap_or_else(|_| format!("it answered {status}"));
        return Err(format!("Elise did not send the zip this Scan reads: {said}"));
    }
    let mut answer = answer;
    let mut out = fs::File::create(to).map_err(|e| format!("Could not save the zip: {e}"))?;
    let mut size: u64 = 0;
    while let Some(chunk) = answer.chunk().await.map_err(|e| format!("Could not download the zip from Elise: {e}"))? {
        size += chunk.len() as u64;
        if size > ARCHIVE_MAX_BYTES {
            return Err(format!("The zip is larger than {} MB, the limit for an upload.", ARCHIVE_MAX_BYTES / MB));
        }
        out.write_all(&chunk).map_err(|e| format!("Could not save the zip: {e}"))?;
    }
    Ok(())
}

// The folder macOS adds to a zip it makes, with copies of file attributes: not code, so not unpacked.
const MACOS_ATTRIBUTES: &str = "__MACOSX";

// -----
// Unpacks the zip into `into`, a folder that does not exist yet. Every Err is a sentence for the
// dashboard. The rules, each because a zip is untrusted:
// - Every path is checked before anything is written: one that is absolute or has `..` refuses the
//   whole zip, so nothing lands outside the folder.
// - Links are skipped, never made: a link could let the agent read a file of this computer.
// - A file is created only where nothing is (create_new), so a write never follows a link or
//   replaces an earlier file.
// - The limits: the zip's size, the number of files, the path depth (counted before the top folder
//   is removed, as Elise counts it), and the bytes written, counted as they are written.
// - One top folder is removed when everything sits in it, so `app-1.2/src/a.rs` and
//   `app-1.3/src/a.rs` are both `src/a.rs` and a finding keeps its path from one version to the next.
// -----
pub(super) fn unpack(zip: &Path, into: &Path) -> Result<(), String> {
    unpack_within(zip, into, UNPACKED_MAX_BYTES)
}

struct Item {
    index: usize,
    parts: Vec<String>,
    kind: Kind,
}

#[derive(PartialEq)]
enum Kind {
    File,
    Dir,
    Link,
}

fn unpack_within(zip: &Path, into: &Path, unpacked_max: u64) -> Result<(), String> {
    let file = fs::File::open(zip).map_err(|e| format!("Could not open the downloaded zip: {e}"))?;
    let size = file.metadata().map_err(|e| format!("Could not read the downloaded zip: {e}"))?.len();
    if size > ARCHIVE_MAX_BYTES {
        return Err(format!("The zip is larger than {} MB, the limit for an upload.", ARCHIVE_MAX_BYTES / MB));
    }
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("The upload is not a zip this Runner can read: {e}"))?;
    let items = items_of(&mut archive)?;
    let strip = usize::from(has_one_top_folder(&items));

    fs::create_dir_all(into).map_err(|e| format!("Could not make the folder to unpack into: {e}"))?;
    let mut written: u64 = 0;
    for item in &items {
        let parts = &item.parts[strip..];
        if parts.is_empty() || item.kind == Kind::Link {
            continue;
        }
        let target = parts.iter().fold(into.to_path_buf(), |path, part| path.join(part));
        let shown = parts.join("/");
        if item.kind == Kind::Dir {
            fs::create_dir_all(&target).map_err(|e| format!("Could not unpack {shown}: {e}"))?;
            continue;
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Could not unpack {shown}: {e}"))?;
        }
        let mut out = fs::OpenOptions::new().write(true).create_new(true).open(&target).map_err(|e| match e.kind() {
            std::io::ErrorKind::AlreadyExists => format!("The zip holds {shown} more than once, so this Runner will not unpack it."),
            _ => format!("Could not unpack {shown}: {e}"),
        })?;
        let mut entry = archive.by_index(item.index).map_err(|e| format!("The zip is damaged at {shown}: {e}"))?;
        let left = unpacked_max - written;
        let copied = std::io::copy(&mut (&mut entry).take(left + 1), &mut out).map_err(|e| format!("The zip is damaged at {shown}: {e}"))?;
        written += copied;
        if copied > left {
            return Err(format!("The zip unpacks to more than {} MB, the limit for an upload.", unpacked_max / MB));
        }
    }
    Ok(())
}

// Every entry's path in parts, checked against the path rules and the file and depth limits before
// anything is written. The macOS attribute folder is left out.
fn items_of<R: Read + Seek>(archive: &mut zip::ZipArchive<R>) -> Result<Vec<Item>, String> {
    let mut items = Vec::new();
    let mut files = 0;
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(|e| format!("The zip is damaged: {e}"))?;
        let name = entry.name().map_err(|e| format!("The zip is damaged: {e}"))?.to_string();
        let parts = safe_parts(&name).ok_or_else(|| format!("The zip holds a path that leads outside its folder ({name}), so this Runner will not unpack it."))?;
        if parts.len() > PATH_DEPTH_MAX {
            return Err(format!("A path in the zip is more than {PATH_DEPTH_MAX} levels deep, the limit for an upload: {name}"));
        }
        if parts.first().is_some_and(|top| top == MACOS_ATTRIBUTES) {
            continue;
        }
        let kind = if entry.is_symlink() {
            Kind::Link
        } else if entry.is_dir() {
            Kind::Dir
        } else {
            Kind::File
        };
        if kind == Kind::File {
            files += 1;
            if files > FILES_MAX {
                return Err(format!("The zip holds more than {} files, the limit for an upload.", group_thousands(FILES_MAX)));
            }
        }
        if !parts.is_empty() {
            items.push(Item { index, parts, kind });
        }
    }
    if !items.iter().any(|item| item.kind == Kind::File) {
        return Err("The zip holds no files to scan.".into());
    }
    Ok(items)
}

// The parts of a path when every one is a plain name: None for an absolute path, a drive, `..` or a
// NUL. `.` and empty parts (a doubled or trailing `/`) are dropped.
fn safe_parts(name: &str) -> Option<Vec<String>> {
    if name.starts_with('/') || name.starts_with('\\') || name.contains('\0') {
        return None;
    }
    let mut parts = Vec::new();
    for part in name.split(['/', '\\']) {
        match part {
            "" | "." => {}
            ".." => return None,
            _ if part.contains(':') => return None,
            _ => parts.push(part.to_string()),
        }
    }
    Some(parts)
}

// Whether everything sits in one folder: one first part for every entry, and no file at the top.
fn has_one_top_folder(items: &[Item]) -> bool {
    let top = &items[0].parts[0];
    items.iter().all(|item| item.parts[0] == *top && (item.kind == Kind::Dir || item.parts.len() > 1))
}

fn group_thousands(n: usize) -> String {
    let digits = n.to_string();
    let mut out = String::new();
    for (at, digit) in digits.chars().enumerate() {
        if at > 0 && (digits.len() - at).is_multiple_of(3) {
            out.push(',');
        }
        out.push(digit);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;
    use std::path::PathBuf;
    use zip::write::SimpleFileOptions;

    enum Entry<'a> {
        File(&'a str, &'a str),
        Dir(&'a str),
        Link(&'a str, &'a str),
    }

    struct Place {
        root: PathBuf,
        zip: PathBuf,
        into: PathBuf,
    }

    impl Drop for Place {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    fn place(name: &str) -> Place {
        let root = std::env::temp_dir().join(format!("elise-unpack-test-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("work")).unwrap();
        Place { zip: root.join("archive.zip"), into: root.join("work/repo"), root }
    }

    fn write_zip(path: &Path, entries: &[Entry]) {
        let mut writer = zip::ZipWriter::new(fs::File::create(path).unwrap());
        let options = SimpleFileOptions::default();
        for entry in entries {
            match entry {
                Entry::File(name, text) => {
                    writer.start_file(*name, options).unwrap();
                    writer.write_all(text.as_bytes()).unwrap();
                }
                Entry::Dir(name) => writer.add_directory(*name, options).unwrap(),
                Entry::Link(name, target) => writer.add_symlink(*name, *target, options).unwrap(),
            }
        }
        writer.finish().unwrap();
    }

    fn unpacked(name: &str, entries: &[Entry]) -> (Place, Result<(), String>) {
        let place = place(name);
        write_zip(&place.zip, entries);
        let result = unpack(&place.zip, &place.into);
        (place, result)
    }

    // Every file under a folder, as relative paths with `/`, sorted.
    fn files_in(dir: &Path) -> Vec<String> {
        let mut found = Vec::new();
        let mut stack = vec![dir.to_path_buf()];
        while let Some(at) = stack.pop() {
            for entry in fs::read_dir(&at).unwrap().flatten() {
                let kind = entry.file_type().unwrap();
                if kind.is_dir() {
                    stack.push(entry.path());
                } else {
                    found.push(entry.path().strip_prefix(dir).unwrap().to_string_lossy().replace('\\', "/"));
                }
            }
        }
        found.sort();
        found
    }

    // Two versions of the same app, each zipped with its own top folder, give the same paths, so a
    // finding keeps its path from one version to the next.
    #[test]
    fn two_versions_give_the_same_paths_for_the_same_file() {
        let (one, first) = unpacked("v12", &[Entry::Dir("app-1.2/"), Entry::File("app-1.2/src/main.rs", "fn main() {}"), Entry::File("app-1.2/README.md", "v1.2")]);
        let (two, second) = unpacked("v13", &[Entry::File("app-1.3/src/main.rs", "fn main() {}"), Entry::File("app-1.3/README.md", "v1.3")]);

        assert_eq!((first, second), (Ok(()), Ok(())));
        assert_eq!(files_in(&one.into), ["README.md", "src/main.rs"]);
        assert_eq!(files_in(&two.into), files_in(&one.into));
        assert_eq!(fs::read_to_string(two.into.join("README.md")).unwrap(), "v1.3");
    }

    // A zip with several things at its top, or a single file, keeps its paths as they are.
    #[test]
    fn a_zip_without_one_top_folder_keeps_its_paths() {
        for (name, entries, expected) in [
            ("flat", vec![Entry::File("README.md", "x"), Entry::File("src/main.rs", "y")], vec!["README.md", "src/main.rs"]),
            ("one-file", vec![Entry::File("main.rs", "x")], vec!["main.rs"]),
            ("macos", vec![Entry::File("app/main.rs", "x"), Entry::File("__MACOSX/app/._main.rs", "junk")], vec!["main.rs"]),
        ] {
            let (place, result) = unpacked(name, &entries);

            assert_eq!(result, Ok(()), "{name}");
            assert_eq!(files_in(&place.into), expected, "{name}");
        }
    }

    // A link in a zip is never made, so it cannot point the agent at a file of this computer.
    #[cfg(unix)]
    #[test]
    fn links_are_skipped() {
        let (place, result) = unpacked("links", &[Entry::File("app/main.rs", "x"), Entry::Link("app/leak", "/etc/hosts"), Entry::Link("app/up", "../../..")]);

        assert_eq!(result, Ok(()));
        assert_eq!(files_in(&place.into), ["main.rs"]);
        assert!(fs::symlink_metadata(place.into.join("leak")).is_err());
    }

    // A path that leads outside the work folder refuses the whole zip, and nothing lands outside it.
    #[test]
    fn a_path_that_leaves_the_folder_is_refused() {
        for (name, path) in [("dotdot", "../escaped.txt"), ("deep-dotdot", "app/../../escaped.txt"), ("absolute", "/tmp/elise-escaped.txt")] {
            let (place, result) = unpacked(name, &[Entry::File("app/main.rs", "x"), Entry::File(path, "owned")]);

            let error = result.unwrap_err();
            assert!(error.contains("outside"), "{name}: {error}");
            assert!(!place.root.join("escaped.txt").exists() && !place.root.join("work/escaped.txt").exists(), "{name}");
        }
        assert!(!Path::new("/tmp/elise-escaped.txt").exists());
    }

    // Each limit refuses the zip with the reason, naming the limit.
    #[test]
    fn an_over_limit_zip_is_refused_with_the_reason() {
        let deep = format!("{}file.txt", "d/".repeat(PATH_DEPTH_MAX));
        let (_deep, too_deep) = unpacked("deep", &[Entry::File(&deep, "x")]);
        let names: Vec<String> = (0..=FILES_MAX).map(|n| format!("app/f{n}")).collect();
        let many: Vec<Entry> = names.iter().map(|name| Entry::File(name, "")).collect();
        let (_many, too_many) = unpacked("many", &many);

        assert!(too_deep.unwrap_err().contains("20 levels"));
        assert!(too_many.unwrap_err().contains("20,000 files"));
    }

    // The unpacked size counts the bytes written, not what the zip says: a zip whose entries add
    // up to more than the limit stops there. Checked with a lower limit, so the test stays small.
    #[test]
    fn the_unpacked_size_is_counted_while_writing() {
        let place = place("big");
        let big = "a".repeat(4096);
        write_zip(&place.zip, &[Entry::File("app/one", &big), Entry::File("app/two", &big)]);

        let error = unpack_within(&place.zip, &place.into, 6000).unwrap_err();

        assert!(error.contains("MB"), "{error}");
    }

    #[test]
    fn a_zip_over_the_archive_limit_or_not_a_zip_is_refused() {
        let place = place("not-zip");
        fs::write(&place.zip, "this is not a zip").unwrap();

        assert!(unpack(&place.zip, &place.into).unwrap_err().contains("not a zip"));
        assert!(fs::File::create(&place.zip).unwrap().set_len(ARCHIVE_MAX_BYTES + 1).is_ok());
        assert!(unpack(&place.zip, &place.into).unwrap_err().contains("50 MB"));
    }
}
