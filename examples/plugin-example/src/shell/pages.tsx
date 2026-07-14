import { Button, Icon, Input } from "@uniview/example-plugin-api";
import { BRAND } from "./Sidebar";

/**
 * The demo's content pages — ports of what used to be `Fixtures.swift`, a set of
 * `UINode` trees hand-built in Swift.
 *
 * They were only ever written in Swift because the shell was: there was no plugin
 * rendering this window, so the pages had to be authored on the native side. Now
 * that the whole window is one React tree, they are components, and the last
 * hand-built `UINode` in the app is gone.
 */

/** A page's hero: gradient chip + title + subtitle. */
function PageHeader({
  symbol,
  title,
  subtitle,
}: {
  symbol: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-4">
      {/* The gradient is the PLUGIN's — it travels in the Style IR. The renderer
          used to own a blue→violet brand gradient and paint it on anything marked
          `variant="primary"`; that is what it means for a brand to leak into a
          renderer, and it is gone. */}
      <div
        className={`flex items-center justify-center w-[46px] aspect-square rounded-xl bg-linear-to-br from-[${BRAND}] to-[#4f6bf2] shadow-lg`}
      >
        <Icon symbol={symbol} className="text-lg font-semibold text-white" />
      </div>
      <div className="flex-col flex-1 gap-1">
        <p className="text-3xl font-bold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

/** A translucent card — native popover material, hairline, rounded. */
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      material="popover"
      className="flex-col w-full gap-4 p-5 rounded-2xl border border-border"
    >
      {children}
    </div>
  );
}

function SectionTitle({ symbol, title }: { symbol: string; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon
        symbol={symbol}
        className={`text-sm font-semibold text-[${BRAND}]`}
      />
      <p className="text-base font-semibold text-foreground">{title}</p>
    </div>
  );
}

function Field({
  label,
  icon,
  placeholder,
}: {
  label: string;
  icon: string;
  placeholder: string;
}) {
  return (
    <div className="flex-col gap-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <Input placeholder={placeholder} icon={icon} className="w-full" />
    </div>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return <div className="flex-col w-full gap-5 pt-7 px-8 pb-6">{children}</div>;
}

export function HomePage() {
  return (
    <Page>
      <PageHeader
        symbol="sparkles"
        title="Welcome to Uniview"
        subtitle="A real native macOS window rendered from a React tree."
      />
      <Card>
        <SectionTitle symbol="plus.circle.fill" title="Create Workspace" />
        <Field
          label="Workspace name"
          icon="square.grid.2x2"
          placeholder="My Workspace"
        />
        <Field
          label="Device name"
          icon="laptopcomputer"
          placeholder="This device"
        />
        <Button
          title="Create Workspace"
          icon="plus.circle"
          className="w-full"
        />
      </Card>
      <Card>
        <SectionTitle
          symbol="cube.transparent"
          title="Native, not a web view"
        />
        <p className="text-sm text-muted-foreground leading-relaxed">
          Every control here is a real AppKit view — NSButton, NSTextField,
          NSVisualEffectView — laid out by Yoga flexbox from a platform-neutral
          Style IR. The sidebar to the left is written in this same TypeScript.
        </p>
      </Card>
    </Page>
  );
}

export function ComponentsPage() {
  return (
    <Page>
      <PageHeader
        symbol="square.grid.2x2"
        title="Components"
        subtitle="Native primitives, driven by the Uniview protocol."
      />
      <Card>
        <SectionTitle
          symbol="rectangle.and.hand.point.up.left"
          title="Buttons"
        />
        <div className="flex gap-2.5">
          {/* Painted by the plugin (a fill in the IR) vs. left alone — and an
              unstyled button is a REAL native bezel button, not our idea of one. */}
          <Button
            title="Painted"
            icon="bolt.fill"
            className={`w-[150px] h-10 rounded-lg bg-[${BRAND}] text-white`}
          />
          <Button title="Native" className="w-[120px] h-10" />
        </div>
        <SectionTitle symbol="textformat" title="Typography" />
        <p className="text-sm text-muted-foreground leading-relaxed">
          Text nodes carry size, weight, color and alignment from the Style IR
          and render as native NSTextField labels — measured by the same font
          that draws them.
        </p>
      </Card>
    </Page>
  );
}

export function FormsPage() {
  return (
    <Page>
      <PageHeader
        symbol="square.and.pencil"
        title="Forms"
        subtitle="Native text fields with two-way binding over the bridge."
      />
      <Card>
        <SectionTitle symbol="person.crop.circle" title="Your details" />
        <Field label="Full name" icon="person" placeholder="Ada Lovelace" />
        <Field label="Email" icon="envelope" placeholder="ada@example.com" />
        <Field
          label="Passcode (optional)"
          icon="lock.fill"
          placeholder="••••••"
        />
        <Button title="Submit" icon="arrow.right.circle" className="w-full" />
      </Card>
    </Page>
  );
}

export function AboutPage() {
  return (
    <Page>
      <PageHeader
        symbol="info.circle"
        title="About Uniview"
        subtitle="Write a plugin UI once; render it as a real native app."
      />
      <Card>
        <SectionTitle
          symbol="cube.transparent"
          title="One protocol, many platforms"
        />
        <p className="text-sm text-foreground leading-relaxed">
          Uniview compiles a Tailwind-inspired Style IR and drives a
          Fabric-style shadow tree, laid out by Yoga and mounted onto native
          AppKit views. The same protocol will target Windows (WinUI) and
          HarmonyOS — which is why the renderer is kept small and this app is
          kept out of it.
        </p>
      </Card>
    </Page>
  );
}
