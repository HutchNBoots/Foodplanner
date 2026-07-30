import nextConfig from "eslint-config-next";

const eslintConfig = [
  ...nextConfig,
  {
    ignores: ["tests/e2e/**", "playwright-report/**", "test-results/**"],
  },
];

export default eslintConfig;
