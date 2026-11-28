use crate::engine_client::{Denied, EngineClient};
use serde::Deserialize;

pub const MIN_PREFIX: usize = 8;
const TIME_PART: usize = 9;
const PAGE: usize = 100;
const MAX_PAGES: usize = 50;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ScanRef {
    Latest,
    Prefix(String),
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScanRow {
    pub scan_id: String,
    pub repo: String,
    pub repo_id: String,
    pub branch: Option<String>,
    pub status: String,
    pub profile: Option<String>,
    pub created_at: String,
    pub finished_at: Option<String>,
}

#[derive(Debug, PartialEq)]
pub enum FoundScan {
    One(ScanRow),
    Many(Vec<ScanRow>),
    None,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScanPage {
    scans: Vec<ScanRow>,
    next_cursor: Option<String>,
}

pub fn parse(text: &str) -> Result<ScanRef, String> {
    let text = text.trim();
    if text.eq_ignore_ascii_case("latest") {
        return Ok(ScanRef::Latest);
    }
    let valid = text.chars().all(|character| character.is_ascii_alphanumeric() || character == '-');
    if text.len() < MIN_PREFIX || !valid {
        return Err(format!("`{text}` is not a Scan ID: give at least {MIN_PREFIX} characters of one, or `latest`"));
    }
    Ok(ScanRef::Prefix(text.to_ascii_lowercase()))
}

pub fn pick(prefix: &str, scans: Vec<ScanRow>) -> FoundScan {
    let mut matches: Vec<ScanRow> = scans.into_iter().filter(|scan| scan.scan_id.to_ascii_lowercase().starts_with(prefix)).collect();
    match matches.len() {
        0 => FoundScan::None,
        1 => FoundScan::One(matches.remove(0)),
        _ => FoundScan::Many(matches),
    }
}

pub fn past_prefix(prefix: &str, page: &[ScanRow]) -> bool {
    let head = prefix.len().min(TIME_PART);
    page.last().is_some_and(|last| last.scan_id.to_ascii_lowercase().get(..head).is_some_and(|id| id > &prefix[..head]))
}

async fn page(client: &EngineClient<'_>, repo_id: Option<&str>, limit: usize, cursor: Option<&str>) -> Result<ScanPage, Denied> {
    let mut query = vec![("limit", limit.to_string())];
    if let Some(repo_id) = repo_id {
        query.push(("repoId", repo_id.to_string()));
    }
    if let Some(cursor) = cursor {
        query.push(("cursor", cursor.to_string()));
    }
    client.get("/scans", &query).await
}

pub async fn list_scans(client: &EngineClient<'_>, repo_id: Option<&str>, limit: usize) -> Result<Vec<ScanRow>, Denied> {
    Ok(page(client, repo_id, limit.clamp(1, PAGE), None).await?.scans)
}

pub async fn resolve(client: &EngineClient<'_>, wanted: &ScanRef, repo_id: Option<&str>) -> Result<FoundScan, Denied> {
    let prefix = match wanted {
        ScanRef::Latest => {
            return Ok(match list_scans(client, repo_id, 1).await?.into_iter().next() {
                Some(scan) => FoundScan::One(scan),
                None => FoundScan::None,
            });
        }
        ScanRef::Prefix(prefix) => prefix,
    };
    let mut seen = Vec::new();
    let mut cursor: Option<String> = None;
    for _ in 0..MAX_PAGES {
        let answered = page(client, repo_id, PAGE, cursor.as_deref()).await?;
        let done = past_prefix(prefix, &answered.scans);
        seen.extend(answered.scans);
        match answered.next_cursor {
            Some(next) if !done => cursor = Some(next),
            _ => break,
        }
    }
    Ok(pick(prefix, seen))
}

#[cfg(test)]
mod tests {
    use super::{parse, past_prefix, pick, FoundScan, ScanRef, ScanRow};

    fn scan(id: &str) -> ScanRow {
        ScanRow {
            scan_id: id.to_string(),
            repo: "acme/widgets".into(),
            repo_id: "r".into(),
            branch: None,
            status: "succeeded".into(),
            profile: None,
            created_at: "2026-01-01T00:00:00Z".into(),
            finished_at: None,
        }
    }

    #[test]
    fn a_scan_id_needs_eight_characters_or_is_latest() {
        assert_eq!(parse("LATEST"), Ok(ScanRef::Latest));
        assert_eq!(parse("0abc1234"), Ok(ScanRef::Prefix("0abc1234".into())));
        assert!(parse("0abc123").is_err());
        assert!(parse("0abc 1234").is_err());
    }

    #[test]
    fn a_prefix_names_one_scan_or_lists_the_matches() {
        let scans = vec![scan("0abc1234x-1"), scan("0abc1234y-2"), scan("0zzz9999a-3")];

        assert_eq!(pick("0zzz9999", scans.clone()), FoundScan::One(scan("0zzz9999a-3")));
        assert_eq!(pick("0abc1234", scans.clone()), FoundScan::Many(vec![scan("0abc1234x-1"), scan("0abc1234y-2")]));
        assert_eq!(pick("0abc1234y", scans.clone()), FoundScan::One(scan("0abc1234y-2")));
        assert_eq!(pick("0nope000", scans), FoundScan::None);
    }

    #[test]
    fn the_search_stops_once_the_ids_sort_past_the_prefix() {
        assert!(past_prefix("0abc1234", &[scan("0abc1234x-1"), scan("0b000000z-2")]));
        assert!(!past_prefix("0abc1234", &[scan("0aaa0000a-1"), scan("0abc1234x-2")]));
        assert!(!past_prefix("0abc1234", &[]));
    }
}
