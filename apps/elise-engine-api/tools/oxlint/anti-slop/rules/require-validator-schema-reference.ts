import { defineRule } from "@oxlint/plugins";

/** Schemas live in `schemas/` and routes name them; no schema is built inside a route (CODING_STANDARDS Hono JS 3.2). */
export const requireValidatorSchemaReferenceRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Require `zValidator(target, Schema)` to take a named schema, not one built inline.",
    },
    messages: {
      inlineSchema: "Define this schema in `schemas/` (or the contracts package) and pass its name to `zValidator`.",
    },
  },
  createOnce(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== "Identifier" || node.callee.name !== "zValidator") return;
        const schema = node.arguments[1];
        if (!schema) return;
        if (schema.type === "Identifier" || schema.type === "MemberExpression") return;
        context.report({ node: schema, messageId: "inlineSchema" });
      },
    };
  },
});
