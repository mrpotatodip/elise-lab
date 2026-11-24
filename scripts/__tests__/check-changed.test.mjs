import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const scriptsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STUBS = {
  "check-contract-copies": "findContractCopies",
  "check-ratchets": "findRatchetBreaks",
  "check-adr": "findAdrProblems",
};
const fixtures = [];

const makeFixture = (projects, dependencies = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "check-changed-"));
  fixtures.push(root);
  fs.mkdirSync(path.join(root, "scripts"));
  fs.copyFileSync(path.join(scriptsDir, "check-changed.mjs"), path.join(root, "scripts/check-changed.mjs"));
  for (const [file, exportName] of Object.entries(STUBS)) {
    fs.writeFileSync(path.join(root, `scripts/${file}.mjs`), `export const ${exportName} = () => [];\n`);
  }
  for (const [dir, check] of Object.entries(projects)) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.writeFileSync(
      path.join(root, dir, "package.json"),
      JSON.stringify({
        name: dir.replace("/", "-"),
        scripts: { check },
        dependencies: Object.fromEntries((dependencies[dir] ?? []).map((d) => [d.replace("/", "-"), "workspace:*"])),
      }),
    );
  }
  spawnSync("git", ["init", "-q"], { cwd: root });
  spawnSync("git", ["add", "apps", "packages"], { cwd: root });
  return root;
};

const run = (root, { ci, args = [] }) => {
  const env = { ...process.env };
  delete env.CI;
  if (ci) env.CI = "true";
  const result = spawnSync("node", ["scripts/check-changed.mjs", ...args], { cwd: root, env, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};

const commitAll = (root, message) => {
  const git = (...args) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: root });
  git("add", "-A");
  git("commit", "-q", "-m", message);
};

const changedRepo = (projects, dependencies, changedFile) => {
  const root = makeFixture(projects, dependencies);
  for (const file of ["pnpm-lock.yaml", "README.md"]) fs.writeFileSync(path.join(root, file), "a\n");
  fs.writeFileSync(path.join(root, "package.json"), "{}\n");
  fs.mkdirSync(path.join(root, "node_modules/.bin"), { recursive: true });
  fs.writeFileSync(path.join(root, "node_modules/.bin/oxfmt"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  fs.writeFileSync(path.join(root, ".gitignore"), "node_modules\n");
  fs.mkdirSync(path.join(root, "docs"));
  fs.mkdirSync(path.join(root, ".github/workflows"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs/guide.md"), "a\n");
  fs.writeFileSync(path.join(root, ".github/workflows/check.yml"), "a\n");
  commitAll(root, "base");
  spawnSync("git", ["branch", "-M", "main"], { cwd: root });
  fs.mkdirSync(path.dirname(path.join(root, changedFile)), { recursive: true });
  fs.appendFileSync(path.join(root, changedFile), "\n");
  commitAll(root, "change");
  return root;
};

const ranProjects = (stdout) =>
  stdout
    .split("\n")
    .filter((l) => /^(apps|packages)\//.test(l))
    .map((l) => l.split(/\s+/)[0]);

after(() => {
  for (const root of fixtures) fs.rmSync(root, { recursive: true, force: true });
});

describe("check-changed", () => {
  const passing = { "apps/one": "node -e 0", "packages/two": "node -e 0" };
  const failing = {
    ...passing,
    "apps/bad": "node -e \"console.error('boom-marker');process.exit(3)\"",
  };

  it("prints a duration line per project and the total in CI", () => {
    const { status, stdout } = run(makeFixture(passing), { ci: true });
    assert.equal(status, 0);
    assert.match(stdout, /apps\/one\s+\d+\.\ds\s+ok/);
    assert.match(stdout, /packages\/two\s+\d+\.\ds\s+ok/);
    assert.match(stdout, /total\s+\d+\.\ds/);
    assert.match(stdout, /check ok \(2 projects\)/);
  });

  it("prints only the success line outside CI", () => {
    const { status, stdout } = run(makeFixture(passing), { ci: false });
    assert.equal(status, 0);
    assert.equal(stdout.trim(), "check ok (2 projects)");
  });

  it("a failing project prints its tail and fails the run", () => {
    const { status, stdout, stderr } = run(makeFixture(failing), { ci: false });
    assert.notEqual(status, 0);
    assert.match(stderr, /apps\/bad: check failed/);
    assert.match(stderr, /boom-marker/);
    assert.doesNotMatch(stdout, /check ok/);
  });

  it("marks the failing project in the CI timing lines", () => {
    const { stdout } = run(makeFixture(failing), { ci: true });
    assert.match(stdout, /apps\/bad\s+\d+\.\ds\s+fail/);
    assert.match(stdout, /apps\/one\s+\d+\.\ds\s+ok/);
  });

  it("reports every failure in one run, one timing line per project in stable order", () => {
    const projects = {
      "apps/a": "node -e \"console.error('boom-a');process.exit(1)\"",
      "apps/b": "node -e 0",
      "apps/c": "node -e \"console.error('boom-c');process.exit(2)\"",
      "packages/d": "node -e 0",
    };
    const { status, stdout, stderr } = run(makeFixture(projects), { ci: true });
    assert.notEqual(status, 0);
    assert.match(stderr, /boom-a/);
    assert.match(stderr, /boom-c/);
    const lines = stdout.split("\n").filter((l) => /^(apps|packages)\//.test(l));
    assert.deepEqual(
      lines.map((l) => l.split(/\s+/)[0]),
      ["apps/a", "apps/b", "apps/c", "packages/d"],
    );
  });

  describe("--base", () => {
    const projects = {
      "apps/marketing": "node -e 0",
      "apps/engine": "node -e 0",
      "apps/web": "node -e 0",
      "packages/contracts": "node -e 0",
      "packages/db": "node -e 0",
    };
    const dependencies = {
      "apps/engine": ["packages/contracts", "packages/db"],
      "apps/web": ["packages/contracts"],
      "packages/db": ["packages/contracts"],
    };
    const everything = ["apps/engine", "apps/marketing", "apps/web", "packages/contracts", "packages/db"];

    for (const [name, file, expected] of [
      ["a marketing-only diff skips the other projects", "apps/marketing/src/page.astro", ["apps/marketing"]],
      [
        "a contracts change selects its dependents, transitively",
        "packages/contracts/src/index.ts",
        ["apps/engine", "apps/web", "packages/contracts", "packages/db"],
      ],
      [
        "a change in a leaf package selects only that package and its dependents",
        "packages/db/x.ts",
        ["apps/engine", "packages/db"],
      ],
      ["a lockfile change selects all projects", "pnpm-lock.yaml", everything],
      ["a root package.json change selects all projects", "package.json", everything],
      ["a workflow change selects all projects", ".github/workflows/check.yml", everything],
      ["a scripts change selects all projects", "scripts/other.mjs", everything],
      ["a root tsconfig change selects all projects", "tsconfig.base.json", everything],
      ["a docs-only change selects no project", "docs/guide.md", []],
      ["a root markdown change selects no project", "README.md", []],
    ]) {
      it(name, () => {
        const root = changedRepo(projects, dependencies, file);
        const { status, stdout } = run(root, { ci: true, args: ["--base", "main~1"] });
        assert.equal(status, 0);
        assert.deepEqual(ranProjects(stdout), expected);
      });
    }

    it("an unknown base ref selects all projects", () => {
      const root = changedRepo(projects, dependencies, "docs/guide.md");
      const { status, stdout } = run(root, { ci: true, args: ["--base", "origin/missing"] });
      assert.equal(status, 0);
      assert.deepEqual(ranProjects(stdout), everything);
    });

    it("fails the run when a selected project fails, and ignores a failing project that was not selected", () => {
      const withBad = { ...projects, "apps/engine": 'node -e "process.exit(4)"' };
      const skipped = run(changedRepo(withBad, dependencies, "apps/marketing/x.ts"), {
        ci: false,
        args: ["--base", "main~1"],
      });
      assert.equal(skipped.status, 0);
      const selected = run(changedRepo(withBad, dependencies, "packages/contracts/x.ts"), {
        ci: false,
        args: ["--base", "main~1"],
      });
      assert.notEqual(selected.status, 0);
      assert.match(selected.stderr, /apps\/engine: check failed/);
    });

    it("--all still runs every project whatever the diff", () => {
      const root = changedRepo(projects, dependencies, "docs/guide.md");
      const { stdout } = run(root, { ci: true, args: ["--all"] });
      assert.deepEqual(ranProjects(stdout), everything);
    });
  });

  it("runs slow projects at the same time", () => {
    const slow = 'node -e "setTimeout(()=>{},1500)"';
    const root = makeFixture({ "apps/s1": slow, "packages/s2": slow });
    const begun = Date.now();
    const { status } = run(root, { ci: false });
    assert.equal(status, 0);
    assert.ok(Date.now() - begun < 2900, "two 1.5s projects ran one after the other");
  });
});
