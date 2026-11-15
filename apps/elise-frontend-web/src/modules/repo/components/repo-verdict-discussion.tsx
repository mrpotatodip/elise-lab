import { FindingStatusBadge } from "#/modules/finding";
import { FindingDiscussionButton } from "#/modules/finding-comment";
import type { DiscussFindingProps } from "#/modules/scan";

// -----
// The discussion button of a verdict's finding, for any screen that shows
// one. The scan module cannot import the finding modules, so a screen
// passes this in. Every finding a verdict lists as open has no decision
// yet, so its badge says open.
// -----
export function RepoVerdictDiscussion({ repo, fingerprint, finding }: DiscussFindingProps) {
  return <FindingDiscussionButton repo={repo} fingerprint={fingerprint} finding={finding} status={<FindingStatusBadge state="open" triage={null} />} />;
}
