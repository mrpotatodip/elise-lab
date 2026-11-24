import { defineRule } from "@oxlint/plugins";

const ROUTE_METHODS = new Set(["get", "post", "put", "patch", "delete"]);

/** Every route passes its `describeRoute` doc right after the path (CODING_STANDARDS Hono JS 10.1). */
export const requireRouteDocRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Require `app.<verb>(path, xDoc, ...)`: the second argument is an identifier ending in `Doc`.",
    },
    messages: {
      missingDoc:
        "Pass the route's doc right after the path: `app.{{method}}(path, {{verb}}Doc, ...)`, exported from `openapi/`.",
    },
  },
  createOnce(context) {
    return {
      CallExpression(node) {
        const { callee } = node;
        if (callee.type !== "MemberExpression" || callee.computed) return;
        if (callee.object.type !== "Identifier" || callee.object.name !== "app") return;
        if (callee.property.type !== "Identifier" || !ROUTE_METHODS.has(callee.property.name)) return;
        if (node.arguments[0]?.type !== "Literal") return;
        const doc = node.arguments[1];
        if (doc?.type === "Identifier" && doc.name.endsWith("Doc")) return;
        context.report({ node, messageId: "missingDoc", data: { method: callee.property.name, verb: "verbThing" } });
      },
    };
  },
});
