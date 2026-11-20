import { describe, expect, it } from "vitest";
import type { KnownRepo } from "#/modules/scan/utils/scan-known-repos";
import { scanRepoLinkPick, scanRepoPickMatches, scanRepoPicks } from "#/modules/scan/utils/scan-repo-picks";

const known = (over: Partial<KnownRepo>): KnownRepo => ({ provider: "github", repoId: "r1", url: "https://github.com/acme/api", label: "acme/api", last: "succeeded", running: false, isPrivate: false, ...over });

describe("scanRepoPicks", () => {
  it("lists a scanned public repository once, with its engine branches", () => {
    const picks = scanRepoPicks([known({})]);
    expect(picks).toHaveLength(1);
    expect(picks[0]).toMatchObject({ repoId: "r1", isPrivate: false, note: "Last scan succeeded" });
  });

  it("says a repository with a queued or running scan is running", () => {
    expect(scanRepoPicks([known({ running: true })])[0]).toMatchObject({ running: true, note: "A scan is running now" });
  });

  it("lists only the chosen provider's repositories", () => {
    const repos = [known({}), known({ provider: "gitlab", repoId: "r2", url: "https://gitlab.com/acme/platform/api", label: "acme/platform/api" })];
    expect(scanRepoPicks(repos, "gitlab").map((item) => [item.provider, item.label])).toEqual([["gitlab", "acme/platform/api"]]);
    expect(scanRepoPicks(repos, "github").map((item) => item.label)).toEqual(["acme/api"]);
  });
});

describe("scanRepoLinkPick", () => {
  it.each([
    ["https://github.com/honojs/hono", "https://github.com/honojs/hono"],
    ["github.com/honojs/hono/", "https://github.com/honojs/hono"],
    ["  http://www.github.com/honojs/hono.git ", "https://github.com/honojs/hono"],
  ])("reads %s as a public repository", (text, url) => {
    expect(scanRepoLinkPick(text)).toMatchObject({ url, label: "honojs/hono", isPrivate: false, fromLink: true });
  });

  it.each(["honojs", "https://gitlab.com/a/b", "https://github.com/a/b/tree/main", ""])("does not read %j as a repository", (text) => {
    expect(scanRepoLinkPick(text)).toBeNull();
  });

  it.each([
    ["gitlab", "https://gitlab.com/acme/platform/api", "https://gitlab.com/acme/platform/api", "acme/platform/api"],
    ["gitlab", "gitlab.com/acme/platform/api.git", "https://gitlab.com/acme/platform/api", "acme/platform/api"],
    ["gitlab", "https://gitlab.com/acme/api/-/tree/main", "https://gitlab.com/acme/api", "acme/api"],
    ["gitlab-sh", "https://Git.Example.com/team/api/-/tree/dev", "https://git.example.com/team/api", "git.example.com/team/api"],
  ] as const)("reads a %s link %s as that provider's repository", (provider, text, url, label) => {
    expect(scanRepoLinkPick(text, provider)).toMatchObject({ provider, url, label, isPrivate: false, fromLink: true });
  });

  it.each([
    ["gitlab", "https://github.com/acme/api"],
    ["gitlab", "https://git.example.com/acme/api"],
    ["gitlab-sh", "https://gitlab.com/acme/api"],
    ["gitlab-sh", "ssh://git.example.com/acme/api"],
    ["upload", "https://gitlab.com/acme/api"],
  ] as const)("does not read a link under %s when it belongs elsewhere: %s", (provider, text) => {
    expect(scanRepoLinkPick(text, provider)).toBeNull();
  });
});

describe("scanRepoPickMatches", () => {
  const picks = scanRepoPicks([known({}), known({ repoId: "r2", url: "https://github.com/honojs/hono", label: "honojs/hono" })]);

  it("filters by name, ignoring case", () => {
    expect(scanRepoPickMatches(picks, "HONO").map((item) => item.label)).toEqual(["honojs/hono"]);
  });

  it("offers a pasted link first when the account does not have that repository", () => {
    const matches = scanRepoPickMatches(picks, "https://github.com/colinhacks/zod");
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ label: "colinhacks/zod", fromLink: true });
  });

  it("answers a pasted link to a repository the account has with that repository, not a duplicate", () => {
    const matches = scanRepoPickMatches(picks, "https://github.com/HonoJS/hono");
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ repoId: "r2", fromLink: false });
  });
});
