import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  {
    ignores: [
      "src/**/__tests__/**",
      "**/*.test.ts",
      "dist/**",
      "build/**",
      "main.js",
      "main.js.map",
      "coverage/**"
    ],
  },
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    rules: {
      // Disable some rules that are too strict for this project
      "no-console": "off",
      "no-alert": "off",
      "no-undef": "off",
      "no-case-declarations": "off",
      "no-extra-boolean-cast": "off",
      "no-restricted-globals": "off",
      "no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_"
      }],
      "obsidianmd/sentence-case": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",


      // Obsidian-specific rules - turn off for now as we manually fixed them
    },
  },
]);
