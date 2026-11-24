import { useForm } from "@tanstack/react-form";
import { FINDING_COMMENT_BODY_MAX } from "@repo/contracts/elise";
import { Button } from "#/components/ui/button";
import { FieldError } from "#/components/ui/field-error";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { fieldAria, fieldMessage } from "#/lib/form-field";
import { FindingCommentDraftSchema } from "../schemas";
import { commentCountText } from "../utils";

type FindingCommentComposerProps = {
  onPost: (body: string) => Promise<boolean>;
};

// -----
// Clears at once, because the thread already shows the comment. If the
// post fails, the text comes back so nothing is lost.
// -----
export function FindingCommentComposer({ onPost }: FindingCommentComposerProps) {
  const form = useForm({
    defaultValues: { body: "" },
    validators: { onSubmit: FindingCommentDraftSchema },
    onSubmit: async ({ value, formApi }) => {
      const body = value.body.trim();
      formApi.reset();
      if (!(await onPost(body))) formApi.setFieldValue("body", body);
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
              placeholder="Add a comment. Plain text. Secure web links become clickable."
              {...fieldAria(field, "finding-comment-body", "finding-comment-help")}
            />
            {fieldMessage(field) ? (
              <FieldError id="finding-comment-body" message={fieldMessage(field)} />
            ) : (
              <p id="finding-comment-help" className="text-sm leading-normal text-muted-foreground">
                <span className="tabular-nums">
                  {commentCountText(field.state.value.length, FINDING_COMMENT_BODY_MAX)}.
                </span>{" "}
                Everyone in this account can read it. It stays here and never goes to GitHub. You can edit or delete it
                later. No one is notified.
              </p>
            )}
          </div>
        )}
      </form.Field>
      <div className="flex justify-end">
        <form.Subscribe selector={(state) => state.values.body.trim() === ""}>
          {(empty) => (
            <Button type="submit" size="sm" disabled={empty}>
              Comment
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
}
