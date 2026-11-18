// -----
// Said under the GitLab server search. The Runner clones
// only from a host listed in its own settings, never from
// one the job names (ADR 0007), so the person must list it.
// -----
export function GitlabShScanHelp() {
  return (
    <p className="px-1 text-sm leading-relaxed text-muted-foreground">
      The audit runs on one of your Runners, which clones with your own git login. It clones only from a server you list in its <code className="font-mono text-xs">settings.json</code>, as{" "}
      <code className="font-mono text-xs">{'{"gitlabHosts": ["git.example.com"]}'}</code>. Elise keeps no token for your server.
    </p>
  );
}
