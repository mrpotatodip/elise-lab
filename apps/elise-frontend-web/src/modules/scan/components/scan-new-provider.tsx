import { Segmented } from "#/components/ui/segmented";
import { SOURCE_PROVIDER_LIST } from "#/providers/registry";
import type { SourceProviderValue } from "../schemas";

type ScanNewProviderProps = {
  value: SourceProviderValue;
  onChange: (next: SourceProviderValue) => void;
};

// -----
// The first choice of a new scan: where the code lives
// (ADR 0008). The list is the registry's, in the contracts'
// order. A provider whose flow is not built yet is shown
// and cannot be chosen.
// -----
export function ScanNewProvider({ value, onChange }: ScanNewProviderProps) {
  const later = SOURCE_PROVIDER_LIST.filter((provider) => !provider.available);
  return (
    <div className="grid gap-1.5">
      <Segmented
        label="Where does the code live?"
        value={value}
        options={SOURCE_PROVIDER_LIST.map((provider) => ({
          value: provider.id,
          label: provider.label,
          disabled: !provider.available,
        }))}
        onChange={onChange}
        className="w-full"
      />
      {later.length > 0 && (
        <p className="px-1 text-xs text-muted-foreground">
          {later.map((provider) => provider.label).join(", ")}: coming soon.
        </p>
      )}
    </div>
  );
}
