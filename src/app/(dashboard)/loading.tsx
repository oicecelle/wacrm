import { Loader2 } from "lucide-react";

/**
 * Shown by Next.js during route-level navigation inside (dashboard)
 * — e.g. the brief moment when switching between top-level sections.
 * Doesn't cover slow client-side data fetching within a page (each
 * page manages its own loading state for that), just didn't exist at
 * all before this for the route-transition case.
 */
export default function DashboardLoading() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Carregando...</p>
    </div>
  );
}
