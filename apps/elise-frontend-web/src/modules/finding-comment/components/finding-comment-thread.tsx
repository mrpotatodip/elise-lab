import { useRouteContext } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { hasAccessPower } from "@repo/contracts/elise";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { useFindingCommentActions, useFindingThread } from "../hooks";
import type { FindingComment, FindingThreadEvent } from "../schemas";
import { hasLiveComment, isPendingComment } from "../utils";
import { FindingCommentComposer } from "./finding-comment-composer";
import { FindingCommentDeleteDialog } from "./finding-comment-delete-dialog";
import { FindingCommentEditForm } from "./finding-comment-edit-form";
import { FindingCommentItem } from "./finding-comment-item";
import { FindingCommentSkeleton } from "./finding-comment-skeleton";
import { FindingCommentTime } from "./finding-comment-time";
import { FindingDecisionItem } from "./finding-decision-item";

type FindingCommentThreadProps = {
  repo: string;
  fingerprint: string;
};

type EditableCommentProps = {
  event: FindingComment;
  canEdit: boolean;
  canDelete: boolean;
  editPending: boolean;
  onEdit: (commentId: string, body: string) => Promise<boolean>;
  onDelete: (commentId: string) => void;
};

function EditableComment({ event, canEdit, canDelete, editPending, onEdit, onDelete }: EditableCommentProps) {
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  useEffect(() => {
    if (wasEditing.current && !editing) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);
  const markers =
    event.editedAt && event.deletedAt === null ? (
      <span className="text-muted-foreground">
        edited <FindingCommentTime value={event.editedAt} />
      </span>
    ) : undefined;
  const showEdit = canEdit && !editing;
  const showDelete = canDelete && !editing;
  const actions =
    showEdit || showDelete ? (
      <>
        {showEdit && (
          <Button ref={editButton} type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
        {showDelete && <FindingCommentDeleteDialog onConfirm={() => onDelete(event.id)} />}
      </>
    ) : undefined;
  const editor =
    editing && event.body !== null ? (
      <FindingCommentEditForm commentId={event.id} initialBody={event.body} pending={editPending} onSave={(body) => onEdit(event.id, body)} onCancel={() => setEditing(false)} />
    ) : undefined;
  return <FindingCommentItem comment={event} markers={markers} actions={actions} editor={editor} />;
}

type ThreadEventProps = Omit<EditableCommentProps, "event" | "canEdit" | "canDelete" | "editPending"> & {
  event: FindingThreadEvent;
  viewerPartyId: string | null;
  canWrite: boolean;
  canDelete: (comment: FindingComment) => boolean;
  editingCommentId: string | null;
};

function ThreadEvent({ event, viewerPartyId, canWrite, canDelete, editingCommentId, onEdit, onDelete }: ThreadEventProps) {
  switch (event.kind) {
    case "comment":
      return (
        <EditableComment
          event={event}
          canEdit={canWrite && viewerPartyId !== null && event.authorPartyId === viewerPartyId && event.deletedAt === null && !isPendingComment(event.id)}
          canDelete={event.body !== null && !isPendingComment(event.id) && canDelete(event)}
          editPending={editingCommentId === event.id}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      );
    case "decision":
      return <FindingDecisionItem decision={event} />;
  }
}

// -----
// The body of a finding's discussion sheet: the thread, oldest first,
// with the composer under it. A person who can read but not write sees
// the thread and no composer.
// -----
export function FindingCommentThread({ repo, fingerprint }: FindingCommentThreadProps) {
  const { user } = useRouteContext({ from: "/_app" });
  const canComment = hasAccessPower(user?.powers ?? [], "company:findings:comments:create");
  const canDeleteAny = hasAccessPower(user?.powers ?? [], "company:findings:comments:delete");
  const thread = useFindingThread(repo, fingerprint);
  const { create, edit, remove } = useFindingCommentActions({ repo, fingerprint, viewer: { partyId: user?.partyId ?? null, name: user?.name ?? null } });
  const editComment = (commentId: string, body: string) => edit.mutateAsync({ commentId, body }).then(() => true, () => false);

  return (
    <section aria-label="Comments" className="grid gap-4">
      {thread.isPending && <FindingCommentSkeleton />}
      {thread.isError && (
        <Alert variant="destructive">
          <AlertDescription>We couldn't load the discussion. {thread.error.message}</AlertDescription>
        </Alert>
      )}
      {thread.data &&
        (thread.data.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No one has commented on this finding yet.</p>
        ) : (
          <ol className="grid gap-5 [list-style-type:'']">
            {thread.data.events.map((event) => (
              <ThreadEvent
                key={event.id}
                event={event}
                viewerPartyId={user?.partyId ?? null}
                canWrite={canComment}
                canDelete={(comment) => canDeleteAny || (canComment && comment.authorPartyId !== null && comment.authorPartyId === user?.partyId)}
                editingCommentId={edit.isPending ? edit.variables.commentId : null}
                onEdit={editComment}
                onDelete={(commentId) => remove.mutate(commentId)}
              />
            ))}
          </ol>
        ))}
      {thread.data && thread.data.events.length > 0 && !hasLiveComment(thread.data.events) && <p className="text-sm text-muted-foreground">There are no comments right now.</p>}
      {canComment ? (
        <FindingCommentComposer onPost={(body) => create.mutateAsync(body).then(() => true, () => false)} />
      ) : (
        <p className="text-sm text-muted-foreground">Your role can read this discussion but not write in it.</p>
      )}
    </section>
  );
}
