#!/usr/bin/env node
// The mechanical rules of DESIGN.md "Text and spacing": no text under 14px in the site's own
// styles, and no em dash in the copy. The stageshow pictures redraw the dashboard and are exempt.
import fs from "node:fs";

const MIN_PX = 14;
const toPx = (value, unit) => (unit === "px" ? Number(value) : Number(value) * 16);
const failures = [];

const css = fs.readFileSync("src/styles/global.css", "utf8").split("\n");
css.forEach((line, index) => {
  for (const [, value, unit] of line.matchAll(/font-size:\s*([\d.]+)(px|rem|em)\b/g)) {
    if (toPx(value, unit) < MIN_PX) failures.push(`src/styles/global.css:${index + 1}: font-size ${value}${unit} is under ${MIN_PX}px (DESIGN.md: secondary text is 14px at the smallest).`);
  }
});

for (const file of ["src/constants/site.ts", "src/pages/index.astro"]) {
  fs.readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, index) => {
      if (line.includes("—")) failures.push(`${file}:${index + 1}: em dash in the copy (DESIGN.md: copy follows the unslop skill).`);
    });
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
