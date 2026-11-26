import type { HandoverFile } from "@repo/contracts/elise";
import { DECIDED_PROBLEMS_FILE } from "#/modules/decided-problems/constants";
import type { DecidedProblem } from "#/modules/decided-problems/types";

export const decidedProblemsHandover = (problems: readonly DecidedProblem[]): HandoverFile[] =>
  problems.length === 0 ? [] : [{ name: DECIDED_PROBLEMS_FILE, content: JSON.stringify({ problems }) }];

export const DECIDED_PROBLEMS_ASK = `If ${DECIDED_PROBLEMS_FILE} exists in the output directory, read it before hunting. It lists problems a person already decided about on this branch (a false positive, an accepted risk or a duplicate). Do not report them again unless your evidence is clearly different from what they were decided on.`;

export const askOfHandover = (files: readonly string[]): string =>
  files.includes(DECIDED_PROBLEMS_FILE) ? DECIDED_PROBLEMS_ASK : "";
