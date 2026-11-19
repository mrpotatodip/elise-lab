import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient, useSuspenseQueries } from "@tanstack/react-query";
import { useTable } from "@tanstack/react-table";
import { Layers, Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { GROUP_NAME_MAX } from "@repo/contracts/elise";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { DataTable } from "#/components/ui/data-table";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "#/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "#/components/ui/empty";
import { FieldError } from "#/components/ui/field-error";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { dataTableColumns, dataTableFeatures } from "#/lib/data-table";
import { fieldAria, fieldMessage } from "#/lib/form-field";
import { addGroupMember, createGroup, deleteGroup, removeGroupMember, renameGroup } from "../api";
import { groupsQuery, teamKeys, teamQuery } from "../hooks";
import { GroupNameDetailsSchema, type Group, type TeamMember } from "../schemas";
import { TeamConfirmDialog } from "./team-confirm-dialog";

const failure = (what: string) => (error: Error) => toast.error(`We couldn't ${what}. ${error.message}`);

const plural = (count: number) => `${count} ${count === 1 ? "person" : "people"}`;

function useRefresh() {
  const queryClient = useQueryClient();
  return () => Promise.all([teamKeys.groups(), teamKeys.members()].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

type NameFormProps = { id: string; label: string; initial: string; pending: boolean; submitLabel: string; onSave: (name: string) => void; onCancel?: () => void; compact?: boolean };

function NameForm({ id, label, initial, pending, submitLabel, onSave, onCancel, compact }: NameFormProps) {
  const form = useForm({
    defaultValues: { name: initial },
    validators: { onSubmit: GroupNameDetailsSchema },
    onSubmit: ({ value }) => onSave(value.name.trim()),
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
      className={compact ? "grid gap-1" : "flex min-h-0 flex-1 flex-col"}
    >
      <form.Field name="name">
        {(field) => {
          const input = (
            <>
              <Label htmlFor={id} className={compact ? "sr-only" : undefined}>
                {label}
              </Label>
              <Input
                id={id}
                name={field.name}
                autoComplete="off"
                maxLength={GROUP_NAME_MAX}
                placeholder={compact ? undefined : "Security reviewers"}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                className={compact ? "h-8 w-48" : undefined}
                {...fieldAria(field, id, `${id}-help`)}
              />
            </>
          );
          if (compact) {
            return (
              <>
                <div className="flex items-center gap-2">
                  {input}
                  <Button type="submit" size="sm" disabled={pending}>
                    {pending ? "Saving" : submitLabel}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
                    Cancel
                  </Button>
                </div>
                <FieldError id={id} message={fieldMessage(field)} />
              </>
            );
          }
          return (
            <>
              <DialogBody className="grid gap-2">
                {input}
                {fieldMessage(field) ? (
                  <FieldError id={id} message={fieldMessage(field)} />
                ) : (
                  <p id={`${id}-help`} className="text-xs text-muted-foreground">
                    Short and specific, like the team or the job. You can rename it later. {field.state.value.length} of {GROUP_NAME_MAX}.
                  </p>
                )}
              </DialogBody>
              <DialogFooter>
                <Button type="submit" disabled={pending}>
                  {pending ? "Creating" : submitLabel}
                </Button>
              </DialogFooter>
            </>
          );
        }}
      </form.Field>
    </form>
  );
}

function NewGroupDialog() {
  const [open, setOpen] = useState(false);
  const refresh = useRefresh();
  const create = useMutation({
    mutationFn: (input: { name: string }) => createGroup({ data: input }),
    onSuccess: async () => {
      setOpen(false);
      await refresh();
    },
    onError: failure("create the group"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Plus className="size-3.5" />
        New group
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New group</DialogTitle>
          <DialogDescription>A group sorts people into a team. It grants nothing: what a person can do comes from their role.</DialogDescription>
        </DialogHeader>
        <NameForm id="group-name" label="What should the group be called?" initial="" pending={create.isPending} submitLabel="Create group" onSave={(name) => create.mutate({ name })} />
      </DialogContent>
    </Dialog>
  );
}

function GroupNameCell({ group }: { group: Group }) {
  const refresh = useRefresh();
  const [renaming, setRenaming] = useState(false);
  const rename = useMutation({
    mutationFn: (name: string) => renameGroup({ data: { groupId: group.id, name } }),
    onSuccess: async () => {
      setRenaming(false);
      await refresh();
    },
    onError: failure("rename the group"),
  });

  if (renaming) return <NameForm compact id={`rename-${group.id}`} label={`New name for ${group.name}`} initial={group.name} pending={rename.isPending} submitLabel="Save" onSave={(name) => rename.mutate(name)} onCancel={() => setRenaming(false)} />;

  return (
    <span className="flex items-center gap-2">
      <span className="font-medium">{group.name}</span>
      <button
        type="button"
        aria-label={`Rename the group ${group.name}`}
        onClick={() => setRenaming(true)}
        className="grid size-6 place-items-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Pencil aria-hidden="true" className="size-3.5" />
      </button>
    </span>
  );
}

function GroupPeopleCell({ group, members }: { group: Group; members: readonly TeamMember[] }) {
  const refresh = useRefresh();
  const add = useMutation({ mutationFn: (partyId: string) => addGroupMember({ data: { groupId: group.id, partyId } }), onSuccess: refresh, onError: failure("add that person") });
  const remove = useMutation({ mutationFn: (partyId: string) => removeGroupMember({ data: { groupId: group.id, partyId } }), onSuccess: refresh, onError: failure("remove that person") });
  const inGroup = members.filter((m) => group.memberIds.includes(m.partyId));
  const candidates = members.filter((m) => !group.memberIds.includes(m.partyId));

  return (
    <span className="flex flex-wrap items-center gap-2">
      {inGroup.map((m) => (
        <Badge key={m.partyId} variant="secondary" className="gap-1">
          {m.name}
          <button
            type="button"
            aria-label={`Remove ${m.name} from ${group.name}`}
            disabled={remove.isPending}
            onClick={() => remove.mutate(m.partyId)}
            className="-mr-1.5 grid size-6 place-items-center rounded-full transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      {inGroup.length === 0 && <span className="text-muted-foreground">No one yet.</span>}
      {candidates.length > 0 && (
        <Select value="" disabled={add.isPending} items={candidates.map((m) => ({ value: m.partyId, label: m.name }))} onValueChange={(next) => next && add.mutate(next)}>
          <SelectTrigger aria-label={`Add a person to ${group.name}`} className="h-8 w-36">
            <SelectValue placeholder={add.isPending ? "Adding" : "Add a person"} />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((m) => (
              <SelectItem key={m.partyId} value={m.partyId}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </span>
  );
}

function GroupDeleteCell({ group }: { group: Group }) {
  const refresh = useRefresh();
  const drop = useMutation({ mutationFn: () => deleteGroup({ data: { groupId: group.id } }), onSuccess: refresh, onError: failure("delete the group") });

  return (
    <TeamConfirmDialog
      triggerLabel="Delete"
      triggerAriaLabel={`Delete the group ${group.name}`}
      title={`Delete ${group.name}?`}
      description="The people in it stay on the team. They only lose this group."
      confirmLabel="Delete group"
      pending={drop.isPending}
      onConfirm={async () => {
        await drop.mutateAsync();
      }}
    />
  );
}

type GroupRow = { group: Group; members: readonly TeamMember[] };

const column = dataTableColumns<GroupRow>();

const columns = column.columns([
  column.display({ id: "name", header: "Group", meta: { head: "w-64" }, cell: ({ row }) => <GroupNameCell group={row.original.group} /> }),
  column.display({ id: "count", header: "Size", meta: { head: "w-32" }, cell: ({ row }) => <span className="whitespace-nowrap tabular-nums text-muted-foreground">{plural(row.original.group.memberIds.length)}</span> }),
  column.display({ id: "people", header: "People", cell: ({ row }) => <GroupPeopleCell group={row.original.group} members={row.original.members} /> }),
  column.display({ id: "actions", header: () => <span className="sr-only">Actions</span>, meta: { head: "w-24", cell: "text-right" }, cell: ({ row }) => <GroupDeleteCell group={row.original.group} /> }),
]);

export function GroupsTable() {
  const [{ data: groups }, { data: team }] = useSuspenseQueries({ queries: [groupsQuery(), teamQuery()] });
  const rows: GroupRow[] = groups.map((group) => ({ group, members: team.members }));
  const table = useTable({ features: dataTableFeatures, columns, data: rows, getRowId: (row) => row.group.id });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div className="grid gap-1.5">
          <CardTitle>All groups</CardTitle>
          <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">Sort people into teams, such as Backend or Security. A person can be in several.</p>
        </div>
        <NewGroupDialog />
      </CardHeader>
      <CardContent className="overflow-hidden p-0">
        {groups.length === 0 ? (
          <Empty className="py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Layers />
              </EmptyMedia>
              <EmptyTitle>No groups yet</EmptyTitle>
              <EmptyDescription>Create a group, then add people to it.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <NewGroupDialog />
            </EmptyContent>
          </Empty>
        ) : (
          <DataTable table={table} />
        )}
      </CardContent>
    </Card>
  );
}
