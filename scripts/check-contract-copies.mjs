#!/usr/bin/env node
// An app must not define a schema that @repo/contracts already has: two schemas for one
// shape drift without any error (docs/standards/contracts.md 1.5, 3.7). This lists every
// `export const XSchema` in an app whose name is also a contract's, unless the file imports
// the contract's XSchema (it extends it, for example to add OpenAPI docs).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACTS = "packages/contracts/src";
const APPS = ["apps/elise-engine-api/src", "apps/elise-frontend-web/src"];
const EXPORTED_SCHEMA = /^export const (\w+Schema)\b/gm;

const sourceFiles = (dir) =>
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory())
      return entry.name === "__tests__" || entry.name === "node_modules" ? [] : sourceFiles(relative);
    return /\.tsx?$/.test(entry.name) ? [relative] : [];
  });

const exportedSchemas = (text) => [...text.matchAll(EXPORTED_SCHEMA)].map((match) => match[1]);
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

export function findContractCopies() {
  const contractNames = new Set(sourceFiles(CONTRACTS).flatMap((file) => exportedSchemas(read(file))));
  const copies = [];
  for (const file of APPS.flatMap(sourceFiles)) {
    const text = read(file);
    for (const name of exportedSchemas(text)) {
      if (!contractNames.has(name)) continue;
      const importsContract = new RegExp(
        `import\\s*(?:type\\s*)?\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*"@repo/contracts`,
      ).test(text);
      if (!importsContract)
        copies.push(
          `${file}: ${name} is already in @repo/contracts. Import it, or import it as a base and extend it; don't write a second one (Contracts 1.5, 3.7).`,
        );
    }
  }
  return copies;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const copies = findContractCopies();
  if (copies.length) {
    console.error(copies.join("\n"));
    process.exit(1);
  }
  console.log("contract copies: none");
}
