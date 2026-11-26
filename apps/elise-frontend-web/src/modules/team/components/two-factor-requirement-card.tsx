import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Skeleton } from "#/components/ui/skeleton";
import { setTwoFactorRequirement } from "../api";
import { twoFactorRequirementQuery } from "../hooks";

export function TwoFactorRequirementCard() {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery(twoFactorRequirementQuery());
  const update = useMutation({
    mutationFn: (required: boolean) => setTwoFactorRequirement({ data: { required } }),
    onSuccess: async (next) => {
      toast.success(
        next.required
          ? "Everyone on this account now needs Two-factor."
          : "Two-factor is optional again for people who are not admins.",
      );
      await queryClient.invalidateQueries({ queryKey: twoFactorRequirementQuery().queryKey });
    },
    onError: (error) => toast.error(`We couldn't change the requirement. ${error.message}`),
  });
  const required = data?.required ?? false;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Require Two-factor for everyone</CardTitle>
        <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">
          Admins always need Two-factor. Turn this on and every member of this account must set it up too, and cannot
          turn it off.
        </p>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        {isPending ? (
          <Skeleton className="h-8 w-40" />
        ) : (
          <>
            <p className="text-sm">{required ? "On for everyone." : "Off: only admins need it."}</p>
            <Button
              variant={required ? "outline" : "default"}
              disabled={update.isPending}
              onClick={() => update.mutate(!required)}
            >
              {update.isPending ? "Please wait…" : required ? "Stop requiring it" : "Require it for everyone"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
