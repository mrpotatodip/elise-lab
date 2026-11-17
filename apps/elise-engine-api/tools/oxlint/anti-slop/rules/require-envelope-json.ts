import { defineRule } from "@oxlint/plugins";

/** Every `c.json(...)` in a route carries the `{ data, error }` envelope (CODING_STANDARDS Hono JS 4.1). */
export const requireEnvelopeJsonRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Require the first argument of `c.json()` to be an object literal with `data` and `error`.",
    },
    messages: {
      bareJson: "Return `c.json({ data, error: null })`. A bare body breaks the envelope; a third-party client that fixes the shape is the one exception (Hono JS 4.1).",
    },
  },
  createOnce(context) {
    return {
      CallExpression(node) {
        const { callee } = node;
        if (callee.type !== "MemberExpression" || callee.computed) return;
        if (callee.object.type !== "Identifier" || callee.object.name !== "c") return;
        if (callee.property.type !== "Identifier" || callee.property.name !== "json") return;
        const body = node.arguments[0];
        if (body?.type === "ObjectExpression") {
          const keys = new Set<string>();
          for (const property of body.properties) {
            if (property.type === "Property" && !property.computed && property.key.type === "Identifier") keys.add(property.key.name);
          }
          if (keys.has("data") && keys.has("error")) return;
        }
        context.report({ node, messageId: "bareJson" });
      },
    };
  },
});
