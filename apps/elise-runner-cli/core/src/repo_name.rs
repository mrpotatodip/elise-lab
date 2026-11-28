use crate::cli_repos::RepoRow;
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RepoName {
    Id(String),
    Current,
    Url { host: String, path: String },
    Github(String),
    Gitlab(String),
}

pub enum Found<'a> {
    One(&'a RepoRow),
    Many(Vec<&'a RepoRow>),
    None,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Checkout {
    pub remote: String,
    pub branch: Option<String>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum CheckoutError {
    NoGit,
    NotACheckout,
    NoOrigin,
}

fn is_id(text: &str) -> bool {
    text.len() == 36
        && text.char_indices().all(
            |(at, character)| {
                if matches!(at, 8 | 13 | 18 | 23) {
                    character == '-'
                } else {
                    character.is_ascii_hexdigit()
                }
            },
        )
}

pub fn url_parts(text: &str) -> Option<(String, String)> {
    let text = text.trim();
    let (host, path) = match text.split_once("://") {
        Some((_, rest)) => {
            let (authority, path) = rest.split_once('/')?;
            (authority.rsplit('@').next()?.to_string(), path.to_string())
        }
        None => match text.split_once(':') {
            Some((front, path)) if front.contains('@') => (front.rsplit('@').next()?.to_string(), path.to_string()),
            _ => {
                let (host, path) = text.split_once('/')?;
                (host.to_string(), path.to_string())
            }
        },
    };
    let host = host.to_ascii_lowercase();
    let host = host.strip_prefix("www.").unwrap_or(&host).to_string();
    let path = path.split(['?', '#']).next()?.trim_matches('/');
    let path = path.strip_suffix(".git").unwrap_or(path).to_ascii_lowercase();
    let path = if host == "github.com" { path.split('/').take(2).collect::<Vec<_>>().join("/") } else { path };
    if host.is_empty() || path.is_empty() {
        return None;
    }
    Some((host, path))
}

pub fn parse(text: &str) -> Result<RepoName, String> {
    let text = text.trim();
    if text == "." {
        return Ok(RepoName::Current);
    }
    if is_id(text) {
        return Ok(RepoName::Id(text.to_ascii_lowercase()));
    }
    if let Some(path) = text.strip_prefix("gitlab:") {
        let path = path.trim_matches('/');
        return match path.contains('/') {
            true => Ok(RepoName::Gitlab(path.to_ascii_lowercase())),
            false => Err(format!("`{text}` is not a repo: write gitlab:owner/name")),
        };
    }
    let looks_like_url =
        text.contains("://") || text.starts_with("git@") || text.split('/').next().is_some_and(|first| first.contains('.'));
    if looks_like_url {
        return match url_parts(text) {
            Some((host, path)) => Ok(RepoName::Url { host, path }),
            None => Err(format!("`{text}` is not a repo address: write https://host/owner/name")),
        };
    }
    let mut parts = text.split('/');
    match (parts.next(), parts.next(), parts.next()) {
        (Some(owner), Some(name), None) if !owner.is_empty() && !name.is_empty() && !text.contains(char::is_whitespace) => {
            Ok(RepoName::Github(format!("{owner}/{name}").to_ascii_lowercase()))
        }
        _ => Err(format!("`{text}` is not a repo: use a URL, owner/name, gitlab:owner/name, an ID or `.`")),
    }
}

pub fn find<'a>(repos: &'a [RepoRow], name: &RepoName) -> Found<'a> {
    let matches: Vec<&RepoRow> = repos
        .iter()
        .filter(|repo| match name {
            RepoName::Id(id) => repo.id.eq_ignore_ascii_case(id),
            RepoName::Current => false,
            RepoName::Url { host, path } => repo.host() == *host && repo.canonical == *path,
            RepoName::Github(path) => repo.provider() == "github" && repo.canonical == *path,
            RepoName::Gitlab(path) => matches!(repo.provider(), "gitlab" | "gitlab-sh") && repo.canonical == *path,
        })
        .collect();
    match matches.as_slice() {
        [] => Found::None,
        [one] => Found::One(one),
        _ => Found::Many(matches),
    }
}

fn git(dir: &Path, args: &[&str]) -> Result<Option<String>, CheckoutError> {
    let output = Command::new("git").args(args).current_dir(dir).output().map_err(|_| CheckoutError::NoGit)?;
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok((output.status.success() && !text.is_empty()).then_some(text))
}

pub fn checkout(dir: &Path) -> Result<Checkout, CheckoutError> {
    if git(dir, &["rev-parse", "--git-dir"])?.is_none() {
        return Err(CheckoutError::NotACheckout);
    }
    let remote = git(dir, &["remote", "get-url", "origin"])?.ok_or(CheckoutError::NoOrigin)?;
    let branch = git(dir, &["symbolic-ref", "--short", "-q", "HEAD"])?;
    Ok(Checkout { remote, branch })
}

#[cfg(test)]
mod tests {
    use super::{parse, url_parts, RepoName};

    #[test]
    fn every_form_of_a_name_parses() {
        let id = "5b0c3f0e-1d2a-4c3b-8e4f-6a7b8c9d0e1f";
        let cases = [
            (".", RepoName::Current),
            (id, RepoName::Id(id.to_string())),
            ("Acme/Widgets", RepoName::Github("acme/widgets".into())),
            ("gitlab:Group/Sub/App", RepoName::Gitlab("group/sub/app".into())),
            ("https://github.com/acme/widgets", RepoName::Url { host: "github.com".into(), path: "acme/widgets".into() }),
            ("https://github.com/Acme/Widgets.git", RepoName::Url { host: "github.com".into(), path: "acme/widgets".into() }),
            ("https://github.com/acme/widgets/tree/main", RepoName::Url { host: "github.com".into(), path: "acme/widgets".into() }),
            ("git@github.com:acme/widgets.git", RepoName::Url { host: "github.com".into(), path: "acme/widgets".into() }),
            ("github.com/acme/widgets", RepoName::Url { host: "github.com".into(), path: "acme/widgets".into() }),
            ("https://git.example.com/group/sub/app.git/", RepoName::Url { host: "git.example.com".into(), path: "group/sub/app".into() }),
            ("ssh://git@git.example.com/group/app.git", RepoName::Url { host: "git.example.com".into(), path: "group/app".into() }),
        ];
        for (text, wanted) in cases {
            assert_eq!(parse(text), Ok(wanted), "{text}");
        }
    }

    #[test]
    fn a_text_that_is_no_repo_is_refused() {
        for text in ["widgets", "a/b/c", "gitlab:widgets", "", "acme/ widgets"] {
            assert!(parse(text).is_err(), "{text}");
        }
        assert_eq!(url_parts("https://github.com"), None);
    }
}
