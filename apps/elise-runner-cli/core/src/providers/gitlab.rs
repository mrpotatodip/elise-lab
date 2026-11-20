// `gitlab`: a repository on gitlab.com, in a group or in groups inside groups.

use super::address::{repo_path, Address};

pub(super) const HOST: &str = "gitlab.com";

pub(super) fn login_fix() -> String {
    "Sign git in to GitLab: run `glab auth login` (GitLab CLI). Without the GitLab CLI, make a read-only token (scope read_repository) at https://gitlab.com/-/user_settings/personal_access_tokens and give it to git's credential helper when git asks for a password.".to_string()
}

// The path up to a branch-view marker or `.git`, cloned as https://gitlab.com/<path>.git.
pub(super) fn parse(rest: &str) -> Result<Address, String> {
    let path = repo_path(rest).ok_or_else(|| {
        "A GitLab address must look like https://gitlab.com/group/name (groups inside groups are fine), with only letters, digits, '.', '_' and '-' in each part.".to_string()
    })?;
    Ok(Address { provider: "gitlab", host: HOST.to_string(), clone_url: format!("https://{HOST}/{path}.git"), path })
}
