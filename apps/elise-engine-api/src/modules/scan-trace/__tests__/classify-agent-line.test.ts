import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { TraceEntrySchema } from "@repo/contracts/elise";
import { classifyAgentLine, drainTrace, emptyTraceState } from "#/modules/scan-trace/utils";

const FIXTURES = resolve(__dirname, "../../../../../../packages/contracts/fixtures/trace-classifier");
const ndjson = readFileSync(resolve(FIXTURES, "agent-stream.ndjson"), "utf8");
const { lines: expectedLines } = z
  .object({ lines: z.array(z.array(z.string())) })
  .parse(JSON.parse(readFileSync(resolve(FIXTURES, "agent-stream.expected.json"), "utf8")));

const labelsOf = (text: string) => text.split("\n").flatMap(classifyAgentLine);

// -----
// Seam 2: the shared recorded agent output in, the labels of each
// line out. The Runner's Rust classifier reads the same files.
// -----
describe("classifyAgentLine", () => {
  it("gives the labels of each line of the shared fixture", () => {
    expect(
      ndjson
        .split("\n")
        .filter((line) => line !== "")
        .map(classifyAgentLine),
    ).toEqual(expectedLines);
  });

  it.each([
    ["an empty line", ""],
    ["text that is not JSON", "warning: something"],
    ["a JSON value that is not an object", "[1,2]"],
    ["a line type from a newer claude", '{"type":"brand_new_kind","payload":{}}'],
    ["a tool result", '{"type":"user","message":{"content":[{"type":"tool_result","content":"x"}]}}'],
    ["the final result", '{"type":"result","usage":{}}'],
  ])("ignores %s", (_name, line) => {
    expect(classifyAgentLine(line)).toEqual([]);
  });

  it("labels a tool it does not know as calling a tool", () => {
    expect(
      classifyAgentLine('{"type":"assistant","message":{"content":[{"type":"tool_use","name":"mcp__x__y"}]}}'),
    ).toEqual(["calling_tool"]);
  });

  it("keeps nothing but the label", () => {
    expect(JSON.stringify(labelsOf(ndjson))).not.toMatch(/FIXTURE|fixture\//);
  });
});

// -----
// A producer's view: bytes of a log in, entries out, merged by label,
// with ids that a retry or a later poll never repeats for new work.
// -----
const T0 = Date.parse("2026-11-19T09:00:00.000Z");
const at = (seconds: number) => new Date(T0 + seconds * 1000);
const line = (name: string) =>
  `${JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name }] } })}\n`;

describe("drainTrace", () => {
  it("merges consecutive identical labels into one entry with a count", () => {
    const first = drainTrace(
      emptyTraceState(),
      line("Read") + line("Glob") + line("Read") + line("Grep"),
      "hunt",
      at(0),
    );

    expect(first.entries.map((entry) => [entry.label, entry.count])).toEqual([
      ["reading_files", 3],
      ["searching", 1],
    ]);
    expect(first.entries.every((entry) => TraceEntrySchema.safeParse(entry).success)).toBe(true);
  });

  it("grows the open entry in place on the next poll and returns only what changed", () => {
    const first = drainTrace(emptyTraceState(), line("Grep"), "hunt", at(0));
    const second = drainTrace(first.state, line("Grep") + line("Grep"), "hunt", at(10));

    expect(second.entries).toHaveLength(1);
    expect(second.entries[0]).toMatchObject({
      id: first.entries[0]?.id,
      label: "searching",
      count: 3,
      startedAt: at(0).toISOString(),
      endedAt: at(10).toISOString(),
    });
  });

  it("returns nothing when no line is new", () => {
    const first = drainTrace(emptyTraceState(), line("Bash"), "check", at(0));

    expect(drainTrace(first.state, "", "check", at(10)).entries).toEqual([]);
  });

  it("holds back a half-written last line until it is whole", () => {
    const whole = line("Bash");
    const first = drainTrace(emptyTraceState(), whole + whole.slice(0, 20), "check", at(0));
    const second = drainTrace(first.state, whole, "check", at(10));

    expect(first.entries.map((entry) => entry.count)).toEqual([1]);
    expect(second.entries.map((entry) => entry.count)).toEqual([2]);
  });

  it("counts the bytes it consumed, so a non-ASCII line moves the offset by bytes", () => {
    const text = `${JSON.stringify({ type: "system", note: "é" })}\n`;

    expect(drainTrace(emptyTraceState(), text, "recon", at(0)).state.offset).toBe(
      new TextEncoder().encode(text).length,
    );
  });

  it("orders entries of one poll by id", () => {
    const { entries } = drainTrace(
      emptyTraceState(),
      line("Read") + line("Grep") + line("Bash") + line("Write"),
      "hunt",
      at(0),
    );

    expect(entries.map((entry) => entry.id)).toEqual(entries.map((entry) => entry.id).toSorted());
  });
});
