import { createFileRoute, notFound } from "@tanstack/react-router";
import { ScanTracePreview } from "#/modules/scan";

export const Route = createFileRoute("/dev/trace")({
  head: () => ({ meta: [{ title: "Trace preview · Elise" }] }),
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: ScanTracePreview,
});
