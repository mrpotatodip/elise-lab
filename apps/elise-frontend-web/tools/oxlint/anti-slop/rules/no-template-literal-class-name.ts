import { defineRule } from "@oxlint/plugins";

/** Classes combine through `cn()`, not a template literal (CODING_STANDARDS React 7.2). */
export const noTemplateLiteralClassNameRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Disallow a template literal with `${}` in `className`.",
    },
    messages: {
      templateClassName:
        'Combine classes with `cn("base", cond && "active", className)`. `cn` also merges conflicting Tailwind classes.',
    },
  },
  createOnce(context) {
    return {
      JSXAttribute(node) {
        if (node.name.type !== "JSXIdentifier" || node.name.name !== "className") return;
        const value = node.value;
        if (value?.type !== "JSXExpressionContainer") return;
        const expression = value.expression;
        if (expression.type !== "TemplateLiteral" || expression.expressions.length === 0) return;
        context.report({ node: expression, messageId: "templateClassName" });
      },
    };
  },
});
