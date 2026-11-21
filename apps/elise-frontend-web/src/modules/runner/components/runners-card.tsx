import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useTable } from "@tanstack/react-table";
import { Link } from "@tanstack/react-router";
import { Bot, Copy } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { DataTable } from "#/components/ui/data-table";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "#/components/ui/empty";
import { dataTableColumns, dataTableFeatures } from "#/lib/data-table";
import { removeRunner } from "../api";
import { RUNNER_LOGIN_COMMAND, RUNNER_STATE_COPY } from "../constants";
import { runnerKeys, runnersQuery } from "../hooks";
import type { Runner } from "../schemas";
import { runnerAddedBy, runnerDetail, runnerShownState } from "../utils";
import { useNow } from "#/lib/use-now";
import { RunnerRemoveDialog } from "./runner-remove-dialog";

type RunnerRow = { runner: Runner; busy: boolean; remove: () => Promise<void> };

const column = dataTableColumns<RunnerRow>();

function RunnerStateBadge({ runner }: { runner: Runner }) {
  const now = useNow();
  const state = RUNNER_STATE_COPY[runnerShownState(runner, now)];
  return <Badge variant={state.variant}>{state.label}</Badge>;
}

const columns = column.columns([
  column.display({
    id: "name",
    header: "Computer",
    cell: ({ row }) => (
      <>
        <span className="block font-medium">{row.original.runner.name}</span>
        <span className="block text-xs text-muted-foreground">{[runnerDetail(row.original.runner), runnerAddedBy(row.original.runner)].filter(Boolean).join(" ")}</span>
      </>
    ),
  }),
  column.display({
    id: "state",
    header: "Status",
    cell: ({ row }) => <RunnerStateBadge runner={row.original.runner} />,
  }),
  column.display({
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    meta: { head: "w-24", cell: "text-right" },
    cell: ({ row }) => <RunnerRemoveDialog runner={row.original.runner} pending={row.original.busy} onConfirm={row.original.remove} />,
  }),
]);

export function RunnersCard() {
  const { data } = useSuspenseQuery(runnersQuery());
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: (runnerId: string) => removeRunner({ data: { runnerId } }),
    onSuccess: async () => {
      toast.success("Runner removed.");
      await queryClient.invalidateQueries({ queryKey: runnerKeys.list() });
    },
    onError: (error) => toast.error(`We couldn't remove the runner. ${error.message}`),
  });

  const rows: RunnerRow[] = data.map((runner) => ({
    runner,
    busy: remove.isPending,
    remove: async () => {
      await remove.mutateAsync(runner.id);
    },
  }));
  const table = useTable({ features: dataTableFeatures, columns, data: rows, getRowId: (row) => row.runner.id });

  return (
    <Card>
      <CardHeader>
        <CardTitle>All computers</CardTitle>
        <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">Each one runs scans while its Runner is open. Remove a computer to stop it taking scans.</p>
      </CardHeader>
      <CardContent className="overflow-hidden p-0">
        {rows.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Bot aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No runners yet</EmptyTitle>
              <EmptyDescription>On a computer with Claude Code signed in, run this and approve it here.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="max-w-md">
              <div className="flex w-full items-center gap-2">
                <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded bg-muted px-2 py-1.5 text-left font-mono text-xs">{RUNNER_LOGIN_COMMAND}</code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={`Copy ${RUNNER_LOGIN_COMMAND}`}
                  onClick={() => {
                    void navigator.clipboard.writeText(RUNNER_LOGIN_COMMAND).then(() => toast.success("Command copied."));
                  }}
                >
                  <Copy className="size-3.5" />
                  Copy
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Setup steps are in{" "}
                <Link to="/overview" className="inline-flex min-h-6 items-center rounded-sm font-medium text-primary-ink underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  Getting started
                </Link>
                . For CI or a container, use Add a runner to make a pairing code.
              </p>
            </EmptyContent>
          </Empty>
        ) : (
          <DataTable table={table} />
        )}
      </CardContent>
    </Card>
  );
}
