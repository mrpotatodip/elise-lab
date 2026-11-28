use crate::engine_client::{Denied, EngineClient};
use crate::repo_name::url_parts;
use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RepoRow {
    pub id: String,
    pub provider: Option<String>,
    pub host: Option<String>,
    pub url: String,
    pub canonical: String,
    pub is_private: Option<bool>,
    pub project_id: Option<String>,
    pub default_branch: Option<String>,
    pub branch_names: Vec<String>,
    pub last_scan_id: Option<String>,
    pub last_scan_status: Option<String>,
    pub last_scan_at: Option<String>,
}

impl RepoRow {
    pub fn provider(&self) -> &str {
        self.provider.as_deref().unwrap_or("github")
    }

    pub fn host(&self) -> String {
        match (&self.host, self.provider()) {
            (Some(host), _) => host.to_ascii_lowercase(),
            (None, "github") => "github.com".to_string(),
            (None, _) => url_parts(&self.url).map(|(host, _)| host).unwrap_or_default(),
        }
    }

    pub fn name(&self) -> String {
        match self.provider() {
            "gitlab" | "gitlab-sh" => format!("gitlab:{}", self.canonical),
            _ => self.canonical.clone(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BranchRow {
    pub name: String,
    pub is_default: bool,
    pub latest_scan_id: Option<String>,
    pub latest_commit: Option<String>,
    pub latest_scan_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct RepoDetailRow {
    #[serde(flatten)]
    pub repo: RepoRow,
    pub branches: Vec<BranchRow>,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct ProjectRow {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct Reason {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct VerdictScans {
    pub required: f64,
    pub counted: f64,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct VerdictRow {
    pub verdict: String,
    pub commit: String,
    pub reasons: Vec<Reason>,
    pub scans: VerdictScans,
    pub counts: Value,
}

#[derive(Deserialize)]
struct RepoList {
    repos: Vec<RepoRow>,
}

pub async fn list_repos(client: &EngineClient<'_>) -> Result<Vec<RepoRow>, Denied> {
    Ok(client.get::<RepoList>("/repos", &[]).await?.repos)
}

pub async fn get_repo(client: &EngineClient<'_>, repo_id: &str) -> Result<RepoDetailRow, Denied> {
    client.get(&format!("/repos/{repo_id}"), &[]).await
}

pub async fn list_projects(client: &EngineClient<'_>) -> Result<Vec<ProjectRow>, Denied> {
    client.get("/projects", &[]).await
}

pub async fn verdict(client: &EngineClient<'_>, repo_id: &str, commit: &str) -> Result<VerdictRow, Denied> {
    client.get(&format!("/repos/{repo_id}/verdict"), &[("commit", commit.to_string())]).await
}

pub fn project_name<'a>(projects: &'a [ProjectRow], repo: &RepoRow) -> Option<&'a str> {
    let id = repo.project_id.as_deref()?;
    projects.iter().find(|project| project.id == id).map(|project| project.name.as_str())
}
