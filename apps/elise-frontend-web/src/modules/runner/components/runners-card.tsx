import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useTable } from "@tanstack/react-table";
import { Link } from "@tanstack/react-router";
import { Bot } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { DataTable } from "#/components/ui/data-table";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "#/components/ui/empty";
import { dataTableColumns, dataTableFeatures } from "#/lib/data-table";
import { CopyCommand, INLINE_LINK_CLASS } from "#/modules/shared";
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
              <CopyCommand command={RUNNER_LOGIN_COMMAND} />
              <p className="text-sm leading-relaxed text-muted-foreground">
                The setup tasks are in{" "}
                <Link to="/overview" className={INLINE_LINK_CLASS}>
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
