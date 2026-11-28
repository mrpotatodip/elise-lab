use crate::engine::{client, engine_url, Envelope};
use crate::engine_client::{Denied, EngineClient};
use crate::repo_name::RepoName;
use crate::store::TokenStore;
use serde::Deserialize;
use serde_json::{json, Value};

pub const DEFAULT_PROFILE: &str = "standard";
const PROFILES: [(&str, &str); 3] = [("quick", "focused"), ("standard", "balanced"), ("deep", "exhaustive")];
const PARTIAL_LINES: [&str; 2] = ["PARTIAL: money ran out;", "PARTIAL: a phase ran out of time;"];

pub fn profile_of(text: &str) -> Option<&'static str> {
    let text = text.trim().to_ascii_lowercase();
    PROFILES.iter().find(|(name, alias)| text == *name || text == *alias).map(|(name, _)| *name)
}

pub fn profile_names() -> String {
    PROFILES.iter().map(|(name, alias)| format!("{name} ({alias})")).collect::<Vec<_>>().join(", ")
}

pub fn parse_timeout(text: &str) -> Option<u64> {
    let text = text.trim();
    let (digits, unit) = match text.char_indices().last()? {
        (at, 's') => (&text[..at], 1),
        (at, 'm') => (&text[..at], 60),
        (at, 'h') => (&text[..at], 3600),
        _ => (text, 1),
    };
    digits.parse::<u64>().ok().filter(|count| *count > 0).and_then(|count| count.checked_mul(unit))
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct RunnerRow {
    pub id: String,
    pub name: String,
    pub state: String,
}

#[derive(Debug, PartialEq)]
pub enum Choice {
    One(RunnerRow),
    Unknown(String),
    Many(Vec<RunnerRow>),
    None,
}

pub fn choose(wanted: Option<&str>, here: Option<&RunnerRow>, listed: &[RunnerRow]) -> Choice {
    let connected: Vec<RunnerRow> = listed.iter().filter(|runner| runner.state == "connected").cloned().collect();
    if let Some(wanted) = wanted {
        let mut found: Vec<RunnerRow> = connected
            .into_iter()
            .filter(|runner| runner.id.eq_ignore_ascii_case(wanted) || runner.name.eq_ignore_ascii_case(wanted))
            .collect();
        return match found.len() {
            0 => Choice::Unknown(wanted.to_string()),
            1 => Choice::One(found.remove(0)),
            _ => Choice::Many(found),
        };
    }
    if let Some(here) = connected.iter().find(|runner| here.is_some_and(|here| runner.id == here.id)) {
        return Choice::One(here.clone());
    }
    match connected.len() {
        0 => Choice::None,
        1 => Choice::One(connected[0].clone()),
        _ => Choice::Many(connected),
    }
}

pub async fn list_runners(client: &EngineClient<'_>) -> Result<Vec<RunnerRow>, Denied> {
    client.get("/runners", &[]).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Identity {
    runner_id: String,
    name: String,
}

pub async fn this_runner(tokens: &dyn TokenStore) -> Option<RunnerRow> {
    let token = tokens.token()?;
    let response = client().get(format!("{}/runners/me", engine_url())).bearer_auth(&token).send().await.ok()?;
    let identity = response.json::<Envelope<Identity>>().await.ok()?.data;
    Some(RunnerRow { id: identity.runner_id, name: identity.name, state: "connected".to_string() })
}

#[derive(Debug, Clone, PartialEq)]
pub struct NewRepo {
    pub provider: &'static str,
    pub url: String,
}

pub fn new_repo(name: &RepoName) -> Option<NewRepo> {
    match name {
        RepoName::Github(path) => Some(NewRepo { provider: "github", url: format!("https://github.com/{path}") }),
        RepoName::Gitlab(path) => Some(NewRepo { provider: "gitlab", url: format!("https://gitlab.com/{path}") }),
        RepoName::Url { host, path } => {
            let provider = match host.as_str() {
                "github.com" => "github",
                "gitlab.com" => "gitlab",
                _ => "gitlab-sh",
            };
            Some(NewRepo { provider, url: format!("https://{host}/{path}") })
        }
        RepoName::Id(_) | RepoName::Current => None,
    }
}

pub async fn add_repo(client: &EngineClient<'_>, repo: &NewRepo) -> Result<(), Denied> {
    client.post::<Value>("/repos", &json!({ "provider": repo.provider, "repo": repo.url })).await.map(|_| ())
}

pub struct Request<'a> {
    pub provider: &'a str,
    pub url: &'a str,
    pub branch: Option<&'a str>,
    pub profile: &'a str,
    pub budget: Option<f64>,
    pub runner_id: &'a str,
    pub archive_id: Option<&'a str>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Queued {
    pub scan_id: String,
    pub profile: Option<String>,
    pub max_budget_usd: Option<f64>,
}

pub async fn start(client: &EngineClient<'_>, request: &Request<'_>) -> Result<Queued, Denied> {
    let mut body = json!({
        "provider": request.provider,
        "repo": request.url,
        "profile": request.profile,
        "runner_id": request.runner_id,
    });
    if let Some(branch) = request.branch {
        body["ref"] = json!(branch);
    }
    if let Some(budget) = request.budget {
        body["max_budget_usd"] = json!(budget);
    }
    if let Some(archive_id) = request.archive_id {
        body["archive_id"] = json!(archive_id);
    }
    client.post("/scans", &body).await
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Spent {
    pub cost_usd: f64,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub scan_id: String,
    pub status: String,
    pub error: Option<String>,
    pub usage: Option<Spent>,
    pub summary: Option<Value>,
}

impl Progress {
    pub fn is_over(&self) -> bool {
        matches!(self.status.as_str(), "succeeded" | "failed" | "stopped")
    }
}

pub async fn progress(client: &EngineClient<'_>, scan_id: &str) -> Result<Progress, Denied> {
    client.get(&format!("/scans/{scan_id}"), &[]).await
}

pub async fn is_partial(client: &EngineClient<'_>, scan_id: &str) -> Result<bool, Denied> {
    match client.get_bytes(&format!("/scans/{scan_id}/files/REPORT.md"), &[]).await {
        Ok(bytes) => {
            Ok(String::from_utf8_lossy(&bytes).lines().next().is_some_and(|first| PARTIAL_LINES.iter().any(|line| first.starts_with(line))))
        }
        Err(Denied::NotFound(_)) => Ok(false),
        Err(why) => Err(why),
    }
}

#[cfg(test)]
mod tests {
    use super::{choose, new_repo, parse_timeout, profile_of, Choice, NewRepo, RunnerRow};
    use crate::repo_name::RepoName;

    fn runner(id: &str, name: &str, state: &str) -> RunnerRow {
        RunnerRow { id: id.to_string(), name: name.to_string(), state: state.to_string() }
    }

    #[test]
    fn a_profile_is_its_name_or_its_alias() {
        assert_eq!(profile_of("Focused"), Some("quick"));
        assert_eq!(profile_of("balanced"), Some("standard"));
        assert_eq!(profile_of("deep"), Some("deep"));
        assert_eq!(profile_of("fast"), None);
    }

    #[test]
    fn a_timeout_is_seconds_minutes_or_hours() {
        assert_eq!(parse_timeout("90"), Some(90));
        assert_eq!(parse_timeout("30m"), Some(1800));
        assert_eq!(parse_timeout("2h"), Some(7200));
        assert_eq!(parse_timeout("0"), None);
        assert_eq!(parse_timeout("soon"), None);
    }

    #[test]
    fn the_runner_is_the_named_one_then_this_computers_then_the_only_one() {
        let laptop = runner("1", "laptop", "connected");
        let box_ = runner("2", "build-box", "connected");
        let waiting = runner("3", "new", "waiting");
        let all = [laptop.clone(), box_.clone(), waiting];

        assert_eq!(choose(Some("BUILD-BOX"), Some(&laptop), &all), Choice::One(box_.clone()));
        assert_eq!(choose(Some("2"), None, &all), Choice::One(box_.clone()));
        assert_eq!(choose(Some("new"), None, &all), Choice::Unknown("new".into()));
        assert_eq!(choose(None, Some(&laptop), &all), Choice::One(laptop.clone()));
        assert_eq!(choose(None, None, &all), Choice::Many(vec![laptop.clone(), box_.clone()]));
        assert_eq!(choose(None, Some(&runner("9", "other", "connected")), std::slice::from_ref(&box_)), Choice::One(box_));
        assert_eq!(choose(None, None, &[]), Choice::None);
    }

    #[test]
    fn a_new_repo_gets_the_provider_its_host_implies() {
        let url = |host: &str| RepoName::Url { host: host.into(), path: "o/n".into() };

        assert_eq!(new_repo(&RepoName::Github("o/n".into())), Some(NewRepo { provider: "github", url: "https://github.com/o/n".into() }));
        assert_eq!(new_repo(&url("gitlab.com")).map(|repo| repo.provider), Some("gitlab"));
        assert_eq!(new_repo(&url("git.example.com")).map(|repo| repo.provider), Some("gitlab-sh"));
        assert_eq!(new_repo(&RepoName::Id("x".into())), None);
    }
}
