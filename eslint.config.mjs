import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { architectureConfig } from "./eslint.architecture.mjs";

export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/.next/**",
    "**/coverage/**",
    "**/playwright-report/**",
    "**/test-results/**",
    "**/next-env.d.ts",
    // Deliberately minimal fixtures for web/tests/architecture.test.ts.
    "web/tests/fixtures/**",
  ]),
  ...nextVitals,
  ...nextTypescript,
  {
    settings: { next: { rootDir: "web" } },
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
    },
  },
  ...architectureConfig(),
]);
