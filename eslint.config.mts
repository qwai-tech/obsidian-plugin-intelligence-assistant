import { defineConfig } from "eslint/config";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import obsidianmd from "eslint-plugin-obsidianmd";
import eslintComments from "@eslint-community/eslint-plugin-eslint-comments";

export default defineConfig([
  {
    ignores: [
      "dist/**",
      "build/**",
      "coverage/**",
      "src/vendor/**",
      "**/__tests__/**",
      "**/*.test.ts",
      "tests/e2e/support/mock-mcp-server.js",
    ]
  },

  ...obsidianmd.configs.recommended,

  {
    files: ["**/*.ts", "**/*.mts", "*.ts", "*.mts"],
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
      // Allow brand names, acronyms, and technical identifiers in UI text
      "obsidianmd/ui/sentence-case": ["warn", {
        "acronyms": ["AI", "RAG", "MVC", "LLM", "API", "MCP", "URL", "HTTP", "HTTPS", "JSON", "CSS", "HTML"],
        "brands": ["Ollama", "OpenAI", "DuckDuckGo", "DeepSeek", "Gemini", "Anthropic", "Google", "OpenRouter", "SAP"],
        "ignoreWords": ["Markdown", "llama2", "mistral", "codellama", "Cross-encoder"]
      }],
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

      // Steer toward leak-safe Obsidian APIs (auto-detached on unload). A
      // listener on document/window/activeWindow/activeDocument outlives the
      // plugin unless removed by hand — use this.registerDomEvent(...) instead.
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.object.name=/^(document|window|activeWindow|activeDocument)$/][callee.property.name='addEventListener']",
          message: "Use this.registerDomEvent(target, type, handler) so the listener is detached on unload, instead of document/window addEventListener."
        }
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
  },

  {
    files: ["**/base-streaming-provider.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "confirm", message: "Use an Obsidian modal instead of confirm." },
        { name: "event", message: "The global event object is deprecated." }
        // fetch intentionally omitted: requestUrl cannot handle SSE streaming
      ]
    }
  },

  // E2E test files: relax strict TS rules that don't apply to test code
  // (fs-extra typings, intentional WebdriverIO globals, Obsidian path rules
  // that target plugin source). Keep the disciplinary rules below.
  {
    files: ["tests/e2e/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/require-await": "off",
      "obsidianmd/hardcoded-config-path": "off",
      "obsidianmd/prefer-file-manager-trash-file": "off",
      // E2E support code runs in the Node (wdio) process, not the Obsidian
      // renderer, so `window` timers do not exist here — use the Node globals.
      "obsidianmd/prefer-window-timers": "off",
      "no-console": "off",
    },
  },

  // E2E spec discipline: no hardcoded sleeps; specs may not touch DOM directly.
  {
    files: ["tests/e2e/specs/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.object.name='browser'][callee.property.name='pause']",
          message: "Use page object waitFor* helpers or browser.waitUntil(condition) — no hardcoded sleeps.",
        },
        {
          selector: "CallExpression[callee.name='$']",
          message: "Specs must use Page Objects — do not call $ directly.",
        },
        {
          selector: "CallExpression[callee.name='$$']",
          message: "Specs must use Page Objects — do not call $$ directly.",
        },
        {
          selector: "CallExpression[callee.property.name='toBeGreaterThanOrEqual'][callee.object.callee.name='expect'][arguments.0.value=0]",
          message: "Assert a meaningful lower bound or exact value; >= 0 does not prove behavior.",
        },
        {
          selector: "CallExpression[callee.property.name='toBe'][callee.object.callee.name='expect'][callee.object.arguments.0.operator='typeof'][arguments.0.value='string']",
          message: "Assert the expected string value or visible user text instead of only typeof.",
        },
        {
          selector: "CallExpression[callee.object.callee.name='expect'][callee.object.arguments.0.callee.object.name='Array'][callee.object.arguments.0.callee.property.name='isArray']",
          message: "Assert a concrete array shape or length instead of Array.isArray(...).",
        },
      ],
      "max-lines": ["warn", { max: 100, skipBlankLines: true, skipComments: true }],
    },
  },

  {
    files: ["tests/e2e/pages/**/*.ts", "tests/e2e/support/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.object.name='browser'][callee.property.name='pause']",
          message: "Use browser.waitUntil(condition) — no hardcoded sleeps.",
        },
      ],
    },
  },

  // Headless harness / mission / perf helpers: relax strict TS rules that target
  // plugin source. These are Node-side test utilities (deliberate stubs, casts,
  // and console logging), mirroring the tests/e2e relaxation.
  {
    files: ["tests/harness/**/*.ts", "tests/missions/**/*.ts", "tests/perf/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/require-await": "off",
      "obsidianmd/prefer-file-manager-trash-file": "off",
      "obsidianmd/prefer-window-timers": "off",
      "no-console": "off",
      "no-restricted-globals": "off",
    },
  },
]);
