// The Telos shell: 56px top bar (title + sync chip + context action), content
// column capped at 560px, 64px bottom tab nav in the thumb zone.
import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  CalendarRange,
  ChartNoAxesCombined,
  CircleUserRound,
  Dumbbell,
  Sun,
} from "lucide-react";
import { SyncChip } from "./SyncChip";

const tabs = [
  { to: "/", label: "Today", icon: Sun },
  { to: "/program", label: "Program", icon: CalendarRange },
  { to: "/log", label: "Log", icon: Dumbbell },
  { to: "/progress", label: "Progress", icon: ChartNoAxesCombined },
  { to: "/profile", label: "Profile", icon: CircleUserRound },
];

const titles: Record<string, string> = {
  "/": "Today",
  "/program": "Program",
  "/log": "Log",
  "/progress": "Progress",
  "/profile": "Profile",
};

export function AppShell({
  children,
  title,
  contextAction,
  hideNav,
}: {
  children: ReactNode;
  title?: string;
  contextAction?: ReactNode;
  hideNav?: boolean;
}) {
  const location = useLocation();
  const screenTitle = title ?? titles[location.pathname] ?? "Telos";

  return (
    <div className="app-shell flex flex-col">
      <header
        className="sticky top-0 z-40 safe-top border-b border-outline-variant backdrop-blur"
        style={{
          background:
            "color-mix(in srgb, var(--surface-container) 85%, transparent)",
        }}
      >
        <div className="h-14 px-4 flex items-center justify-between gap-3">
          <h1 className="type-title text-on-surface">{screenTitle}</h1>
          <div className="flex items-center gap-2">
            <SyncChip />
            {contextAction}
          </div>
        </div>
      </header>

      <main
        className="flex-1 px-4 py-4"
        style={{
          paddingBottom: hideNav
            ? "calc(96px + env(safe-area-inset-bottom))"
            : "calc(var(--bottom-nav-h) + env(safe-area-inset-bottom) + 24px)",
        }}
      >
        {children}
      </main>

      {!hideNav && (
        <nav
          className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[560px] z-40 bg-surface-container border-t border-outline-variant safe-bottom"
          aria-label="Primary"
        >
          <div className="h-16 grid grid-cols-5">
            {tabs.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `relative flex flex-col items-center justify-center gap-1 ${
                    isActive ? "text-primary" : "text-on-surface-variant"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute top-0 w-8 h-0.5 rounded-full bg-primary" />
                    )}
                    <Icon size={22} strokeWidth={1.5} />
                    <span className="type-label !text-[10px]">{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
