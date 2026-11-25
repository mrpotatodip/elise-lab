import { fieldErrorId } from "#/lib/form-field";
import { cn } from "#/lib/utils";

type FieldErrorProps = {
  id: string;
  message: string | undefined;
  className?: string;
};

// -----
// The one error line under a field. `id` is the input's id; the
// input points at this line with `fieldAria`.
// -----
function FieldError({ id, message, className }: FieldErrorProps) {
  if (!message) return null;
  return (
    <p id={fieldErrorId(id)} role="alert" className={cn("text-xs text-status-danger", className)}>
      {message}
    </p>
  );
}

export { FieldError };
