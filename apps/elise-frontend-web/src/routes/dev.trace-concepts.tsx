import { createFileRoute, notFound } from "@tanstack/react-router";
import { ScanTraceConcepts } from "#/modules/scan";

export const Route = createFileRoute("/dev/trace-concepts")({
  head: () => ({ meta: [{ title: "Trace concepts · Elise" }] }),
  ssr: false,
  validateSearch: (search: Record<string, string | number | undefined>) => ({ v: Number(search.v) || 1 }),
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: TraceConceptsPage,
});

function TraceConceptsPage() {
  const { v } = Route.useSearch();
  const navigate = Route.useNavigate();
  return <ScanTraceConcepts index={v - 1} onChange={(index) => navigate({ search: { v: index + 1 }, replace: true })} />;
}
