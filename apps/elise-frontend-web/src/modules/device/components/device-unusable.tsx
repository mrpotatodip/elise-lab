import { Link } from "@tanstack/react-router";
import { LinkIcon } from "lucide-react";
import { buttonVariants } from "#/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia } from "#/components/ui/empty";
import { ShellPublicBrand, ShellPublicThemeSwitch } from "#/modules/shell";
import { DEVICE_COPY } from "../constants";

// -----
// An unknown, expired or used code gets one plain page, whatever the
// reason: the engine does not say which, so neither does this.
// -----
export function DeviceUnusable() {
  return (
    <main className="mx-auto grid min-h-svh w-full max-w-md content-center gap-8 p-6">
      <title>{DEVICE_COPY.tabTitle}</title>
      <ShellPublicThemeSwitch />
      <ShellPublicBrand />
      <Empty>
        <EmptyHeader className="gap-1.5">
          <EmptyMedia variant="icon">
            <LinkIcon />
          </EmptyMedia>
          <h1 className="text-xl font-semibold leading-none tracking-tight">{DEVICE_COPY.unusableTitle}</h1>
          <EmptyDescription>{DEVICE_COPY.unusableDescription}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link to="/overview" className={buttonVariants({ variant: "outline" })}>
            {DEVICE_COPY.unusableAction}
          </Link>
        </EmptyContent>
      </Empty>
    </main>
  );
}
