import { defineRule } from "@oxlint/plugins";

const SESSION_CALL = /\b(?:engineAuth|requireSession)\s*\(/;

/** A server function is a public endpoint, so its handler checks the session itself (CODING_STANDARDS Worker frontend 2.1). */
export const requireServerFnSessionRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Require a `createServerFn` handler to call `engineAuth()` or `requireSession()`.",
    },
    messages: {
      missingSession: "This server function never checks the session. Call `engineAuth()` (or `requireSession()`) in the handler: a route guard does not protect a server function.",
    },
  },
  createOnce(context) {
    const startsAtCreateServerFn = (node: { type: string; callee?: unknown; object?: unknown }): boolean => {
      if (node.type !== "CallExpression") return false;
      const callee = node.callee as { type: string; name?: string; object?: { type: string } } | undefined;
      if (callee?.type === "Identifier") return callee.name === "createServerFn";
      if (callee?.type === "MemberExpression" && callee.object) return startsAtCreateServerFn(callee.object);
      return false;
    };
    return {
      CallExpression(node) {
        const { callee } = node;
        if (callee.type !== "MemberExpression" || callee.computed) return;
        if (callee.property.type !== "Identifier" || callee.property.name !== "handler") return;
        if (!startsAtCreateServerFn(callee.object)) return;
        const handler = node.arguments[0];
        if (!handler) return;
        if (SESSION_CALL.test(context.sourceCode.getText(handler))) return;
        context.report({ node, messageId: "missingSession" });
      },
    };
  },
});
