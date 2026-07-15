import { Icon } from "@uniview/example-plugin-api";

/**
 * The app's sidebar — in TypeScript.
 *
 * It used to be Swift: `SidebarRow`, `SidebarStatusFooter`, `SidebarViewController`,
 * ~250 lines of hand-laid `NSStackView` and `NSLayoutConstraint` inside the demo
 * app. It was the last piece of this window's UI that a plugin could not have
 * written, and it had no business being native: a row is a box with an icon, a
 * label and a hover state, and every one of those is something the Style IR
 * already says.
 *
 * Nothing here is a renderer concept. `UniviewAppKit` does not know what a
 * sidebar is, has never heard of a "row", and would render this exact tree if the
 * app called it a toolbar instead — which is the whole point.
 */

/** This demo's brand color, declared by the demo. The renderer has no brand. */
export const BRAND = "#2e91c7";

export interface Section {
  id: string;
  title: string;
  /** SF Symbol. */
  symbol: string;
  /**
   * The glyph to use when the row is selected — the filled variant, Music/Finder-
   * style. Named explicitly rather than derived by appending `.fill`, because not
   * every symbol *has* a filled twin (`menubar.rectangle` doesn't), and asking for
   * one that doesn't exist is how this row lost its icon.
   */
  symbolSelected?: string;
}

export interface SidebarProps {
  sections: Section[];
  active: string;
  onSelect: (id: string) => void;
}

export function Sidebar({ sections, active, onSelect }: SidebarProps) {
  return (
    // A floating glass panel: its own material over the window's shared backdrop,
    // inset so the ambience shows around it. `pt-[50px]` is the room the traffic
    // lights sit in — the window nudges them into this padding (see <Window
    // trafficLightPosition>), so the panel wraps them.
    <div
      material="hud"
      className="flex-col w-[214px] h-full m-[10px] pt-[50px] px-[10px] pb-3 rounded-xl border border-[#ffffff12] gap-[2px]"
    >
      {sections.map((section) => {
        const selected = section.id === active;
        return (
          <Row
            key={section.id}
            section={section}
            selected={selected}
            onSelect={onSelect}
          />
        );
      })}

      {/* Pushes the footer to the bottom — the flexbox way, not a constraint. */}
      <div className="flex-1" />

      <div className="flex items-center gap-2 h-[44px] px-[11px] rounded-lg border border-[#8080803d] bg-[#8080800d]">
        <div className="w-[9px] aspect-square rounded-full bg-muted-foreground" />
        <div className="flex-col">
          <p className="text-xs font-medium text-foreground">Not syncing</p>
          <p className="text-[10px] text-muted-foreground">This device</p>
        </div>
      </div>
    </div>
  );
}

function Row({
  section,
  selected,
  onSelect,
}: {
  section: Section;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  // `hover:` never reaches the plugin: the pill is in the Style IR and the native
  // view picks it as the pointer moves. A row that had to re-render to light up
  // would cost a round trip per mouse-move — over a *network*, in bridge mode.
  return (
    <div
      onClick={() => onSelect(section.id)}
      className={`flex items-center gap-2 h-[30px] px-2 rounded-lg ${
        selected ? "bg-[#8080801f]" : "hover:bg-[#80808014]"
      }`}
    >
      <Icon
        symbol={
          selected ? (section.symbolSelected ?? section.symbol) : section.symbol
        }
        className={`text-sm ${selected ? `text-[${BRAND}]` : "text-muted-foreground"}`}
      />
      <p
        className={`text-sm ${
          selected ? `font-semibold text-[${BRAND}]` : "text-foreground"
        }`}
      >
        {section.title}
      </p>
    </div>
  );
}
