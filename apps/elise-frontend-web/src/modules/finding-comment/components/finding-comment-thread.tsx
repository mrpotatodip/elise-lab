import { useRouteContext } from "@tanstack/react-router";
import { useState } from "react";
import { hasAccessPower } from "@repo/contracts/elise";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { ScanTime } from "#/modules/scan";
import { useFindingCommentActions, useFindingThread } from "../hooks";
import type { FindingComment, FindingThreadEvent } from "../schemas";
import { FindingCommentComposer } from "./finding-comment-composer";
import { FindingCommentEditForm } from "./finding-comment-edit-form";
import { FindingCommentItem } from "./finding-comment-item";
import { FindingDecisionItem } from "./finding-decision-item";

type FindingCommentThreadProps = {
  repo: string;
  fingerprint: string;
};

type EditableCommentProps = {
  event: FindingComment;
  canEdit: boolean;
  editPending: boolean;
  onEdit: (commentId: string, body: string) => Promise<boolean>;
};

function EditableComment({ event, canEdit, editPending, onEdit }: EditableCommentProps) {
  const [editing, setEditing] = useState(false);
  const markers =
    event.editedAt && event.deletedAt === null ? (
      <span className="text-muted-foreground">
        edited <ScanTime value={event.editedAt} />
      </span>
    ) : undefined;
  const actions =
    canEdit && !editing ? (
      <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
        Edit
      </Button>
    ) : undefined;
  const editor =
    editing && event.body !== null ? (
      <FindingCommentEditForm commentId={event.id} initialBody={event.body} pending={editPending} onSave={(body) => onEdit(event.id, body)} onCancel={() => setEditing(false)} />
    ) : undefined;
  return <FindingCommentItem comment={event} markers={markers} actions={actions} editor={editor} />;
}

type ThreadEventProps = Omit<EditableCommentProps, "event" | "canEdit"> & {
  event: FindingThreadEvent;
  viewerPartyId: string | null;
  canWrite: boolean;
};

function ThreadEvent({ event, viewerPartyId, canWrite, editPending, onEdit }: ThreadEventProps) {
  switch (event.kind) {
    case "comment":
      return (
        <EditableComment
          event={event}
          canEdit={canWrite && viewerPartyId !== null && event.authorPartyId === viewerPartyId && event.deletedAt === null}
          editPending={editPending}
          onEdit={onEdit}
        />
      );
    case "decision":
      return <FindingDecisionItem decision={event} />;
  }
}

// -----
// The Discussion section of a finding's detail sheet: the thread,
// oldest first, with the composer under it. A person who can read
// but not write sees the thread and no composer.
// -----
export function FindingCommentThread({ repo, fingerprint }: FindingCommentThreadProps) {
  const { user } = useRouteContext({ from: "/_app" });
  const canComment = hasAccessPower(user?.powers ?? [], "company:findings:comments:create");
  const thread = useFindingThread(repo, fingerprint);
  const { create, edit } = useFindingCommentActions({ repo, fingerprint });
  const editComment = (commentId: string, body: string) => edit.mutateAsync({ commentId, body }).then(() => true, () => false);

  return (
    <section aria-labelledby="finding-discussion-title" className="grid gap-4 border-t pt-6">
      <h3 id="finding-discussion-title" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Discussion
      </h3>
      {thread.isPending && <Skeleton className="h-16 w-full" />}
      {thread.isError && (
        <Alert variant="destructive">
          <AlertDescription>We couldn't load the discussion. {thread.error.message}</AlertDescription>
        </Alert>
      )}
      {thread.data &&
        (thread.data.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No one has commented on this finding yet.</p>
        ) : (
          <ol className="grid gap-5">
            {thread.data.events.map((event) => (
              <ThreadEvent
                key={event.id}
                event={event}
                viewerPartyId={user?.partyId ?? null}
                canWrite={canComment}
                editPending={edit.isPending}
                onEdit={editComment}
              />
            ))}
          </ol>
        ))}
      {canComment ? (
        <FindingCommentComposer pending={create.isPending} onPost={(body) => create.mutateAsync(body).then(() => true, () => false)} />
      ) : (
        <p className="text-sm text-muted-foreground">Your role can read this discussion but not write in it.</p>
      )}
    </section>
  );
}
