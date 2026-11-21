import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";

type CopyCommandProps = {
  command: string;
};

export function CopyCommand({ command }: CopyCommandProps) {
  return (
    <div className="flex w-full items-center gap-2">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded border bg-foreground/5 px-2 py-1.5 text-left font-mono text-xs">{command}</code>
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label={`Copy ${command}`}
        onClick={() => {
          void navigator.clipboard.writeText(command).then(() => toast.success("Command copied."));
        }}
      >
        <Copy className="size-3.5" />
        Copy
      </Button>
    </div>
  );
}
