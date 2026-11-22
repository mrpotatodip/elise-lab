import { describe, expect, it } from "vitest";
import { repoName } from "#/modules/repo/utils/repo-name";

describe("repoName", () => {
  it.each([
    ["https://github.com/honojs/hono.git", "honojs/hono"],
    ["https://gitlab.com/acme/platform/api", "acme/platform/api"],
    ["https://git.example.com/team/api", "git.example.com/team/api"],
  ])("names %s by its provider as %s", (url, name) => {
    expect(repoName(url)).toBe(name);
  });
});
