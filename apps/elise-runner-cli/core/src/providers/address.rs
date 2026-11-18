// What every provider's address shares: https, a plain host name, and a path of safe parts. Not a
// provider: each provider module uses this, and none uses another provider.

// A repository the Runner may clone. clone_url is built from the checked parts (or, for github,
// is the address as sent), so nothing else in the job reaches git.
#[derive(Debug, Clone, PartialEq)]
pub struct Address {
    pub provider: &'static str,
    pub host: String,
    pub path: String,
    pub clone_url: String,
}

// GitLab's own limit on groups inside groups is 20, so a path has at most 20 parts below the host.
const PATH_PARTS_MAX: usize = 20;
const HOST_MAX: usize = 253;

// The lowercase host and what follows it. Only https: any other scheme (http, ssh, git, ext::, a
// local path) is refused, so a forged job cannot pick an unsafe transport. The host is a plain
// name: no user, password or port.
pub(super) fn split(url: &str) -> Result<(String, &str), String> {
    let rest = url
        .strip_prefix("https://")
        .ok_or_else(|| "This Runner clones only https:// addresses. Use the repository's https address.".to_string())?;
    let (host, rest) = rest.split_once('/').unwrap_or((rest, ""));
    if !plain_host(host) {
        return Err(format!("\"{host}\" is not a host this Runner will clone from: use the plain host name, with no user, password or port."));
    }
    Ok((host.to_ascii_lowercase(), rest))
}

fn plain_host(host: &str) -> bool {
    let label_ok = |label: &str| {
        (1..=63).contains(&label.len()) && !label.starts_with('-') && !label.ends_with('-') && label.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
    };
    host.len() <= HOST_MAX && host.contains('.') && host.split('.').all(label_ok)
}

// A nested repository path (`group/subgroup/name`), read up to a branch-view marker (`/-/`, as in
// `/-/tree/main`) or a trailing `.git`. At least a group and a name, each part letters, digits,
// `.`, `_` or `-` and starting with a letter, digit or `_`, as GitLab itself requires (so no `..`).
// None when the path is not one. Twin of GITLAB_ADDRESS_PATTERN and GITLAB_SH_ADDRESS_PATTERN in
// packages/contracts/src/elise/constants.ts, which the engine checks a request with.
pub(super) fn repo_path(rest: &str) -> Option<String> {
    let rest = rest.split_once("/-/").map_or(rest, |(path, _)| path);
    let rest = rest.strip_suffix('/').unwrap_or(rest);
    let rest = rest.strip_suffix(".git").unwrap_or(rest);
    let parts: Vec<&str> = rest.split('/').collect();
    let part_ok = |part: &&str| {
        part.starts_with(|c: char| c.is_ascii_alphanumeric() || c == '_') && part.chars().all(|c| c.is_ascii_alphanumeric() || "._-".contains(c))
    };
    ((2..=PATH_PARTS_MAX).contains(&parts.len()) && parts.iter().all(part_ok)).then(|| parts.join("/"))
}
