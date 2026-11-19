import { describe, expect, it } from "vitest";
import { repoSiteName } from "#/lib/repo-site-name";

describe("repoSiteName", () => {
  it.each([
    ["a GitHub repository", "https://github.com/acme/app", "GitHub"],
    ["a gitlab.com repository", "https://gitlab.com/elise3313247/elisetest", "GitLab"],
    ["a nested gitlab.com path", "https://gitlab.com/acme/team/app.git", "GitLab"],
    ["a company GitLab server", "https://Git.Example.com/team/app", "git.example.com"],
    ["an address with no host", "not a link", "the code host"],
  ])("names the site of %s", (_, url, name) => {
    expect(repoSiteName(url)).toBe(name);
  });
});
