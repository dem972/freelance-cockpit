import { defineConfig } from "vitest/config";

const project = (root: string, name: string) => ({ extends: true, root, test: { name } });

export default defineConfig({
  test: {
    // The first test of a file pays the Urssaf rules initialisation (modele-social);
    // shared CI runners are several times slower than a laptop.
    testTimeout: 30_000,
    projects: [
      project("packages/engine", "@fc/engine"),
      project("packages/shared", "@fc/shared"),
      project("apps/api", "@fc/api"),
      project("apps/web", "@fc/web"),
    ],
  },
});
