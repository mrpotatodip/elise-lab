import { Suspense } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { DeviceApproval, DeviceUnusable, deviceLoginQuery } from "#/modules/device";

const SearchSchema = z.object({ code: z.string().optional() });

export const Route = createFileRoute("/device")({
  head: () => ({ meta: [{ title: "Connect a Runner · Elise" }] }),
  validateSearch: SearchSchema,
  beforeLoad: ({ context, search }) => {
    if (context.user?.twoFactorSetupRequired) throw redirect({ to: "/two-factor-setup" });
    if (context.user) return;
    const back = search.code ? `/device?code=${encodeURIComponent(search.code)}` : "/device";
    throw redirect({ to: "/signin", search: { redirect: back } });
  },
  loaderDeps: ({ search }) => ({ code: search.code }),
  loader: async ({ context, deps }) => {
    if (deps.code) await context.queryClient.query({ ...deviceLoginQuery(deps.code), staleTime: "static" });
  },
  errorComponent: DeviceUnusable,
  component: DevicePage,
});

function DevicePage() {
  const { code } = Route.useSearch();
  if (!code) return <DeviceUnusable />;
  return (
    <Suspense fallback={null}>
      <DeviceApproval code={code} />
    </Suspense>
  );
}
