import { useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useTable } from "@tanstack/react-table";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { DataTable } from "#/components/ui/data-table";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog";
import { dataTableColumns, dataTableFeatures } from "#/lib/data-table";
import { revokeCliAccess } from "../api";
import { CLI_ACCESS_SCOPE_COPY } from "../constants";
import { cliAccessQuery, runnerKeys } from "../hooks";
import type { CliAccess } from "../schemas";
import { cliAccessDetail } from "../utils";

type CliAccessRow = { access: CliAccess; busy: boolean; revoke: () => Promise<void> };

const column = dataTableColumns<CliAccessRow>();

function CliAccessRevokeDialog({ row }: { row: CliAccessRow }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Revoke ${row.access.name}`}
            className="text-status-danger hover:text-status-danger"
          />
        }
      >
        Revoke
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Revoke this CLI access?</DialogTitle>
          <DialogDescription>
            The Elise CLI on {row.access.name} stops working for this account at once. Its Scans and findings stay. To
            use it again, run elise login and approve it again.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Keep it</DialogClose>
          <Button
            variant="destructive"
            disabled={row.busy}
            onClick={() => {
              row
                .revoke()
                .then(() => setOpen(false))
                .catch(() => undefined);
            }}
          >
            {row.busy ? "Revoking" : "Revoke access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const columns = column.columns([
  column.display({
    id: "name",
    header: "Computer",
    cell: ({ row }) => (
      <>
        <span className="block font-medium">{row.original.access.name}</span>
        <span className="block text-xs text-muted-foreground">{cliAccessDetail(row.original.access)}</span>
      </>
    ),
  }),
  column.display({
    id: "scope",
    header: "Access",
    cell: ({ row }) => <Badge variant="neutral">{CLI_ACCESS_SCOPE_COPY[row.original.access.scope]}</Badge>,
  }),
  column.display({
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    meta: { head: "w-24", cell: "text-right" },
    cell: ({ row }) => <CliAccessRevokeDialog row={row.original} />,
  }),
]);

export function CliAccessCard() {
  const { data } = useSuspenseQuery(cliAccessQuery());
  const queryClient = useQueryClient();

  const revoke = useMutation({
    mutationFn: (cliAccessId: string) => revokeCliAccess({ data: { cliAccessId } }),
    onSuccess: async () => {
      toast.success("CLI access revoked.");
      await queryClient.invalidateQueries({ queryKey: runnerKeys.cliAccess() });
    },
    onError: (error) => toast.error(`We couldn't revoke the CLI access. ${error.message}`),
  });

  const rows: CliAccessRow[] = data.map((access) => ({
    access,
    busy: revoke.isPending,
    revoke: async () => {
      await revoke.mutateAsync(access.id);
    },
  }));
  const table = useTable({ features: dataTableFeatures, columns, data: rows, getRowId: (row) => row.access.id });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Elise CLI access</CardTitle>
        <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">
          Computers where the Elise CLI reads or starts this account's Scans as the person who approved it. Revoke one
          to cut it off.
        </p>
      </CardHeader>
      <CardContent className="overflow-hidden p-0">
        {rows.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            None yet. Run elise login and choose CLI access when you approve it here.
          </p>
        ) : (
          <DataTable table={table} />
        )}
      </CardContent>
    </Card>
  );
}
