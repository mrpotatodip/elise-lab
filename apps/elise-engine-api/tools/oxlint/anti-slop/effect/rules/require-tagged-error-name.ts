import { defineRule } from "@oxlint/plugins";

/** A tagged error's class name and its tag are the same string (CODING_STANDARDS Effect 3.1). */
export const requireTaggedErrorNameRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: 'Require `class X extends Data.TaggedError("X")` to use the same name twice.',
    },
    messages: {
      nameMismatch: "The class is `{{className}}` but its tag is `{{tag}}`. Use one string for both.",
    },
  },
  createOnce(context) {
    return {
      ClassDeclaration(node) {
        const parent = node.superClass;
        if (!node.id || parent?.type !== "CallExpression") return;
        const { callee } = parent;
        if (callee.type !== "MemberExpression" || callee.computed) return;
        if (callee.object.type !== "Identifier" || callee.object.name !== "Data") return;
        if (callee.property.type !== "Identifier" || callee.property.name !== "TaggedError") return;
        const tag = parent.arguments[0];
        if (tag?.type !== "Literal" || typeof tag.value !== "string") return;
        if (tag.value === node.id.name) return;
        context.report({ node: node.id, messageId: "nameMismatch", data: { className: node.id.name, tag: tag.value } });
      },
    };
  },
});
