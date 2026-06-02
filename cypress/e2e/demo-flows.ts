export type HostName = "svelte" | "react" | "vue";
export type PluginFramework = "react" | "solid";
export type RuntimeMode = "worker" | "node-server" | "main-thread";
export type DemoName = "simple" | "advanced";

export const HOST_URLS: Record<HostName, string> = {
  svelte: "http://127.0.0.1:5173",
  react: "http://127.0.0.1:5174",
  vue: "http://127.0.0.1:5175",
};

const HIGHLIGHT_DURATION_MS = 700;
type ContainsOptions = Partial<
  Cypress.Loggable &
    Cypress.Timeoutable &
    Cypress.CaseMatchable &
    Cypress.Shadow
>;

function isTruthy(value: unknown): boolean {
  return value === true || value === "true" || value === "1";
}

function toDelayMs(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function visualStep(): void {
  cy.env(["univiewVisualDelayMs"]).then(({ univiewVisualDelayMs }) => {
    const delayMs = toDelayMs(univiewVisualDelayMs);
    if (delayMs > 0) cy.wait(delayMs, { log: false });
  });
}

function pauseAtManualStart(): void {
  cy.env(["univiewPauseAtStart", "univiewPauseSteps"]).then(
    ({ univiewPauseAtStart, univiewPauseSteps }) => {
      if (isTruthy(univiewPauseAtStart) || isTruthy(univiewPauseSteps)) {
        cy.pause();
      }
    },
  );
}

function highlightSubject($elements: JQuery<HTMLElement>, label: string): void {
  const highlightId = `${Date.now()}-${Math.random()}`;

  for (const element of Array.from($elements)) {
    const view = element.ownerDocument.defaultView;
    if (!view || !(element instanceof view.HTMLElement)) continue;

    const previous = {
      boxShadow: element.style.boxShadow,
      outline: element.style.outline,
      outlineOffset: element.style.outlineOffset,
      transition: element.style.transition,
    };

    element.dataset.univiewCypressHighlight = highlightId;
    element.dataset.univiewCypressHighlightLabel = label;
    element.scrollIntoView({ block: "center", inline: "center" });
    element.style.transition = "outline 120ms ease, box-shadow 120ms ease";
    element.style.outline = "3px solid #38bdf8";
    element.style.outlineOffset = "4px";
    element.style.boxShadow = "0 0 0 7px rgba(56, 189, 248, 0.24)";

    view.setTimeout(() => {
      if (element.dataset.univiewCypressHighlight !== highlightId) return;

      element.style.boxShadow = previous.boxShadow;
      element.style.outline = previous.outline;
      element.style.outlineOffset = previous.outlineOffset;
      element.style.transition = previous.transition;
      delete element.dataset.univiewCypressHighlight;
      delete element.dataset.univiewCypressHighlightLabel;
    }, HIGHLIGHT_DURATION_MS);
  }
}

function highlight<T extends HTMLElement>(
  subject: Cypress.Chainable<JQuery<T>>,
  label: string,
): Cypress.Chainable<JQuery<T>> {
  return subject.should(($elements) => {
    expect($elements, label).to.have.length.greaterThan(0);
    highlightSubject($elements, label);
  });
}

function findButton(
  content: string | RegExp,
  label: string,
): Cypress.Chainable<JQuery<HTMLButtonElement>> {
  return highlight(cy.contains("button", content), label);
}

function findText(
  content: string | RegExp,
  label: string,
  options?: ContainsOptions,
): Cypress.Chainable<JQuery<HTMLElement>> {
  const command = options
    ? cy.contains<HTMLElement>("*", content, options)
    : cy.contains<HTMLElement>(content);
  return highlight(command, label);
}

function findHeading(
  content: string | RegExp,
  label: string,
  options?: ContainsOptions,
): Cypress.Chainable<JQuery<HTMLElement>> {
  return highlight(cy.contains("h1,h2,h3,h4,h5,h6", content, options), label);
}

function fillInput(selector: string, value: string): void {
  highlight(cy.get(selector), `input ${value}`).then(($inputs) => {
    const input = $inputs[0];
    const view = input.ownerDocument.defaultView;
    if (!view || !(input instanceof view.HTMLInputElement)) {
      throw new Error(`${selector} did not resolve to an input element`);
    }

    const valueSetter = Object.getOwnPropertyDescriptor(
      view.HTMLInputElement.prototype,
      "value",
    )?.set;
    if (!valueSetter) {
      throw new Error("HTMLInputElement value setter was not available");
    }

    valueSetter.call(input, value);
    input.dispatchEvent(new view.Event("input", { bubbles: true }));
    input.dispatchEvent(new view.Event("change", { bubbles: true }));
  });
  visualStep();
}

export function openSvelteDemo(options: {
  framework: PluginFramework;
  runtime: RuntimeMode;
  demo: DemoName;
  update?: "full" | "incremental";
}): void {
  const update = options.update ?? "full";
  cy.visit(
    `${HOST_URLS.svelte}/?framework=${options.framework}&runtime=${options.runtime}&demo=${options.demo}&update=${update}`,
  );
  waitForDemoHeading(options.demo);
  pauseAtManualStart();
  visualStep();
}

export function openReactOrVueDemo(
  host: "react" | "vue",
  options: { runtime: RuntimeMode; demo: DemoName },
): void {
  cy.visit(HOST_URLS[host]);
  pauseAtManualStart();
  chooseRuntime(options.runtime);
  chooseDemo(options.demo);
  waitForDemoHeading(options.demo);
  visualStep();
}

export function waitForDemoHeading(demo: DemoName): void {
  findHeading(
    demo === "simple" ? "Simple Demo" : "Advanced Demo",
    `${demo} heading`,
    { timeout: 20_000 },
  ).should("be.visible");
}

export function chooseRuntime(runtime: RuntimeMode): void {
  const buttonName =
    runtime === "worker"
      ? /Worker/
      : runtime === "node-server"
        ? /Node\.js/
        : /Main/;
  findButton(buttonName, `${runtime} runtime button`).click();
  visualStep();
}

export function chooseDemo(demo: DemoName): void {
  findButton(
    demo === "simple" ? "Simple Demo" : "Advanced Demo",
    `${demo} demo button`,
  ).click();
  visualStep();
}

export function runSimpleFlow(): void {
  fillInput('input[placeholder="Enter your name"]', "Ada");
  findButton(/Click count: 0/, "first counter click").click();
  visualStep();
  findButton(/Click count: 1/, "second counter click").click();
  visualStep();
  findButton("Submit", "submit simple form").click();
  visualStep();

  findText("Hello,", "greeting text").should("be.visible");
  findText("Ada", "submitted name").should("be.visible");
  findText(/2\s+times/, "click count summary").should("be.visible");
  visualStep();

  findButton("Reset", "reset simple form").click();
  visualStep();
  cy.contains("Hello,").should("not.exist");
}

export function runAdvancedFlow(): void {
  const submit = () => findButton("Submit Form", "submit advanced form");

  submit().should("be.disabled");
  fillInput('input[placeholder="Enter your username"]', "ada");
  fillInput('input[placeholder="Enter your email"]', "ada@example.com");
  submit().should("be.enabled");

  highlight(
    cy.get('[role="switch"]').first(),
    "email notifications switch",
  ).click();
  visualStep();
  findButton("SMS", "sms communication method").click();
  visualStep();

  submit().click();
  visualStep();
  findText("Form Submitted Successfully!", "advanced success message", {
    timeout: 5_000,
  }).should("be.visible");
  findText(/Username:\s*ada/, "submitted username").should("be.visible");
  findText(/Email:\s*ada@example\.com/, "submitted email").should("be.visible");
  findText(/Notifications:\s*Enabled/, "submitted notifications").should(
    "be.visible",
  );
  findText(/Preference:\s*sms/, "submitted communication preference").should(
    "be.visible",
  );
  visualStep();

  findButton("Reset", "reset advanced form").click();
  visualStep();
  cy.contains("Form Submitted Successfully!").should("not.exist");
}
