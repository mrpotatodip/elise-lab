import type { ScanFailureCodeValue } from "@repo/contracts/elise";

const FAILURE_RULES: { code: ScanFailureCodeValue; test: RegExp }[] = [
  { code: "out_of_memory", test: /out of memory/i },
  { code: "plan_usage_limit", test: /hit your [\w-]+ limit|usage limit reached|you've reached your .*limit/i },
  { code: "ref_not_found", test: /couldn't find remote ref|not our ref|invalid refspec/i },
  { code: "clone_timeout", test: /command exited (124|137):/i },
  {
    code: "repo_unreadable",
    test: /repository .*not found|could not read username|authentication failed|returned error: (401|403|404)/i,
  },
  { code: "clone_failed", test: /clone|could not read from remote/i },
  { code: "no_report", test: /finished without writing REPORT\.md/i },
  {
    code: "budget_spent",
    test: /exceeded usd budget|error_max_budget_usd|the scan's budget is spent|reached its spend limit/i,
  },
  { code: "timed_out", test: /timed out|timeout/i },
];

export const failureCodeOf = (error: string | null | undefined): ScanFailureCodeValue | null => {
  const text = (error ?? "").trim();
  return FAILURE_RULES.find((rule) => rule.test.test(text))?.code ?? null;
};
