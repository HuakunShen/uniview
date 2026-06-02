import {
  HOST_URLS,
  openSvelteDemo,
  runAdvancedFlow,
  runSimpleFlow,
} from "./demo-flows";

const simpleCases = [
  { framework: "react", runtime: "worker" },
  { framework: "react", runtime: "main-thread" },
  { framework: "react", runtime: "node-server" },
  { framework: "solid", runtime: "worker" },
  { framework: "solid", runtime: "node-server" },
] as const;

describe("svelte host", () => {
  for (const scenario of simpleCases) {
    it(`${scenario.framework} ${scenario.runtime} simple demo`, () => {
      openSvelteDemo({ ...scenario, demo: "simple" });
      runSimpleFlow();
    });
  }

  const advancedCases = simpleCases;

  for (const scenario of advancedCases) {
    it(`${scenario.framework} ${scenario.runtime} advanced demo`, () => {
      openSvelteDemo({ ...scenario, demo: "advanced" });
      runAdvancedFlow();
    });
  }

  it("disables Solid main-thread mode", () => {
    cy.visit(
      `${HOST_URLS.svelte}/?framework=solid&runtime=main-thread&demo=simple&update=full`,
    );

    cy.contains("button", /Main/).should("be.disabled");
    cy.url().should("match", /runtime=worker/);
  });

  it("benchmark demo renders and responds", () => {
    cy.visit(
      `${HOST_URLS.svelte}/?framework=react&runtime=worker&demo=benchmark&update=full`,
    );

    cy.contains("h1,h2,h3,h4,h5,h6", /Benchmark/i, {
      timeout: 20_000,
    }).should("be.visible");
    cy.contains(/Item count:/i).should("be.visible");
    cy.contains("button", /Update Single Item/i).click();
    cy.contains(/Operations performed:/i).should("be.visible");
  });
});
