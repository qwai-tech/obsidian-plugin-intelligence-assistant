import { defineConfig } from "eslint/config";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import obsidianmd from "eslint-plugin-obsidianmd";
import eslintComments from "eslint-plugin-eslint-comments";

export default defineConfig([
  {
    ignores: [
      "dist/**",
      "build/**",
      "coverage/**",
      "**/__tests__/**",
      "**/*.test.ts",
      "main.js",
      "main.js.map"
    ]
  },

  ...obsidianmd.configs.recommended,

  {
    files: ["**/*.ts", "*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: process.cwd()
      },
      globals: {
        console: "readonly",
        document: "readonly",
        window: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        performance: "readonly",
        navigator: "readonly",
        fetch: "readonly",
        process: "readonly",
        NodeJS: "readonly",
        self: "readonly"
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "eslint-comments": eslintComments
    },
    rules: {
      "obsidianmd/ui/sentence-case": "warn",
      "obsidianmd/prefer-file-manager-trash-file": "error",

      "no-console": ["error", { allow: ["warn", "error", "debug"] }],
      "no-alert": "error",
      "no-undef": "off",

      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "Use requestUrl instead of fetch." },
        { name: "confirm", message: "Use an Obsidian modal instead of confirm." },
        { name: "event", message: "The global event object is deprecated." }
      ],

      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-extra-boolean-cast": "error",
      "no-async-promise-executor": "error",
      "prefer-promise-reject-errors": "error",

      "@typescript-eslint/no-require-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: true }],
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-base-to-string": "error",

      "@typescript-eslint/restrict-template-expressions": [
        "error",
        {
          allowBoolean: false,
          allowNumber: true,
          allowAny: false,
          allowNullish: false
        }
      ],

      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",

      "@typescript-eslint/no-unsafe-function-type": "error",
      "@typescript-eslint/require-await": "error",

      "eslint-comments/no-unused-disable": "error",
      "eslint-comments/require-description": "error",
      "eslint-comments/disable-enable-pair": "error",
      "@typescript-eslint/no-redundant-type-constituents": "error",

      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_"
        }
      ]
    }
  }
]);
