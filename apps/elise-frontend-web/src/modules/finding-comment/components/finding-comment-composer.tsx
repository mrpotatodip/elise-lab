import { useForm } from "@tanstack/react-form";
import { FINDING_COMMENT_BODY_MAX } from "@repo/contracts/elise";
import { Button } from "#/components/ui/button";
import { FieldError } from "#/components/ui/field-error";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { fieldAria, fieldMessage } from "#/lib/form-field";
import { FindingCommentDraftSchema } from "../schemas";

type FindingCommentComposerProps = {
  pending: boolean;
  onPost: (body: string) => Promise<boolean>;
};

export function FindingCommentComposer({ pending, onPost }: FindingCommentComposerProps) {
  const form = useForm({
    defaultValues: { body: "" },
    validators: { onSubmit: FindingCommentDraftSchema },
    onSubmit: async ({ value, formApi }) => {
      if (await onPost(value.body.trim())) formApi.reset();
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
            <Label htmlFor="finding-comment-body" className="sr-only">
              Write a comment
            </Label>
            <Textarea
              id="finding-comment-body"
              name={field.name}
              rows={3}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder="Add a comment for your team. Plain text; https links open."
              {...fieldAria(field, "finding-comment-body", "finding-comment-help")}
            />
            {fieldMessage(field) ? (
              <FieldError id="finding-comment-body" message={fieldMessage(field)} />
            ) : (
              <p id="finding-comment-help" className="text-xs text-muted-foreground tabular-nums">
                {field.state.value.length} / {FINDING_COMMENT_BODY_MAX}. Everyone on the account can read this. It stays here and never goes to GitHub.
              </p>
            )}
          </div>
        )}
      </form.Field>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Posting" : "Comment"}
        </Button>
      </div>
    </form>
  );
}
