import { describe, expect, it } from "vitest";
import { agentErrorText } from "#/modules/scan-sandbox/utils";

describe("agentErrorText", () => {
  it("keeps result and system lines and leaves out tool results and assistant text", () => {
    const log = [
      JSON.stringify({ type: "system", subtype: "init" }),
      JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: "SECRET=hunter2" }] } }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "const apiKey = 'abc'" }] } }),
      "plain line with SECRET=hunter2",
      JSON.stringify({ type: "result", subtype: "error_max_turns", is_error: true, result: "ran out of turns" }),
    ].join("\n");

    expect(agentErrorText(log, 2000)).toBe("system init\nresult error_max_turns error ran out of turns");
  });
});
