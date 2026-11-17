import { defineRule } from "@oxlint/plugins";

/** Fail with `return yield* new Tag(...)` so TypeScript knows the code after it cannot run (CODING_STANDARDS Effect 3.4). */
export const requireReturnYieldErrorRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Require `return` before `yield* new X(...)` used as a statement.",
    },
    messages: {
      missingReturn: "Write `return yield* new {{name}}(...)`. Without `return`, TypeScript still thinks the code below can run.",
    },
  },
  createOnce(context) {
    return {
      ExpressionStatement(node) {
        const { expression } = node;
        if (expression.type !== "YieldExpression" || !expression.delegate) return;
        const argument = expression.argument;
        if (argument?.type !== "NewExpression") return;
        const name = argument.callee.type === "Identifier" ? argument.callee.name : "Tag";
        context.report({ node, messageId: "missingReturn", data: { name } });
      },
    };
  },
});
