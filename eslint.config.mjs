import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

// Flat config. The Next.js shareable configs bring the React, React Hooks,
// import, jsx-a11y and @next rules; `eslint-config-prettier` goes last to turn
// off formatting rules that would fight Prettier (Prettier owns formatting).
const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "drizzle/**",
      "test-results/**",
      "next-env.d.ts",
      "**/*.tsbuildinfo",
    ],
  },
  ...coreWebVitals,
  ...typescript,
  prettier,
];

export default config;
