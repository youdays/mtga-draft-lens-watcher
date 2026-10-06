import tseslint from "typescript-eslint";
export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  ...tseslint.configs.recommended,
  // CLIは設定適用後に遅延requireする必要がある。既存のCommonJS起動順を維持する。
  { files: ["src/cli.ts", "src/lib/config.ts"], rules: { "@typescript-eslint/no-require-imports": "off" } },
);
