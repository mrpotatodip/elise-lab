import { readdirSync } from "node:fs";
import { defineConfig, type OxlintOverride } from "oxlint";

const FORBID_HONO_RPC = { name: "hono/client", message: "No Hono RPC client: the frontend calls the API through a server function (Hono JS 9.2)." };
const FORBID_DEEP_IMPORT = { group: ["#/modules/*/*/*"], message: "Import through the folder's barrel: `#/modules/{module}/{folder}` (Hono JS 8.2). Inside one folder, import the sibling with `./file`." };
const FORBID_HONO_IN_SERVICES = { group: ["hono", "hono/*"], message: "Services never import from `hono`: pass plain values, not a Context (Hono JS 2.3)." };

// -----
// Source providers (docs/adr/0007-git-providers.md): core reads a provider
// only through `#/providers/port` and `#/providers/registry`, a provider
// imports only the port and its own folder, and only the registry imports
// every provider. Each folder under src/providers gets its own override, so a
// new provider is covered as soon as its folder exists.
// -----
const FORBID_PROVIDER_IN_CORE = {
  group: ["#/providers/*", "#/providers/*/**", "!#/providers/port", "!#/providers/registry"],
  message: "Core reads a provider only through `#/providers/registry` and `#/providers/port`, never its folder (ADR 0007).",
};
const PROVIDER_IDS = readdirSync(new URL("src/providers", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const providerOverride = (id: string): OxlintOverride => ({
  files: [`src/providers/${id}/**`],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [FORBID_HONO_RPC],
        patterns: [
          FORBID_DEEP_IMPORT,
          {
            group: ["#/providers/*", "#/providers/*/**", "!#/providers/port", `!#/providers/${id}`, `!#/providers/${id}/**`],
            message: "A provider imports only `#/providers/port` and its own folder: never the registry or another provider (ADR 0007).",
          },
        ],
      },
    ],
  },
});

export default defineConfig({
  ignorePatterns: ["tools/oxlint/anti-slop/**"],
  plugins: ["typescript", "unicorn", "oxc", "vitest", "promise", "node"],
  categories: {
    correctness: "error",
    suspicious: "error",
  },
  jsPlugins: [
    { name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" },
    { name: "anti-slop-effect", specifier: "./tools/oxlint/anti-slop/effect/index.ts" },
  ],
  rules: {
    "anti-slop/no-chained-type-assertions": "error",
    "anti-slop/no-conditional-empty-object-spread": "error",
    "anti-slop/no-known-value-widening": "error",
    "anti-slop/no-module-mocking": "error",
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reflect-apply": "error",
    "anti-slop/no-reflect-get": "error",
    "anti-slop/no-runtime-typeof": "error",
    "anti-slop/no-shape-in-symbol-names": "error",
    "anti-slop/no-unknown-parameters": "error",
    "anti-slop/no-unknown-returns": "error",
    "anti-slop/no-unknown-type-aliases": "error",
    "anti-slop/no-http-exception-throw": "error",
    "anti-slop/no-parent-relative-imports": "error",
    "anti-slop/no-raw-request-input": "error",
    "anti-slop/no-unlisted-comments": "error",
    "anti-slop-effect/no-async-in-effect-layers": "off",
    "anti-slop-effect/no-effect-catch-all": "error",
    "anti-slop-effect/no-effect-run-outside-runner": "error",
    "anti-slop-effect/no-run-effect-in-effect-layers": "off",
    "anti-slop-effect/no-throw-in-effect-gen": "error",
    "anti-slop-effect/require-effect-return-type": "off",
    "anti-slop-effect/require-try-promise-catch": "error",
    "anti-slop/require-typed-hono-app": "error",
    "anti-slop/no-unsafe-dictionary-type": "error",
    "anti-slop/no-widen-then-assert": "error",
    "anti-slop/require-safety-comment-for-type-assertion": "error",
    "anti-slop/require-validator-schema-reference": "error",
    "anti-slop-effect/require-return-yield-error": "error",
    "anti-slop-effect/require-tagged-error-name": "error",
    "typescript/consistent-type-definitions": ["error", "type"],
    "typescript/no-explicit-any": "error",
    "node/no-process-env": "error",
    "no-restricted-imports": ["error", { paths: [FORBID_HONO_RPC], patterns: [FORBID_DEEP_IMPORT, FORBID_PROVIDER_IN_CORE] }],
    // -----
    // Effect's tagged errors discriminate on
    // its own `_tag` field.
    // -----
    "no-underscore-dangle": ["error", { allow: ["_tag"] }],
  },
  overrides: [
    {
      files: ["src/modules/**/api/**"],
      rules: {
        "anti-slop/no-error-handling-in-routes": "error",
        "anti-slop/require-envelope-json": "error",
        "anti-slop/require-route-doc": "error",
        "no-console": "error",
      },
    },
    {
      files: ["src/modules/**/handlers/**", "src/modules/**/queries/**", "src/modules/**/utils/**"],
      rules: {
        "no-restricted-imports": ["error", { paths: [FORBID_HONO_RPC], patterns: [FORBID_DEEP_IMPORT, FORBID_HONO_IN_SERVICES, FORBID_PROVIDER_IN_CORE] }],
      },
    },
    ...PROVIDER_IDS.map(providerOverride),
    {
      files: ["src/providers/registry.ts", "**/__tests__/**"],
      rules: {
        "no-restricted-imports": ["error", { paths: [FORBID_HONO_RPC], patterns: [FORBID_DEEP_IMPORT] }],
      },
    },
    {
      files: ["src/modules/**/handlers/**", "src/modules/**/queries/**"],
      rules: {
        "anti-slop-effect/no-async-in-effect-layers": "error",
        "anti-slop-effect/no-run-effect-in-effect-layers": "error",
        "anti-slop-effect/require-effect-return-type": "error",
      },
    },
    {
      // -----
      // Reads `.shape`, which is Zod's own name for a schema's fields.
      // -----
      files: ["src/lib/document-fields.ts"],
      rules: {
        "anti-slop/no-shape-in-symbol-names": "off",
      },
    },
    {
      // -----
      // The shared runner itself.
      // -----
      files: ["src/lib/effect-query.ts"],
      rules: {
        "anti-slop-effect/no-effect-run-outside-runner": "off",
      },
    },
    {
      // -----
      // Runs before any route, so c.req.valid is not
      // set yet; it reads one header and compares its
      // hash (Hono JS 3.1).
      // -----
      files: ["src/lib/require-service-token.ts"],
      rules: {
        "anti-slop/no-raw-request-input": "off",
      },
    },
    {
      files: ["**/__tests__/**"],
      rules: {
        "anti-slop-effect/no-effect-catch-all": "off",
        "anti-slop-effect/no-effect-run-outside-runner": "off",
        "anti-slop-effect/no-throw-in-effect-gen": "off",
        "anti-slop-effect/require-try-promise-catch": "off",
        "anti-slop/no-parent-relative-imports": "off",
        "anti-slop/no-raw-request-input": "off",
        "anti-slop/require-typed-hono-app": "off",
        "no-console": "error",
        "vitest/expect-expect": "error",
        "vitest/no-conditional-expect": "error",
        "vitest/no-disabled-tests": "error",
        "vitest/no-focused-tests": "error",
        "vitest/no-identical-title": "error",
        "vitest/no-restricted-matchers": ["error", { toMatchSnapshot: "No snapshot tests (General 2.2).", toMatchInlineSnapshot: "No snapshot tests (General 2.2)." }],
      },
    },
  ],
});
