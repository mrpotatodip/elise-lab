import { Suspense } from "react";
import { SignalsSwitchCard } from "#/modules/signal";
import { ShellPageHeader } from "#/modules/shell";

export function SettingsSignalsPage() {
  return (
    <>
      <ShellPageHeader title="Signals" description="Hints from an outside model about Findings and decisions." />
      <Suspense fallback={null}>
        <SignalsSwitchCard />
      </Suspense>
    </>
  );
}
