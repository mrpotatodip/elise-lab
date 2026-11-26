#!/usr/bin/env node

/**
 * Elise's own script, not part of the upstream skill. The app that runs a Scan on Windows starts the
 * checks with `node --require windows-input-shim.cjs <check>`; the agent never runs it.
 * Node on Windows has no O_NOFOLLOW and no O_NONBLOCK, and the upstream checks refuse every input
 * when either is missing. This gives them both: the first makes the open fail on a symlink or junction,
 * the second is dropped before the open (a plain file never blocks). See ADR 0006.
 */

const fs = require("node:fs");

const NO_FOLLOW = 0x10000000;
const NON_BLOCK = 0x20000000;

if (fs.constants.O_NOFOLLOW === undefined && fs.constants.O_NONBLOCK === undefined) {
  Object.defineProperty(fs.constants, "O_NOFOLLOW", { value: NO_FOLLOW, enumerable: true });
  Object.defineProperty(fs.constants, "O_NONBLOCK", { value: NON_BLOCK, enumerable: true });
  const open = fs.openSync;
  fs.openSync = function openSync(file, flags, mode) {
    if (typeof flags !== "number" || (flags & NO_FOLLOW) === 0) return open.call(fs, file, flags, mode);
    if (fs.lstatSync(file).isSymbolicLink()) {
      throw Object.assign(new Error(`ELOOP: too many symbolic links encountered, open '${file}'`), { code: "ELOOP" });
    }
    return open.call(fs, file, flags & ~(NO_FOLLOW | NON_BLOCK), mode);
  };
}
