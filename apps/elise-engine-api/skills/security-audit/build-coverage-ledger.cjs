#!/usr/bin/env node

/**
 * Elise's own script, not part of the upstream skill. The app that runs a Scan on a person's
 * computer runs it; the agent never does.
 * Usage:
 *   node build-coverage-ledger.cjs build <short-list.json> <coverage-ledger.json> <quick|standard|deep>
 *   node build-coverage-ledger.cjs merge <coverage-ledger.json> <ledger-updates.json>
 *   node build-coverage-ledger.cjs assign <coverage-ledger.json> <hunter-assignments.json> <group-size> <hunters-at-once>
 * `assign` splits the planned units into even hunter groups. `build` turns the agent's short list into the full coverage ledger (RECONNAISSANCE.md, "Deterministic
 * coverage ledger"). `merge` applies the units a later run changed. Both print errors in the words of
 * the file the agent wrote, and write nothing when there is one. validate-coverage-ledger.cjs checks
 * the result afterwards.
 */

const fs = require("node:fs");
const {
  LIMITS,
  canonicalCoverageId,
  encodeCanonicalRef,
  isSafeAgentId,
  isSafeRelativePath,
  readFileWithinLimit,
} = require("./validate-coverage-ledger.cjs");

const QUICK_SUBSYSTEM = "profile/quick/all-in-scope-subsystems";
const DEFAULT_CLASSES = [
  "Injection",
  "Access control",
  "Resource and file handling",
  "Cryptography and secrets",
  "Business logic",
];
const CLASS_PREFIX = "ATTACK-CLASSES.md#";
const MAX_ERRORS = 20;
const FIXED_FIELDS = ["coverage_id", "canonical_refs", "surface", "boundary", "subsystem", "attack_class", "lifecycle"];
const REF_FIELDS = ["surface", "boundary", "subsystem", "attack_class"];

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isRef = (value) => {
  try {
    encodeCanonicalRef(value);
    return true;
  } catch {
    return false;
  }
};
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sameValue = (a, b) => {
  if (isObject(a) && isObject(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((key) => key in b && sameValue(a[key], b[key]));
  }
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, index) => sameValue(item, b[index]));
  return a === b;
};

function readJson(file, what) {
  let text;
  try {
    text = readFileWithinLimit(file);
  } catch {
    throw new Error(`${what} could not be read as a regular file of at most 5 MiB`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${what} is not valid JSON`);
  }
}

function writeJson(file, value) {
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temp, file);
}

function cleanPath(value) {
  return typeof value === "string" ? value.replace(/\/+$/, "") : value;
}

function stringList(value, location, errors, check) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    errors.push(`${location}: expected an array`);
    return [];
  }
  const kept = [];
  value.forEach((entry, index) => {
    if (!check(entry)) errors.push(`${location}[${index}]: invalid text`);
    else if (kept.includes(entry)) errors.push(`${location}[${index}]: duplicate entry`);
    else kept.push(entry);
  });
  return kept;
}

function readEntries(list, profile) {
  const errors = [];
  const entries = Array.isArray(list) ? list : isObject(list) ? list.entries : undefined;
  if (!Array.isArray(entries) || entries.length === 0) {
    return { errors: ['recon-list.json: expected {"entries": [...]} with at least one entry'], parsed: [] };
  }
  const parsed = entries.map((entry, index) => {
    const base = `entries[${index}]`;
    if (!isObject(entry)) {
      errors.push(`${base}: expected an object`);
      return null;
    }
    for (const field of ["surface", "boundary", "subsystem"]) {
      if (!isRef(entry[field])) errors.push(`${base}.${field}: invalid canonical reference`);
    }
    const paths = Array.isArray(entry.paths) ? entry.paths.map(cleanPath) : entry.paths;
    if (!Array.isArray(paths) || paths.length === 0) {
      errors.push(`${base}.paths: expected a non-empty array of repository-relative paths`);
    } else {
      paths.forEach((path, pathIndex) => {
        if (!isSafeRelativePath(path)) errors.push(`${base}.paths[${pathIndex}]: invalid repository-relative path`);
      });
    }
    const classes = stringList(entry.classes ?? DEFAULT_CLASSES, `${base}.classes`, errors, isRef).map((name) =>
      name.startsWith(CLASS_PREFIX) ? name.slice(CLASS_PREFIX.length) : name,
    );
    if (classes.length === 0) errors.push(`${base}.classes: needs at least one attack class`);
    const companions = stringList(entry.companions, `${base}.companions`, errors, isRef);
    const lifecycles =
      profile === "deep" ? stringList(entry.lifecycles, `${base}.lifecycles`, errors, isRef) : [];
    return { entry, paths, classes, companions, lifecycles };
  });
  return { errors, parsed: parsed.filter((item) => item !== null) };
}

function newUnit(refs, lifecycle, paths, block, companions) {
  const canonical = { ...refs, ...(lifecycle === null ? {} : { lifecycle }) };
  return {
    coverage_id: canonicalCoverageId(canonical),
    canonical_refs: canonical,
    surface: refs.surface,
    boundary: refs.boundary,
    subsystem: refs.subsystem,
    attack_class: refs.attack_class,
    ...(lifecycle === null ? {} : { lifecycle }),
    starting_paths: paths,
    ordinary_attack_class_block: block,
    selected_companion_blocks: companions,
    excluded_blocks: [],
    prior_status: "none",
    attempts: [],
    wave: 1,
    status: "planned",
    agent_id: null,
    reviewed_paths: [],
    local_checks: [],
    result_fingerprints: [],
    unresolved: [],
  };
}

function build(listFile, ledgerFile, profile) {
  if (!["quick", "standard", "deep"].includes(profile)) return [`the profile ${JSON.stringify(profile)} is not quick, standard or deep`];
  let list;
  try {
    list = readJson(listFile, "recon-list.json");
  } catch (error) {
    return [error.message];
  }
  const { errors, parsed } = readEntries(list, profile);
  if (errors.length > 0) return errors.slice(0, MAX_ERRORS).map((error) => `recon-list.json: ${error}`);

  const units = new Map();
  for (const { entry, paths, classes, companions, lifecycles } of parsed) {
    for (const name of classes) {
      for (const lifecycle of lifecycles.length > 0 ? lifecycles : [null]) {
        const refs = {
          surface: entry.surface,
          boundary: entry.boundary,
          subsystem: profile === "quick" ? QUICK_SUBSYSTEM : entry.subsystem,
          attack_class: `${CLASS_PREFIX}${name}`,
        };
        const unit = newUnit(refs, lifecycle, paths, `${CLASS_PREFIX}${name}`, companions);
        const same = units.get(unit.coverage_id);
        if (same === undefined) {
          units.set(unit.coverage_id, unit);
        } else {
          same.starting_paths = [...new Set([...same.starting_paths, ...paths])];
          same.selected_companion_blocks = [...new Set([...same.selected_companion_blocks, ...companions])];
        }
      }
    }
  }
  const ledger = [...units.values()].sort((a, b) => compare(a.coverage_id, b.coverage_id));
  if (ledger.length > LIMITS.units) {
    return [`recon-list.json builds ${ledger.length} coverage units, more than the ${LIMITS.units} a ledger may hold: list fewer entries or classes`];
  }
  const size = Buffer.byteLength(JSON.stringify(ledger, null, 2));
  if (size > LIMITS.inputBytes) {
    return [`recon-list.json builds a ledger of ${size} bytes, more than the ${LIMITS.inputBytes} a ledger may hold: list fewer entries or classes`];
  }
  writeJson(ledgerFile, ledger);
  return [];
}

function ownReviewedPaths(unit) {
  if (!isObject(unit) || !Array.isArray(unit.local_checks)) return;
  if (!unit.local_checks.every((check) => isObject(check) && Array.isArray(check.reviewed_paths))) return;
  const paths = unit.local_checks.flatMap((check) => check.reviewed_paths).filter((path) => typeof path === "string");
  unit.reviewed_paths = [...new Set(paths)];
}

function merge(ledgerFile, updatesFile) {
  let ledger;
  let updates;
  try {
    ledger = readJson(ledgerFile, "coverage-ledger.json");
    updates = readJson(updatesFile, "ledger-updates.json");
  } catch (error) {
    return [error.message];
  }
  if (!Array.isArray(ledger)) return ["coverage-ledger.json: expected a top-level array"];
  if (isObject(updates) && Array.isArray(updates.units)) updates = updates.units;
  if (!Array.isArray(updates)) return ["ledger-updates.json: expected a top-level array of units"];

  const errors = [];
  const byId = new Map(ledger.filter(isObject).map((unit) => [unit.coverage_id, unit]));
  updates.forEach((update, index) => {
    const base = `updates[${index}]`;
    if (!isObject(update)) return errors.push(`${base}: expected an object`);
    const unit = byId.get(update.coverage_id);
    if (unit !== undefined) {
      for (const field of FIXED_FIELDS) {
        if (field !== "coverage_id" && field in update && !sameValue(update[field], unit[field])) {
          errors.push(`${base}.${field}: a run may not change this field of an existing unit`);
        }
      }
      return Object.assign(unit, Object.fromEntries(Object.entries(update).filter(([field]) => !FIXED_FIELDS.includes(field))));
    }
    const refs = update.canonical_refs;
    if (!isObject(refs) || !REF_FIELDS.every((field) => isRef(refs[field]))) {
      return errors.push(`${base}.coverage_id: no unit with this ID is in the ledger, and canonical_refs does not describe a new one`);
    }
    const extra = Object.keys(refs).filter((field) => ![...REF_FIELDS, "lifecycle"].includes(field));
    if (extra.length > 0) return errors.push(`${base}.canonical_refs: unexpected field ${extra.map((field) => JSON.stringify(field)).join(", ")}`);
    if (refs.lifecycle !== undefined && !isRef(refs.lifecycle)) return errors.push(`${base}.canonical_refs.lifecycle: invalid canonical reference`);
    if (!Array.isArray(update.starting_paths)) return errors.push(`${base}.starting_paths: a new unit needs them`);
    let unit_;
    try {
      const { lifecycle, ...base_refs } = refs;
      unit_ = newUnit(base_refs, lifecycle === undefined ? null : lifecycle, update.starting_paths.map(cleanPath), update.ordinary_attack_class_block ?? null, update.selected_companion_blocks ?? []);
    } catch (error) {
      return errors.push(`${base}: cannot build a new unit from this update (${error instanceof Error ? error.message : String(error)})`);
    }
    if (update.coverage_id !== unit_.coverage_id) return errors.push(`${base}.coverage_id: expected canonical ID ${JSON.stringify(unit_.coverage_id)}`);
    const added = { ...unit_, ...Object.fromEntries(Object.entries(update).filter(([field]) => !FIXED_FIELDS.includes(field))) };
    if ("agent_id" in added && added.agent_id !== null && !isSafeAgentId(added.agent_id)) {
      return errors.push(`${base}.agent_id: expected null or a safe agent ID`);
    }
    byId.set(added.coverage_id, added);
    ledger.push(added);
  });
  if (errors.length > 0) return errors.slice(0, MAX_ERRORS).map((error) => `ledger-updates.json: ${error}`);
  for (const update of updates) {
    if (isObject(update)) ownReviewedPaths(byId.get(update.coverage_id));
  }
  writeJson(ledgerFile, ledger.sort((a, b) => compare(String(a.coverage_id), String(b.coverage_id))));
  return [];
}

function groupCount(units, groupSize, atOnce) {
  const wanted = Math.max(1, Math.ceil(units / groupSize));
  const rounded = Math.ceil(wanted / atOnce) * atOnce;
  return rounded <= units && units / rounded >= Math.floor(groupSize / 2) ? rounded : wanted;
}

function assign(ledgerFile, assignmentsFile, groupSizeText, atOnceText) {
  const groupSize = Number(groupSizeText);
  const atOnce = Number(atOnceText);
  if (!Number.isInteger(groupSize) || groupSize < 1 || !Number.isInteger(atOnce) || atOnce < 1) {
    return ["the group size and the number of hunters at once must be whole numbers above 0"];
  }
  let ledger;
  try {
    ledger = readJson(ledgerFile, "coverage-ledger.json");
  } catch (error) {
    return [error.message];
  }
  if (!Array.isArray(ledger)) return ["coverage-ledger.json: expected a top-level array"];
  const planned = ledger
    .filter((unit) => isObject(unit) && unit.status === "planned" && typeof unit.coverage_id === "string")
    .sort((a, b) => compare(String(a.subsystem), String(b.subsystem)) || compare(a.coverage_id, b.coverage_id));
  const count = planned.length === 0 ? 0 : groupCount(planned.length, groupSize, atOnce);
  const groups = [];
  let start = 0;
  for (let index = 0; index < count; index += 1) {
    const size = Math.floor(planned.length / count) + (index < planned.length % count ? 1 : 0);
    const units = planned.slice(start, start + size);
    start += size;
    groups.push({
      group: index + 1,
      subsystems: [...new Set(units.map((unit) => unit.subsystem))],
      coverage_ids: units.map((unit) => unit.coverage_id),
    });
  }
  writeJson(assignmentsFile, { groups });
  return [];
}

function run(args) {
  const [command, first, second, third, fourth] = args;
  let errors;
  if (command === "build" && first && second && third) errors = build(first, second, third);
  else if (command === "merge" && first && second) errors = merge(first, second);
  else if (command === "assign" && first && second && third && fourth) errors = assign(first, second, third, fourth);
  else {
    console.error(
      "Usage: node build-coverage-ledger.cjs build <list> <ledger> <profile> | merge <ledger> <updates> | assign <ledger> <assignments> <group-size> <hunters-at-once>",
    );
    return 1;
  }
  for (const message of errors) console.error("ERROR:", message);
  if (errors.length > 0) {
    console.error(`FAIL: ${errors.length} error(s)`);
    return 1;
  }
  console.log(
    command === "build" ? "BUILT: coverage ledger written" : command === "merge" ? "MERGED: ledger updates applied" : "ASSIGNED: hunter assignments written",
  );
  return 0;
}

process.exit(run(process.argv.slice(2)));
