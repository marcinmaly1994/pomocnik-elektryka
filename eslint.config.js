import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Cztery ostatnie pozycje to output `tsc -b` emitowany obok konfiguracji
  // (tsconfig.node.json ma `composite` bez `outDir`) — nie są to nasze źródła,
  // więc ESLint nie ma czego w nich pilnować.
  {
    ignores: [
      "dist",
      "node_modules",
      "vite.config.js",
      "vite.config.d.ts",
      "playwright.config.js",
      "playwright.config.d.ts",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  // Service worker to zwykły skrypt z innego zakresu globalnego niż okno strony.
  {
    files: ["public/sw.js"],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      // Tylko dwie klasyczne reguły hooków, tak jak w poprzednim `recommended`.
      // Zestaw `recommended` z wersji 7 dokłada reguły kompilatora Reacta (czystość
      // renderu, setState w efekcie…), które wymagałyby osobnego przeglądu kodu.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
);
