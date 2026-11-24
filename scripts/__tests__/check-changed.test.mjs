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

const makeFixture = (projects) => {
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
      JSON.stringify({ name: dir.replace("/", "-"), scripts: { check } }),
    );
  }
  spawnSync("git", ["init", "-q"], { cwd: root });
  spawnSync("git", ["add", "apps", "packages"], { cwd: root });
  return root;
};

const run = (root, { ci }) => {
  const env = { ...process.env };
  delete env.CI;
  if (ci) env.CI = "true";
  const result = spawnSync("node", ["scripts/check-changed.mjs"], { cwd: root, env, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};

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

  it("runs slow projects at the same time", () => {
    const slow = 'node -e "setTimeout(()=>{},1500)"';
    const root = makeFixture({ "apps/s1": slow, "packages/s2": slow });
    const begun = Date.now();
    const { status } = run(root, { ci: false });
    assert.equal(status, 0);
    assert.ok(Date.now() - begun < 2900, "two 1.5s projects ran one after the other");
  });
});
