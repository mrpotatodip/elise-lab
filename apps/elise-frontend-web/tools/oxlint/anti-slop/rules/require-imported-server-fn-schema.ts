import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

const SCHEMA_SOURCE = /^@repo\/contracts\/|^\.\.\/schemas(?:\/|$)/;

// -----
// A server function names a schema that lives somewhere else: the contracts
// package for a shape the engine also uses, the module's `schemas/` for a
// frontend-only one. A schema built or declared in the `api/` file has no
// second reader to keep it honest.
// -----
export const requireImportedServerFnSchemaRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Require the schema of `engineJson(...)` and `.validator(...)` to be imported from contracts or `../schemas`.",
    },
    messages: {
      localSchema: "Import this schema from `@repo/contracts/elise` (a shape the engine also uses) or from the module's `../schemas`. Don't build or declare it in the `api/` file (React 3.5).",
    },
  },
  createOnce(context) {
    const importedFrom = new Map<string, string>();
    const checkSchema = (argument: ESTree.Argument | undefined) => {
      if (!argument) return;
      if (argument.type === "Identifier" && SCHEMA_SOURCE.test(importedFrom.get(argument.name) ?? "")) return;
      context.report({ node: argument, messageId: "localSchema" });
    };
    return {
      ImportDeclaration(node) {
        if (typeof node.source.value !== "string") return;
        for (const specifier of node.specifiers) importedFrom.set(specifier.local.name, node.source.value);
      },
      CallExpression(node) {
        const { callee } = node;
        if (callee.type === "Identifier" && callee.name === "engineJson") checkSchema(node.arguments[0]);
        if (callee.type === "MemberExpression" && !callee.computed && callee.property.type === "Identifier" && (callee.property.name === "validator" || callee.property.name === "inputValidator")) {
          checkSchema(node.arguments[0]);
        }
      },
    };
  },
});
