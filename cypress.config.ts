import { defineConfig } from "cypress";

export default defineConfig({
  allowCypressEnv: false,
  screenshotOnRunFailure: true,
  viewportHeight: 800,
  viewportWidth: 1280,
  screenshotsFolder: "cypress/screenshots",
  video: false,
  videosFolder: "cypress/videos",
  e2e: {
    baseUrl: "http://127.0.0.1:5173",
    defaultCommandTimeout: 10_000,
    specPattern: "cypress/e2e/**/*.cy.ts",
    supportFile: "cypress/support/e2e.ts",
  },
});
