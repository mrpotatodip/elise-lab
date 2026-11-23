import { useAuthDone } from "../hooks";
import { TwoFactorSetup } from "./two-factor-setup";

export function TwoFactorSetupFields() {
  const done = useAuthDone();
  return <TwoFactorSetup onDone={() => void done.onSuccess()} />;
}
