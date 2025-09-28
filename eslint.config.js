import js from "@eslint/js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    files: ["src/**/*.{ts,tsx}", "test/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        project: [path.join(__dirname, "tsconfig.json")],
        tsconfigRootDir: __dirname
      }
    },
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/consistent-type-imports": ["error", { "prefer": "type-imports" }],
      "@typescript-eslint/no-floating-promises": "error",
      "no-console": ["warn", { "allow": ["warn", "error", "log"] }]
    }
  },
  {
    files: ["test/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly"
      }
    }
  },
  eslintConfigPrettier
);
