import { defineRule } from "@oxlint/plugins";

const effectHooks = new Set(["useEffect", "useLayoutEffect", "useInsertionEffect"]);

/** Ban React effect hooks outside the files oxlint.config.ts lists, so every effect is a reviewed exception. */
export const noUseEffectRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow useEffect, useLayoutEffect and useInsertionEffect; sync with the outside world in a listed hook file (React 6.1).",
    },
    messages: {
      effectImport:
        "Do not import `{{name}}`. Focus or scroll on mount: a ref callback. A value that changes outside React: `useSyncExternalStore`. Page title: the route's `head`. Derived data: compute it in render. A reaction to a click: the event handler. A real subscription or timer with no value to read: a hook file listed in oxlint.config.ts (React 6.1).",
      effectMember:
        "Do not call `{{object}}.{{name}}`. See React 6.1 for what to use instead, or list the hook file in oxlint.config.ts.",
    },
  },
  createOnce(context) {
    // -----
    // The names that hold the react module in this file: `React` always,
    // plus any default or namespace import (`import * as R from "react"`).
    // -----
    const reactNames = new Set<string>();
    return {
      before() {
        reactNames.clear();
        reactNames.add("React");
      },
      ImportDeclaration(node) {
        if (node.source.value !== "react") return;
        for (const specifier of node.specifiers) {
          if (specifier.type !== "ImportSpecifier") {
            reactNames.add(specifier.local.name);
            continue;
          }
          const name = specifier.imported.type === "Identifier" ? specifier.imported.name : specifier.imported.value;
          if (effectHooks.has(name)) context.report({ node: specifier, messageId: "effectImport", data: { name } });
        }
      },
      MemberExpression(node) {
        if (node.computed || node.object.type !== "Identifier" || !reactNames.has(node.object.name)) return;
        if (node.property.type !== "Identifier" || !effectHooks.has(node.property.name)) return;
        context.report({
          node,
          messageId: "effectMember",
          data: { name: node.property.name, object: node.object.name },
        });
      },
    };
  },
});
