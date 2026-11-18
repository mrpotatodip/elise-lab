// -----
// Said under the GitLab search. Elise holds no GitLab token,
// so the clone happens on the person's Runner (ADR 0008).
// -----
export function GitlabScanHelp() {
  return <p className="px-1 text-sm leading-relaxed text-muted-foreground">A GitLab audit runs on one of your Runners, which clones the repository with your own git login. Elise keeps no GitLab token.</p>;
}
