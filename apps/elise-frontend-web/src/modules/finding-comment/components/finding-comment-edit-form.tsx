import { useForm } from "@tanstack/react-form";
import { FINDING_COMMENT_BODY_MAX } from "@repo/contracts/elise";
import { Button } from "#/components/ui/button";
import { FieldError } from "#/components/ui/field-error";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { fieldAria, fieldMessage } from "#/lib/form-field";
import { FindingCommentDraftSchema } from "../schemas";

type FindingCommentEditFormProps = {
  commentId: string;
  initialBody: string;
  pending: boolean;
  onSave: (body: string) => Promise<boolean>;
  onCancel: () => void;
};

// -----
// The text of one comment in a box, with Save and Cancel. The id
// carries the comment id so two forms never share a label.
// -----
export function FindingCommentEditForm({ commentId, initialBody, pending, onSave, onCancel }: FindingCommentEditFormProps) {
  const inputId = `finding-comment-edit-${commentId}`;
  const form = useForm({
    defaultValues: { body: initialBody },
    validators: { onSubmit: FindingCommentDraftSchema },
    onSubmit: async ({ value }) => {
      if (await onSave(value.body.trim())) onCancel();
    },
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
      className="grid gap-2"
    >
      <form.Field name="body">
        {(field) => (
          <div className="grid gap-2">
            <Label htmlFor={inputId} className="sr-only">
              Edit your comment
            </Label>
            <Textarea
              id={inputId}
              name={field.name}
              rows={3}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              {...fieldAria(field, inputId, `${inputId}-help`)}
            />
            {fieldMessage(field) ? (
              <FieldError id={inputId} message={fieldMessage(field)} />
            ) : (
              <p id={`${inputId}-help`} className="text-xs text-muted-foreground tabular-nums">
                {field.state.value.length} / {FINDING_COMMENT_BODY_MAX}
              </p>
            )}
          </div>
        )}
      </form.Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving" : "Save"}
        </Button>
      </div>
    </form>
  );
}
