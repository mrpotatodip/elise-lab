use crate::engine_client::{Denied, EngineClient};
use serde::Deserialize;
use serde_json::json;

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PhaseSpend {
    pub phase: String,
    pub cost_usd: f64,
    pub duration_ms: Option<u64>,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Spend {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_write_tokens: u64,
    pub cost_usd: f64,
    pub turns: Option<u64>,
    pub duration_ms: Option<u64>,
    pub phases: Option<Vec<PhaseSpend>>,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct Severities {
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
    pub severity: Severities,
    pub needs_validation: u64,
    pub new: u64,
    pub carried: u64,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct RunnerRef {
    pub id: String,
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
    pub step: Option<String>,
    pub profile: String,
    pub profile_met: Option<String>,
    pub model: String,
    pub effort: String,
    pub max_budget_usd: f64,
    pub created_at: String,
    pub updated_at: String,
    pub finished_at: Option<String>,
    pub error: Option<String>,
    pub failure_code: Option<String>,
    pub resumes_scan_id: Option<String>,
    pub resumed_by_scan_id: Option<String>,
    pub usage: Option<Spend>,
    pub summary: Option<Summary>,
    pub runner: Option<RunnerRef>,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TraceEntry {
    pub id: String,
    pub label: String,
    pub phase: Option<String>,
    pub started_at: String,
    pub ended_at: String,
    pub count: u64,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TraceRow {
    pub entries: Vec<TraceEntry>,
    pub candidate_findings: Option<u64>,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Queued {
    pub scan_id: String,
    pub status: String,
}

pub async fn get_scan(client: &EngineClient<'_>, scan_id: &str) -> Result<ScanDetail, Denied> {
    client.get(&format!("/scans/{scan_id}"), &[]).await
}

pub async fn get_trace(client: &EngineClient<'_>, scan_id: &str) -> Result<TraceRow, Denied> {
    client.get(&format!("/scans/{scan_id}/trace"), &[]).await
}

pub async fn stop(client: &EngineClient<'_>, scan_id: &str) -> Result<ScanDetail, Denied> {
    client.post(&format!("/scans/{scan_id}/stop"), &json!({})).await
}

pub async fn resume(client: &EngineClient<'_>, scan_id: &str) -> Result<Queued, Denied> {
    client.post(&format!("/scans/{scan_id}/resume"), &json!({})).await
}
