import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Two Vitest projects:
//   ui — component/unit tests under jsdom (Testing Library).
//   db — PostgreSQL integration tests against an ephemeral embedded server
//        booted by db/tests/global-setup.ts (no Docker, no system PostgreSQL).
// `pnpm test` runs both.
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        test: {
          name: "ui",
          environment: "jsdom",
          // globals must stay true: @testing-library/react only registers its
          // automatic afterEach cleanup when afterEach is globally available.
          globals: true,
          include: ["**/*.test.ts", "**/*.test.tsx"],
          exclude: ["node_modules/**", ".next/**", "db/**"],
        },
      },
      {
        test: {
          name: "db",
          environment: "node",
          globals: true,
          include: ["db/**/*.test.ts"],
          globalSetup: ["db/tests/global-setup.ts"],
          hookTimeout: 120_000,
          testTimeout: 60_000,
        },
      },
    ],
  },
});
