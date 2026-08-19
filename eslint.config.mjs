import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    name: "project/intentional-client-effects",
    rules: {
      // These effects hydrate cached/API state after mount by design.
      "react-hooks/set-state-in-effect": "off",
      // Auth transitions intentionally hard-reload so server sessions are fresh.
      "@next/next/no-location-assign-relative-destination": "off",
    },
  },
  globalIgnores([
    "node_modules/**",
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".pytest_cache/**",
    "**/__pycache__/**",
    "data/**",
    "images/**",
    "PPT/**",
    "templates/**",
    "tests/**",
    "adapters/**",
    "pipeline/**",
    "cards/**",
    "scripts/**/*.py",
  ]),
]);
