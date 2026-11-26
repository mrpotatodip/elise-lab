import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog";
import { FieldError } from "#/components/ui/field-error";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { fieldAria, fieldMessage } from "#/lib/form-field";
import {
  createProject,
  deleteProject,
  moveRepoToProject,
  PROJECT_NAME_MAX,
  ProjectNameDetailsSchema,
  projectKeys,
  renameProject,
  type Project,
} from "#/modules/project";
import { repoKeys } from "../hooks";

const failure = (what: string) => (error: Error) => toast.error(`We couldn't ${what}. ${error.message}`);

export function useProjectRefresh() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([projectKeys.all, repoKeys.all].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

type NameFormProps = {
  id: string;
  initial: string;
  pending: boolean;
  submitLabel: string;
  onSave: (name: string) => void;
};

function NameForm({ id, initial, pending, submitLabel, onSave }: NameFormProps) {
  const form = useForm({
    defaultValues: { name: initial },
    validators: { onSubmit: ProjectNameDetailsSchema },
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
      className="flex min-h-0 flex-1 flex-col"
    >
      <form.Field name="name">
        {(field) => (
          <DialogBody className="grid gap-2">
            <Label htmlFor={id}>Name</Label>
            <Input
              id={id}
              name={field.name}
              autoComplete="off"
              maxLength={PROJECT_NAME_MAX}
              placeholder="Payments"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              {...fieldAria(field, id, `${id}-help`)}
            />
            {fieldMessage(field) ? (
              <FieldError id={id} message={fieldMessage(field)} />
            ) : (
              <p id={`${id}-help`} className="text-xs text-muted-foreground">
                The product these repositories belong to. {field.state.value.length} of {PROJECT_NAME_MAX}.
              </p>
            )}
          </DialogBody>
        )}
      </form.Field>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function NewProjectDialog() {
  const [open, setOpen] = useState(false);
  const refresh = useProjectRefresh();
  const create = useMutation({
    mutationFn: (name: string) => createProject({ data: { name } }),
    onSuccess: async () => {
      setOpen(false);
      await refresh();
    },
    onError: failure("create the project"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Plus className="size-3.5" />
        New project
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            A project keeps repositories together so you can review them together. It scans nothing and grants nothing.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <NameForm
            id="project-name"
            initial=""
            pending={create.isPending}
            submitLabel="Create project"
            onSave={(name) => create.mutate(name)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function RenameProjectDialog({ project }: { project: Project }) {
  const [open, setOpen] = useState(false);
  const refresh = useProjectRefresh();
  const rename = useMutation({
    mutationFn: (name: string) => renameProject({ data: { projectId: project.id, name } }),
    onSuccess: async () => {
      setOpen(false);
      await refresh();
    },
    onError: failure("rename the project"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={`Rename the project ${project.name}`} />}
      >
        <Pencil aria-hidden="true" className="size-3.5" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename project</DialogTitle>
          <DialogDescription>Its repositories stay where they are.</DialogDescription>
        </DialogHeader>
        {open && (
          <NameForm
            id={`project-rename-${project.id}`}
            initial={project.name}
            pending={rename.isPending}
            submitLabel="Save"
            onSave={(name) => rename.mutate(name)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function DeleteProjectDialog({ project }: { project: Project }) {
  const [open, setOpen] = useState(false);
  const refresh = useProjectRefresh();
  const drop = useMutation({
    mutationFn: () => deleteProject({ data: { projectId: project.id } }),
    onSuccess: async () => {
      setOpen(false);
      await refresh();
    },
    onError: failure("delete the project"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Delete the project ${project.name}`}
            className="text-status-danger hover:text-status-danger"
          />
        }
      >
        Delete
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {project.name}?</DialogTitle>
          <DialogDescription>
            Its repositories are not deleted. They move to Ungrouped, with every scan they have had.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Keep it</DialogClose>
          <Button variant="destructive" disabled={drop.isPending} onClick={() => drop.mutate()}>
            {drop.isPending ? "Working" : "Delete project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const NONE = "none";

type ProjectPickerProps = {
  id: string;
  projects: readonly Project[];
  value: string | null;
  onChange: (projectId: string | null) => void;
  disabled?: boolean;
};

export function ProjectPicker({ id, projects, value, onChange, disabled }: ProjectPickerProps) {
  const items = [
    { value: NONE, label: "No project" },
    ...projects.map((project) => ({ value: project.id, label: project.name })),
  ];
  return (
    <Select
      value={value ?? NONE}
      items={items}
      disabled={disabled}
      onValueChange={(next) => onChange(next === NONE || next === null ? null : next)}
    >
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type MoveRepoDialogProps = { repoId: string; repoLabel: string; current: string | null; projects: readonly Project[] };

export function MoveRepoDialog({ repoId, repoLabel, current, projects }: MoveRepoDialogProps) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(current);
  const refresh = useProjectRefresh();
  const move = useMutation({
    mutationFn: (projectId: string | null) => moveRepoToProject({ data: { repoId, projectId } }),
    onSuccess: async () => {
      setOpen(false);
      await refresh();
    },
    onError: failure("move the repository"),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setPicked(current);
        setOpen(next);
      }}
    >
      <DialogTrigger render={<Button variant="ghost" size="sm" aria-label={`Move ${repoLabel} to a project`} />}>
        Move to project…
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move {repoLabel}</DialogTitle>
          <DialogDescription>
            A repository is in one project at most. Pick no project to take it out of its project.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-2">
          <Label htmlFor={`move-${repoId}`}>Project</Label>
          <ProjectPicker id={`move-${repoId}`} projects={projects} value={picked} onChange={setPicked} />
        </DialogBody>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button disabled={move.isPending || picked === current} onClick={() => move.mutate(picked)}>
            {move.isPending ? "Moving…" : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
