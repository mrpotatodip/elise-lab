// `github`: a public repository at https://github.com/owner/name, as before providers.

use super::address::Address;

pub(super) const HOST: &str = "github.com";

pub(super) fn login_fix() -> String {
    "Sign git in to GitHub: run `gh auth login`, then `gh auth setup-git` (GitHub CLI). Without the GitHub CLI, make a read-only token at https://github.com/settings/personal-access-tokens/new and give it to git's credential helper when git asks for a password.".to_string()
}

// Exactly an owner and a name, each letters, digits, `.`, `_` or `-`, with an optional `.git` or
// trailing slash. The address is cloned as sent.
pub(super) fn parse(rest: &str) -> Result<Address, String> {
    let trimmed = rest.trim_end_matches('/');
    let trimmed = trimmed.strip_suffix(".git").unwrap_or(trimmed);
    let part_ok = |part: &str| !part.is_empty() && part.chars().all(|c| c.is_ascii_alphanumeric() || "._-".contains(c));
    let mut parts = trimmed.split('/');
    match (parts.next(), parts.next(), parts.next()) {
        (Some(owner), Some(name), None) if part_ok(owner) && part_ok(name) => Ok(Address {
            provider: "github",
            host: HOST.to_string(),
            path: format!("{owner}/{name}"),
            clone_url: format!("https://{HOST}/{rest}"),
        }),
        _ => Err("This Runner clones only public https://github.com/owner/name repositories from GitHub.".to_string()),
    }
}
