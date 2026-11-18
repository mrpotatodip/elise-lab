// -----
// Said under the GitLab search. Elise holds no GitLab token,
// so the clone happens on the person's Runner (ADR 0008). The
// Runner never asks for a password, so a private repository
// needs a login that git already stored on that computer.
// -----
export function GitlabScanHelp() {
  return (
    <div className="grid gap-2 px-1 text-sm leading-relaxed text-muted-foreground">
      <p>A GitLab audit runs on one of your Runners, which clones the repository with your own git login. Elise keeps no GitLab token.</p>
      <p>
        A private repository needs a login that is already stored on that computer: the Runner never asks for a password. Run <code className="font-mono text-xs">git clone</code> once in a terminal and enter your GitLab username and an access token. GitLab refuses your account password when two-factor sign-in is on, and a fine-grained token needs the project permission{" "}
        <span className="font-medium text-foreground">Code: Download</span>.
      </p>
    </div>
  );
}
