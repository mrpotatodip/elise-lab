use crate::cli_repos::{self, RepoRow};
use crate::engine_client::{Denied, EngineClient};
use serde::Deserialize;
use serde_json::{json, Value};
use std::fs::File;
use std::io::{BufReader, Read, Seek, SeekFrom};
use std::path::Path;

const MB: u64 = 1024 * 1024;
pub const ARCHIVE_MAX_BYTES: u64 = 50 * MB;
const UNPACKED_MAX_BYTES: u64 = 250 * MB;
const FILES_MAX: u64 = 20_000;
const PATH_DEPTH_MAX: usize = 20;
pub const ARCHIVES_PER_APP_MAX: usize = 20;
const LABEL_MAX: usize = 120;
const APP_NAME_MAX: usize = 80;

pub const NOT_A_ZIP_FILE: &str = "Upload a .zip file";
pub const NOT_A_ZIP: &str = "The file is not a zip";
pub const ARCHIVE_TOO_LARGE: &str = "A zip can be at most 50 MB";
pub const UNPACKED_TOO_LARGE: &str = "A zip can unpack to at most 250 MB";
pub const TOO_MANY_FILES: &str = "A zip can hold at most 20,000 files";
pub const PATH_TOO_DEEP: &str = "A path in a zip can be at most 20 levels deep";
pub const TOO_MANY_ARCHIVES: &str = "An upload app can hold at most 20 zips: remove one first";
pub const APP_NAME_MESSAGE: &str =
    "An app name is letters, digits, spaces, '.', '-' and '_', starts with a letter or digit, has no slash and is at most 80 characters";

const ZIP_MAGIC: [u8; 4] = [0x50, 0x4b, 0x03, 0x04];
const END_SIG: u32 = 0x0605_4b50;
const END64_LOCATOR_SIG: u32 = 0x0706_4b50;
const END64_SIG: u32 = 0x0606_4b50;
const CENTRAL_SIG: u32 = 0x0201_4b50;
const ZIP64_EXTRA: u16 = 0x0001;
const END_SIZE: u64 = 22;
const CENTRAL_SIZE: u64 = 46;
const U16_MAX: u64 = 0xffff;
const U32_MAX: u64 = 0xffff_ffff;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Refusal {
    pub code: &'static str,
    pub message: String,
}

fn refuse(code: &'static str, message: &str) -> Refusal {
    Refusal { code, message: message.to_string() }
}

#[derive(Debug, Default, PartialEq, Eq)]
struct Contents {
    files: u64,
    unpacked_bytes: u64,
    deepest_path: usize,
}

fn u16_at(bytes: &[u8], at: usize) -> Option<u64> {
    Some(u64::from(u16::from_le_bytes(bytes.get(at..at + 2)?.try_into().ok()?)))
}

fn u32_at(bytes: &[u8], at: usize) -> Option<u64> {
    Some(u64::from(u32::from_le_bytes(bytes.get(at..at + 4)?.try_into().ok()?)))
}

fn u64_at(bytes: &[u8], at: usize) -> Option<u64> {
    Some(u64::from_le_bytes(bytes.get(at..at + 8)?.try_into().ok()?))
}

fn read_at<R: Read + Seek>(reader: &mut R, at: u64, length: usize) -> Option<Vec<u8>> {
    reader.seek(SeekFrom::Start(at)).ok()?;
    let mut bytes = vec![0; length];
    reader.read_exact(&mut bytes).ok()?;
    Some(bytes)
}

fn path_depth(name: &str) -> usize {
    name.split(['/', '\\']).filter(|part| !part.is_empty()).count()
}

fn directory_of<R: Read + Seek>(reader: &mut R, size: u64) -> Option<(u64, u64)> {
    let tail_length = size.min(END_SIZE + U16_MAX);
    let tail_start = size - tail_length;
    let tail = read_at(reader, tail_start, usize::try_from(tail_length).ok()?)?;
    let end = (0..=tail.len().checked_sub(END_SIZE as usize)?).rev().find(|at| u32_at(&tail, *at) == Some(u64::from(END_SIG)))?;
    let mut entries = u16_at(&tail, end + 10)?;
    let mut offset = u32_at(&tail, end + 16)?;
    if entries == U16_MAX || offset == U32_MAX {
        let locator = (tail_start + end as u64).checked_sub(20)?;
        let found = read_at(reader, locator, 20)?;
        if u32_at(&found, 0)? != u64::from(END64_LOCATOR_SIG) {
            return None;
        }
        let end64 = u64_at(&found, 8)?;
        let record = read_at(reader, end64, 56)?;
        if u32_at(&record, 0)? != u64::from(END64_SIG) {
            return None;
        }
        entries = u64_at(&record, 32)?;
        offset = u64_at(&record, 48)?;
    }
    Some((entries, offset))
}

fn unpacked_of(header: &[u8], extra: &[u8]) -> Option<u64> {
    let unpacked = u32_at(header, 24)?;
    if unpacked != U32_MAX {
        return Some(unpacked);
    }
    let mut field = 0;
    let mut found = unpacked;
    while field + 4 <= extra.len() {
        if u16_at(extra, field)? == u64::from(ZIP64_EXTRA) {
            if let Some(size) = u64_at(extra, field + 4) {
                found = size;
            }
        }
        field += 4 + usize::try_from(u16_at(extra, field + 2)?).ok()?;
    }
    Some(found)
}

fn contents_of<R: Read + Seek>(reader: &mut R, size: u64) -> Option<Contents> {
    if read_at(reader, 0, 4)? != ZIP_MAGIC {
        return None;
    }
    let (entries, offset) = directory_of(reader, size)?;
    reader.seek(SeekFrom::Start(offset)).ok()?;
    let mut reader = BufReader::new(reader);
    let mut contents = Contents::default();
    let mut at = offset;
    for _ in 0..entries {
        let mut header = [0; CENTRAL_SIZE as usize];
        reader.read_exact(&mut header).ok()?;
        if u32_at(&header, 0)? != u64::from(CENTRAL_SIG) {
            return None;
        }
        let name_length = u16_at(&header, 28)?;
        let extra_length = u16_at(&header, 30)?;
        let comment_length = u16_at(&header, 32)?;
        if at + CENTRAL_SIZE + name_length + extra_length > size {
            return None;
        }
        let mut name = vec![0; usize::try_from(name_length).ok()?];
        reader.read_exact(&mut name).ok()?;
        let mut extra = vec![0; usize::try_from(extra_length).ok()?];
        reader.read_exact(&mut extra).ok()?;
        reader.seek_relative(i64::try_from(comment_length).ok()?).ok()?;
        let name = String::from_utf8_lossy(&name);
        if !(name.ends_with('/') || name.ends_with('\\')) {
            contents.files += 1;
            contents.unpacked_bytes = contents.unpacked_bytes.saturating_add(unpacked_of(&header, &extra)?);
        }
        contents.deepest_path = contents.deepest_path.max(path_depth(&name));
        at += CENTRAL_SIZE + name_length + extra_length + comment_length;
    }
    Some(contents)
}

pub fn app_name_problem(name: &str) -> Option<&'static str> {
    let chars: Vec<char> = name.chars().collect();
    let plain = |char: &char| char.is_ascii_alphanumeric() || *char == '_';
    let valid = match chars.as_slice() {
        [] => false,
        [only] => only.is_ascii_alphanumeric(),
        [first, middle @ .., last] => {
            chars.len() <= APP_NAME_MAX
                && first.is_ascii_alphanumeric()
                && middle.iter().all(|char| plain(char) || matches!(char, ' ' | '.' | '-'))
                && (plain(last) || matches!(last, '.' | '-'))
        }
    };
    (!valid).then_some(APP_NAME_MESSAGE)
}

pub fn label_of(file: &Path) -> String {
    let name = file.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_default();
    let mut units = 0;
    name.chars()
        .take_while(|char| {
            units += char.len_utf16();
            units <= LABEL_MAX
        })
        .collect()
}

pub fn check_file(file: &Path) -> Result<u64, Refusal> {
    let shown = file.display();
    let metadata = std::fs::metadata(file).ok().filter(|metadata| metadata.is_file());
    let Some(metadata) = metadata else {
        return Err(Refusal { code: "zip_not_found", message: format!("`{shown}` is not a file elise can read.") });
    };
    let size = metadata.len();
    let named_zip = file.file_name().is_some_and(|name| name.to_string_lossy().to_lowercase().ends_with(".zip"));
    if !named_zip {
        return Err(refuse("not_a_zip_file", NOT_A_ZIP_FILE));
    }
    if size > ARCHIVE_MAX_BYTES {
        return Err(refuse("zip_too_large", ARCHIVE_TOO_LARGE));
    }
    let mut opened =
        File::open(file).map_err(|_| Refusal { code: "zip_not_found", message: format!("`{shown}` is not a file elise can read.") })?;
    let Some(contents) = contents_of(&mut opened, size) else {
        return Err(refuse("not_a_zip", NOT_A_ZIP));
    };
    if contents.files > FILES_MAX {
        return Err(refuse("too_many_files", TOO_MANY_FILES));
    }
    if contents.deepest_path > PATH_DEPTH_MAX {
        return Err(refuse("path_too_deep", PATH_TOO_DEEP));
    }
    if contents.unpacked_bytes > UNPACKED_MAX_BYTES {
        return Err(refuse("unpacked_too_large", UNPACKED_TOO_LARGE));
    }
    Ok(size)
}

pub fn too_many_zips(zips_in_app: usize) -> Option<Refusal> {
    (zips_in_app >= ARCHIVES_PER_APP_MAX).then(|| refuse("too_many_zips", TOO_MANY_ARCHIVES))
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveRow {
    pub id: String,
    pub label: String,
    pub size_bytes: u64,
    pub content_sha256: String,
    pub uploaded_at: String,
}

impl ArchiveRow {
    pub fn to_json(&self) -> Value {
        json!({
            "id": self.id,
            "label": self.label,
            "sizeBytes": self.size_bytes,
            "contentSha256": self.content_sha256,
            "uploadedAt": self.uploaded_at,
        })
    }
}

#[derive(Deserialize)]
struct ArchiveList {
    archives: Vec<ArchiveRow>,
}

#[derive(Deserialize)]
struct Created {
    id: String,
}

pub fn find_app<'a>(repos: &'a [RepoRow], text: &str) -> Option<&'a RepoRow> {
    let text = text.trim();
    let mut apps = repos.iter().filter(|repo| repo.provider() == "upload");
    apps.find(|repo| repo.id.eq_ignore_ascii_case(text) || repo.canonical == text.to_lowercase())
}

pub fn app_name(app: &RepoRow) -> &str {
    &app.url
}

pub async fn list_repos(client: &EngineClient<'_>) -> Result<Vec<RepoRow>, Denied> {
    cli_repos::list_repos(client).await
}

pub async fn create_app(client: &EngineClient<'_>, name: &str) -> Result<String, Denied> {
    Ok(client.post::<Created>("/repos", &json!({ "provider": "upload", "repo": name })).await?.id)
}

pub async fn list(client: &EngineClient<'_>, app_id: &str) -> Result<Vec<ArchiveRow>, Denied> {
    Ok(client.get::<ArchiveList>(&format!("/repos/{app_id}/archives"), &[]).await?.archives)
}

pub async fn upload(client: &EngineClient<'_>, app_id: &str, file: &Path) -> Result<ArchiveRow, Denied> {
    client.post_file(&format!("/repos/{app_id}/archives"), &[("label", label_of(file))], file, "application/zip").await
}

pub async fn remove(client: &EngineClient<'_>, app_id: &str, archive_id: &str) -> Result<(), Denied> {
    client.delete::<Value>(&format!("/repos/{app_id}/archives/{archive_id}")).await.map(|_| ())
}

#[derive(Debug, PartialEq)]
pub enum Found<'a> {
    One(&'a ArchiveRow),
    Many(Vec<&'a ArchiveRow>),
    None,
}

pub fn find_archive<'a>(archives: &'a [ArchiveRow], text: &str) -> Found<'a> {
    let by_id: Vec<&ArchiveRow> = archives.iter().filter(|archive| archive.id.eq_ignore_ascii_case(text)).collect();
    let found = if by_id.is_empty() { archives.iter().filter(|archive| archive.label == text).collect() } else { by_id };
    match found.as_slice() {
        [] => Found::None,
        [one] => Found::One(one),
        _ => Found::Many(found),
    }
}

#[cfg(test)]
mod tests {
    use super::{app_name_problem, contents_of, find_archive, label_of, ArchiveRow, Contents, Found};
    use std::io::Cursor;
    use std::path::Path;

    fn le16(value: usize) -> [u8; 2] {
        u16::try_from(value).unwrap().to_le_bytes()
    }

    fn zip_with(entries: &[(&str, u32, &[u8])]) -> Vec<u8> {
        let mut bytes = vec![0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0];
        let directory_at = bytes.len() as u32;
        for (name, unpacked, extra) in entries {
            bytes.extend([0x50, 0x4b, 0x01, 0x02]);
            let mut rest = [0u8; 42];
            rest[20..24].copy_from_slice(&unpacked.to_le_bytes());
            rest[24..26].copy_from_slice(&le16(name.len()));
            rest[26..28].copy_from_slice(&le16(extra.len()));
            bytes.extend(rest);
            bytes.extend(name.as_bytes());
            bytes.extend(*extra);
        }
        let directory_size = bytes.len() as u32 - directory_at;
        bytes.extend([0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0]);
        bytes.extend(le16(entries.len()));
        bytes.extend(le16(entries.len()));
        bytes.extend(directory_size.to_le_bytes());
        bytes.extend(directory_at.to_le_bytes());
        bytes.extend([0, 0]);
        bytes
    }

    fn read(bytes: Vec<u8>) -> Option<Contents> {
        let size = bytes.len() as u64;
        contents_of(&mut Cursor::new(bytes), size)
    }

    #[test]
    fn a_zip_is_read_from_its_central_directory() {
        let zip = zip_with(&[("app/", 0, &[]), ("app/src/main.rs", 120, &[]), ("app\\lib.rs", 30, &[])]);

        assert_eq!(read(zip), Some(Contents { files: 2, unpacked_bytes: 150, deepest_path: 3 }));
    }

    #[test]
    fn a_zip64_size_is_read_from_the_extra_field() {
        let mut extra = vec![0x01, 0x00, 0x08, 0x00];
        extra.extend((300u64 * 1024 * 1024).to_le_bytes());

        let zip = zip_with(&[("big.bin", u32::MAX, &extra)]);

        assert_eq!(read(zip).map(|contents| contents.unpacked_bytes), Some(300 * 1024 * 1024));
    }

    #[test]
    fn bytes_that_are_not_a_zip_are_refused() {
        let mut no_magic = zip_with(&[("a", 1, &[])]);
        no_magic[0] = b'X';
        let mut cut = zip_with(&[("a", 1, &[])]);
        cut.truncate(cut.len() - 4);

        assert_eq!(read(no_magic), None);
        assert_eq!(read(cut), None);
        assert_eq!(read(b"just some text, not an archive".to_vec()), None);
    }

    #[test]
    fn an_app_name_follows_the_dashboards_rule() {
        let long = "a".repeat(81);
        for good in ["a", "Billing", "my app", "my.app-2_x", &"a".repeat(80)] {
            assert_eq!(app_name_problem(good), None, "{good}");
        }
        for bad in ["", " app", "app ", "-app", "a/b", "über", long.as_str()] {
            assert!(app_name_problem(bad).is_some(), "{bad}");
        }
    }

    #[test]
    fn a_label_is_the_file_name_cut_to_120_units() {
        assert_eq!(label_of(Path::new("/tmp/src/app.zip")), "app.zip");
        assert_eq!(label_of(Path::new(&format!("{}.zip", "a".repeat(200)))).len(), 120);
    }

    #[test]
    fn an_archive_is_found_by_its_id_before_its_label() {
        let row = |id: &str, label: &str| ArchiveRow {
            id: id.to_string(),
            label: label.to_string(),
            size_bytes: 1,
            content_sha256: "x".to_string(),
            uploaded_at: "2026-11-20T10:00:00.000Z".to_string(),
        };
        let all = [row("1", "a.zip"), row("2", "a.zip"), row("3", "b.zip")];

        assert_eq!(find_archive(&all, "3"), Found::One(&all[2]));
        assert_eq!(find_archive(&all, "b.zip"), Found::One(&all[2]));
        assert_eq!(find_archive(&all, "a.zip"), Found::Many(vec![&all[0], &all[1]]));
        assert_eq!(find_archive(&all, "c.zip"), Found::None);
    }
}
