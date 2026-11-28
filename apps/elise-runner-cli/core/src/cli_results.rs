use crate::engine_client::{Denied, EngineClient};
use serde::Deserialize;
use serde_json::Value;

const PAGE: usize = 100;
const MAX_PAGES: usize = 50;
const SEVERITIES: [&str; 5] = ["critical", "high", "medium", "low", "informational"];

#[derive(Debug, Clone, Default, Deserialize, PartialEq)]
pub struct SeverityCounts {
    pub critical: u64,
    pub high: u64,
    pub medium: u64,
    pub low: u64,
    pub informational: u64,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub total: u64,
    pub severity: SeverityCounts,
    pub needs_validation: u64,
    pub new: u64,
    pub carried: u64,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Artifact {
    pub name: String,
    pub size_bytes: u64,
    pub content_type: String,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    pub cost_usd: f64,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct Runner {
    pub name: String,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScanDetail {
    pub scan_id: String,
    pub repo: String,
    pub repo_id: String,
    pub branch: Option<String>,
    pub commit_sha: Option<String>,
    pub status: String,
    pub profile: Option<String>,
    pub created_at: String,
    pub finished_at: Option<String>,
    pub error: Option<String>,
    pub files: Option<Vec<String>>,
    pub artifacts: Option<Vec<Artifact>>,
    pub summary: Option<Summary>,
    pub usage: Option<Usage>,
    pub runner: Option<Runner>,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct Triage {
    pub status: String,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FindingRow {
    pub scan_id: String,
    pub repo: String,
    pub fingerprint: Option<String>,
    pub status: String,
    pub severity: Option<String>,
    pub title: String,
    pub class: Option<String>,
    pub file: Option<String>,
    pub line: Option<i64>,
    pub actor: Option<String>,
    pub impact: Option<String>,
    pub evidence: Option<String>,
    pub fix: Option<String>,
    pub needs: Option<String>,
    pub triage: Option<Triage>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FindingPage {
    findings: Vec<FindingRow>,
    next_cursor: Option<String>,
}

#[derive(Debug, Default, Clone)]
pub struct Filter {
    pub repo: Option<String>,
    pub severity: Option<String>,
    pub status: Option<String>,
}

impl Filter {
    pub fn keeps(&self, finding: &FindingRow) -> bool {
        self.severity.as_ref().is_none_or(|severity| finding.severity.as_ref() == Some(severity))
            && self.status.as_ref().is_none_or(|status| &finding.status == status)
    }
}

pub fn severity_rank(severity: Option<&str>) -> usize {
    severity.and_then(|severity| SEVERITIES.iter().position(|known| *known == severity)).unwrap_or(SEVERITIES.len())
}

pub fn sort_worst_first(findings: &mut [FindingRow]) {
    findings.sort_by_key(|finding| severity_rank(finding.severity.as_deref()));
}

pub async fn scan_detail(client: &EngineClient<'_>, scan_id: &str) -> Result<ScanDetail, Denied> {
    client.get(&format!("/scans/{scan_id}"), &[]).await
}

pub async fn scan_diff(client: &EngineClient<'_>, scan_id: &str) -> Result<Value, Denied> {
    client.get(&format!("/scans/{scan_id}/diff"), &[]).await
}

pub async fn scan_file(client: &EngineClient<'_>, scan_id: &str, name: &str) -> Result<Vec<u8>, Denied> {
    client.get_bytes(&format!("/scans/{scan_id}/files/{name}"), &[]).await
}

pub async fn verdict(client: &EngineClient<'_>, repo_id: &str, commit: &str) -> Result<Value, Denied> {
    client.get(&format!("/repos/{repo_id}/verdict"), &[("commit", commit.to_string())]).await
}

async fn recorded(client: &EngineClient<'_>, query: &[(&str, String)]) -> Result<Vec<FindingRow>, Denied> {
    let mut found = Vec::new();
    let mut cursor: Option<String> = None;
    for _ in 0..MAX_PAGES {
        let mut page_query = query.to_vec();
        page_query.push(("limit", PAGE.to_string()));
        if let Some(cursor) = &cursor {
            page_query.push(("cursor", cursor.clone()));
        }
        let page: FindingPage = client.get("/findings", &page_query).await?;
        found.extend(page.findings);
        match page.next_cursor {
            Some(next) => cursor = Some(next),
            None => break,
        }
    }
    Ok(found)
}

pub async fn findings_of_branches(client: &EngineClient<'_>, filter: &Filter) -> Result<Vec<FindingRow>, Denied> {
    let mut query = Vec::new();
    if let Some(repo) = &filter.repo {
        query.push(("repo", repo.clone()));
    }
    if let Some(severity) = &filter.severity {
        query.push(("severity", severity.clone()));
    }
    if let Some(status) = &filter.status {
        query.push(("status", status.clone()));
    }
    recorded(client, &query).await
}

pub async fn findings_of_scan(client: &EngineClient<'_>, scan: &ScanDetail) -> Result<Vec<FindingRow>, Denied> {
    let rows = recorded(client, &[("scanId", scan.scan_id.clone())]).await?;
    if !rows.is_empty() {
        return Ok(rows);
    }
    match scan_file(client, &scan.scan_id, "findings.json").await {
        Ok(bytes) => parse_findings_file(&scan.scan_id, &scan.repo, &bytes).ok_or(Denied::Unreadable),
        Err(Denied::NotFound(_)) => Ok(Vec::new()),
        Err(why) => Err(why),
    }
}

fn places(item: &Value, key: &str) -> Option<Option<(String, i64)>> {
    let Some(list) = item.get(key) else { return Some(None) };
    let mut first = None;
    for place in list.as_array()? {
        let file = place.get("file")?.as_str()?.to_string();
        let line = place.get("line")?.as_f64()? as i64;
        first.get_or_insert((file, line));
    }
    Some(first)
}

fn finding_of_file(scan_id: &str, repo: &str, item: &Value) -> Option<FindingRow> {
    let kept = |name: &str, allowed: &[&str]| item.get(name)?.as_str().filter(|text| allowed.contains(text)).map(str::to_string);
    let title = item.get("title")?.as_str()?.to_string();
    let lite = kept("status", &["confirmed", "needs_validation"]);
    let (status, severity, place) = match lite {
        Some(status) => {
            let severity = item.get("severity").and_then(Value::as_str).filter(|text| SEVERITIES.contains(text)).map(str::to_string);
            (status, severity, places(item, "location")?)
        }
        None => {
            let status = kept("verdict", &["confirmed", "needs_validation", "rejected"])?;
            let severity = match item.get("severity") {
                None => None,
                Some(object) => Some(object.get("overall_severity")?.as_str().filter(|text| SEVERITIES.contains(text))?.to_string()),
            };
            (status, severity, places(item, "evidence")?)
        }
    };
    let (file, line) = place.map_or((None, None), |(file, line)| (Some(file), Some(line)));
    Some(FindingRow {
        scan_id: scan_id.to_string(),
        repo: repo.to_string(),
        fingerprint: None,
        status,
        severity,
        title,
        class: None,
        file,
        line,
        actor: None,
        impact: None,
        evidence: None,
        fix: None,
        needs: None,
        triage: None,
    })
}

pub fn parse_findings_file(scan_id: &str, repo: &str, bytes: &[u8]) -> Option<Vec<FindingRow>> {
    let items: Vec<Value> = serde_json::from_slice(bytes).ok()?;
    Some(items.iter().filter_map(|item| finding_of_file(scan_id, repo, item)).collect())
}

#[cfg(test)]
mod tests {
    use super::{parse_findings_file, FindingRow};

    fn parsed(text: &str) -> Vec<FindingRow> {
        parse_findings_file("s-1", "acme/widgets", text.as_bytes()).expect("an array parses")
    }

    #[test]
    fn an_old_flat_finding_and_a_nested_one_reduce_to_the_same_shape() {
        let found = parsed(
            r#"[
              {"status":"confirmed","severity":"high","title":"SQL built from input","location":[{"file":"db.ts","line":12},{"file":"x.ts","line":1}]},
              {"verdict":"needs_validation","title":"Token in logs","severity":{"overall_severity":"low"},"evidence":[{"file":"log.ts","line":3}]},
              {"verdict":"rejected","title":"Not real"}
            ]"#,
        );

        assert_eq!(found.len(), 3);
        assert_eq!(
            (found[0].status.as_str(), found[0].severity.as_deref(), found[0].file.as_deref(), found[0].line),
            ("confirmed", Some("high"), Some("db.ts"), Some(12))
        );
        assert_eq!(
            (found[1].status.as_str(), found[1].severity.as_deref(), found[1].file.as_deref(), found[1].line),
            ("needs_validation", Some("low"), Some("log.ts"), Some(3))
        );
        assert_eq!((found[2].status.as_str(), found[2].severity.clone(), found[2].file.clone()), ("rejected", None, None));
    }

    #[test]
    fn one_malformed_item_does_not_hide_the_rest_and_a_bad_severity_becomes_none() {
        let found = parsed(
            r#"[
              {"status":"confirmed","severity":"urgent","title":"A"},
              {"status":"maybe","title":"B"},
              {"status":"confirmed","title":"C","location":[{"file":"a.ts"}]},
              {"status":"confirmed","title":"D"},
              7
            ]"#,
        );

        let titles: Vec<&str> = found.iter().map(|finding| finding.title.as_str()).collect();
        assert_eq!(titles, ["A", "D"]);
        assert_eq!(found[0].severity, None);
    }

    #[test]
    fn a_file_that_is_not_an_array_is_unreadable() {
        assert!(parse_findings_file("s-1", "acme/widgets", br#"{"findings":[]}"#).is_none());
    }
}
