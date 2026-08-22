module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended",
  ],
  // Cztery ostatnie pozycje to output `tsc -b` emitowany obok konfiguracji
  // (tsconfig.node.json ma `composite` bez `outDir`) — nie są to nasze źródła,
  // więc ESLint nie ma czego w nich pilnować.
  ignorePatterns: [
    "dist",
    ".eslintrc.cjs",
    "node_modules",
    "vite.config.js",
    "vite.config.d.ts",
    "playwright.config.js",
    "playwright.config.d.ts",
  ],
  parser: "@typescript-eslint/parser",
  plugins: ["react-refresh"],
  rules: {
    "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
  },
};
