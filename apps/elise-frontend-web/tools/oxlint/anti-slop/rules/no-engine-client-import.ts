import { defineRule } from "@oxlint/plugins";

const ENGINE_SOURCES = /^#\/lib\/engine-client$|^#\/modules\/[^/]+\/server(?:\/|$)/;

/** Components, hooks and routes call a server function, never the engine client (CODING_STANDARDS React 3.1). */
export const noEngineClientImportRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Disallow importing the engine client or the session helpers outside `api/`.",
    },
    messages: {
      engineClientImport:
        "Call a server function from the module's `api/` folder. The engine client and session helpers belong to server functions only.",
    },
  },
  createOnce(context) {
    return {
      ImportDeclaration(node) {
        if (node.importKind === "type") return;
        if (typeof node.source.value !== "string" || !ENGINE_SOURCES.test(node.source.value)) return;
        context.report({ node, messageId: "engineClientImport" });
      },
    };
  },
});
