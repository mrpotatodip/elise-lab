import { hasAccessPower } from "@repo/contracts/elise";

export const canRemoveRepos = (powers: readonly string[]) => hasAccessPower(powers, "company:repos:delete");

export function repoRemoveCopy(name: string, isArchive: boolean) {
  const description = "It leaves your list and your overview counts. Its Scans stay and adding it again brings them back.";
  return { title: `Remove ${name}?`, description: isArchive ? `${description} Its zips are deleted for good.` : description };
}
