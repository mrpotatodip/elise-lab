import type { HandoverFile } from "@repo/contracts/elise";
import { OPEN_PROBLEM_CHECKS_FILE } from "#/constants";
import { DECIDED_PROBLEMS_FILE, OPEN_PROBLEMS_FILE } from "#/modules/decided-problems/constants";
import type { DecidedProblem, OpenProblem } from "#/modules/decided-problems/types";

export const decidedProblemsHandover = (problems: readonly DecidedProblem[]): HandoverFile[] =>
  problems.length === 0 ? [] : [{ name: DECIDED_PROBLEMS_FILE, content: JSON.stringify({ problems }) }];

export const DECIDED_PROBLEMS_ASK = `If ${DECIDED_PROBLEMS_FILE} exists in the output directory, read it before hunting. It lists problems a person already decided about on this branch (a false positive, an accepted risk or a duplicate). Do not report them again unless your evidence is clearly different from what they were decided on.`;

export const askOfHandover = (files: readonly string[]): string =>
  files.includes(DECIDED_PROBLEMS_FILE) ? DECIDED_PROBLEMS_ASK : "";

export const openProblemsHandover = (problems: readonly OpenProblem[]): HandoverFile[] =>
  problems.length === 0 ? [] : [{ name: OPEN_PROBLEMS_FILE, content: JSON.stringify({ problems }) }];

export const OPEN_PROBLEMS_ASK = `If ${OPEN_PROBLEMS_FILE} exists in the output directory, it lists problems earlier scans of this branch found that are still open. After you validate the candidates, look at each one again in the code, and write ${OPEN_PROBLEM_CHECKS_FILE} in the output directory as {"checks":[{"fingerprint":"<its fingerprint>","answer":"still_there"|"gone"|"not_reached"}]}, one entry for each problem in the list: "still_there" when you looked and it is present, "gone" when you looked and it is not, "not_reached" when you did not get to it. Do not guess: "gone" needs you to have read the code it pointed at. This is a record only: do not add these problems to findings.json unless a candidate this run found them again.`;

export const checkAskOfHandover = (files: readonly string[]): string =>
  files.includes(OPEN_PROBLEMS_FILE) ? OPEN_PROBLEMS_ASK : "";
