// Measure many routes in one evaluate_script call.
//   node .claude/skills/chrome-review/measure-routes.mjs [--port 3100] /overview /scans /repos
// It first checks that the dev server runs from THIS checkout, then writes .review/measure-routes.js.
// Pass that file as `sourcePath` of evaluate_script on a signed-in tab of the app. The result has one
// entry per route: where it ended up (redirects show), what breaks the rules, and the first links
// to /repos/, /scans/ and /summary/ pages, for the next run's dynamic routes.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const portAt = args.indexOf("--port");
const port = portAt >= 0 ? args.splice(portAt, 2)[1] : "3100";
const routes = args;
if (routes.length === 0) {
  console.error("Pass at least one route, for example /overview");
  process.exit(2);
}

// The app under review is the one in the current directory's checkout.
const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const pid = execFileSync("lsof", ["-ti", `tcp:${port}`], { encoding: "utf8" }).split("\n")[0];
if (!pid) {
  console.error(`Nothing listens on port ${port}. Start the dev server from ${root}.`);
  process.exit(1);
}
const cwdLine = execFileSync("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"], { encoding: "utf8" }).split("\n").find((line) => line.startsWith("n"));
const serverCwd = cwdLine ? cwdLine.slice(1) : "";
// A worktree lives under .claude/worktrees inside the main checkout, so compare checkout roots, not path prefixes.
const serverRoot = execFileSync("git", ["-C", resolve(serverCwd), "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
if (serverRoot !== root) {
  console.error(`The server on port ${port} runs from ${serverCwd}, not from ${root}. Its pages are not this checkout's. Run \`pnpm dev:stop\`, then start it here.`);
  process.exit(1);
}

const measureSource = readFileSync(join(here, "measure.js"), "utf8");
const script = `async () => {
  const MEASURE = ${JSON.stringify(measureSource)};
  const routes = ${JSON.stringify(routes)};
  const settle = (ms) => new Promise((done) => setTimeout(done, ms));
  const out = [];
  for (const route of routes) {
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;left:0;top:0;width:1280px;height:800px;opacity:0;pointer-events:none";
    document.body.append(frame);
    await new Promise((done) => { frame.onload = done; frame.src = route; });
    await settle(1500);
    const win = frame.contentWindow;
    const m = await win.eval("(" + MEASURE + ")()");
    const links = [...new Set([...win.document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => /^\\/(repos|scans|summary)\\/[^/]+/.test(h)))].slice(0, 3);
    out.push({
      route,
      endedAt: win.location.pathname,
      theme: m.theme,
      contrastBelow4_5: m.contrastBelow4_5,
      targetsUnder24px: m.targetsUnder24px,
      paragraphsOffRule: m.paragraphs.filter((p) => p.charsPerLine > 65 || p.lineHeight < 1.5 || (parseFloat(p.size) < 14 && p.lineHeight < 1.5)),
      overflowsHorizontally: m.overflowsHorizontally,
      textOnGlass: m.needsEyes.textOnGlass,
      links,
    });
    frame.remove();
  }
  return out;
}`;

const target = join(root, "apps", "elise-frontend-web", ".review", "measure-routes.js");
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, script);
console.log(`Server runs from this checkout (${serverCwd}).\nWrote ${target}\nCall evaluate_script with sourcePath set to it.`);
