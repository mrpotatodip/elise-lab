import { useState } from "react";
import { useRouteContext } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { hasAccessPower } from "@repo/contracts/elise";
import { setFindingTriage } from "../api";
import { FINDING_TRIAGE_OPTIONS } from "../constants";
import type { Finding, FindingTriage, FindingTriageStatus } from "../schemas";
import { FindingDuplicateDialog, type DuplicateCandidate } from "./finding-duplicate-dialog";
import { FindingRiskDialog, type RiskInput } from "./finding-risk-dialog";

type FindingTriageSelectProps = {
  finding: Pick<Finding, "repo" | "fingerprint" | "triage" | "title">;
  also?: readonly (readonly unknown[])[];
  candidates?: readonly DuplicateCandidate[];
  onSaved?: (fingerprint: string, triage: FindingTriage) => void;
  possibleDuplicate?: PossibleDuplicate;
};

export type PossibleDuplicate = { fingerprint: string; title: string; onDismiss: () => void };

type Decision = { status: FindingTriageStatus; acceptDays?: number; note?: string | null; duplicateOf?: string };

const SAVED_COPY = {
  open: "Reopened. It counts as open again.",
  fixed: "Marked fixed. It leaves the open count now, and the next scan will confirm it.",
  false_positive: "Dismissed as a false positive. It no longer counts as open.",
  accepted_risk: "Risk accepted. It stays out of the open count until the date you chose.",
  duplicate: "Marked as a duplicate. The finding you picked carries the problem now.",
} as const satisfies Record<FindingTriageStatus, string>;

export function FindingTriageSelect({ finding, also = [], candidates = [], onSaved, possibleDuplicate }: FindingTriageSelectProps) {
  const { user } = useRouteContext({ from: "/_app" });
  const canAcceptRisk = hasAccessPower(user?.powers ?? [], "company:findings:accepted_risk:update");
  const queryClient = useQueryClient();
  const [accepting, setAccepting] = useState(false);
  const [marking, setMarking] = useState(false);

  const save = useMutation({
    mutationFn: ({ status, acceptDays, note, duplicateOf }: Decision) =>
      setFindingTriage({ data: { repo: finding.repo, fingerprint: finding.fingerprint, status, note: note === undefined ? (finding.triage?.note ?? null) : note, acceptDays, duplicateOf } }),
    onSuccess: (saved, decision) => {
      setAccepting(false);
      setMarking(false);
      onSaved?.(finding.fingerprint, saved);
      toast.success(SAVED_COPY[decision.status]);
      void Promise.all(also.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    },
    onError: (error) => toast.error(error.message === "Forbidden" ? "Only account admins can accept a risk." : `We couldn't save that decision. ${error.message}`),
  });

  return (
    <>
      <Select
        value={finding.triage?.status ?? "open"}
        items={FINDING_TRIAGE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        disabled={save.isPending}
        onValueChange={(next) => {
          const picked = FINDING_TRIAGE_OPTIONS.find((option) => option.value === next);
          if (!picked || picked.value === (finding.triage?.status ?? "open")) return;
          if (picked.value === "accepted_risk") setAccepting(true);
          else if (picked.value === "duplicate") setMarking(true);
          else save.mutate({ status: picked.value, note: picked.value === "open" ? null : undefined });
        }}
      >
        <SelectTrigger aria-label="Your decision" className="h-8 w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FINDING_TRIAGE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value} disabled={option.value === "accepted_risk" && !canAcceptRisk}>
              <span className="grid">
                <span>{option.label}</span>
                {option.value === "accepted_risk" && !canAcceptRisk && <span className="text-xs text-muted-foreground">Account admins only</span>}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {possibleDuplicate && (
        <p className="grid max-w-56 gap-1 text-sm leading-relaxed text-muted-foreground">
          <span>
            Possible duplicate of <span className="font-medium text-foreground">{possibleDuplicate.title}</span>
          </span>
          <span className="flex gap-3">
            <button type="button" className="rounded-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setMarking(true)}>
              Review
            </button>
            <button type="button" className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={possibleDuplicate.onDismiss}>
              Dismiss
            </button>
          </span>
        </p>
      )}
      <FindingDuplicateDialog
        open={marking}
        onOpenChange={setMarking}
        suggested={possibleDuplicate?.fingerprint ?? null}
        findingTitle={finding.title}
        candidates={candidates.filter((candidate) => candidate.fingerprint !== finding.fingerprint)}
        pending={save.isPending}
        onConfirm={(duplicateOf) => save.mutate({ status: "duplicate", duplicateOf })}
      />
      <FindingRiskDialog
        open={accepting}
        onOpenChange={setAccepting}
        findingTitle={finding.title}
        initialNote={finding.triage?.note ?? ""}
        pending={save.isPending}
        onConfirm={({ note, days }: RiskInput) => save.mutate({ status: "accepted_risk", note, acceptDays: days })}
      />
    </>
  );
}
