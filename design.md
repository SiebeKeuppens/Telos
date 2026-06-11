---
name: Telos
description: Standalone, mobile-first design system for Telos — an adaptive training PWA. Adapts the "Deep Space Professional" family language (dark-first, Material-3 tonal, Space Grotesk + Inter) for one-handed, in-the-gym use. Telos is NOT part of the keuppens.online suite; it borrows the visual language only — no shared shell, no app-switcher, no data-app accent system.
theme_model: dark-first, system-driven, with a light variant (3-state System/Light/Dark toggle persisted to localStorage['telos-theme'])
platform: mobile-first, responsive, installable PWA — standalone display mode, safe-area aware, offline-first
fonts:
  heading: Space Grotesk
  body: Inter
# ---- colors: DARK is the default scheme (Material-3 "tonal"), neutrals inherited from the family ----
colors:
  surface: '#0a0f10'
  surface-bright: '#232e30'
  surface-container-lowest: '#000000'
  surface-container-low: '#0e1416'
  surface-container: '#131b1c'
  surface-container-high: '#182123'
  surface-container-highest: '#1d2729'
  on-surface: '#dce7ea'
  on-surface-variant: '#a2adaf'
  outline: '#6c777a'
  outline-variant: '#3f4a4c'
  primary: '#8fd6a8'            # Telos signature — spring/jade green (growth, progress)
  on-primary: '#06351f'
  primary-container: '#21543a'
  on-primary-container: '#abf2c4'
  secondary: '#b2cbd0'
  tertiary: '#accdf0'
  error: '#fa746f'
  on-error: '#490006'
  success: '#7fd1a8'           # note: close to primary — use for status, not as a second accent
  warning: '#e8c97a'
colors-light:
  surface: '#f4f8f9'
  surface-container: '#ffffff'
  surface-container-high: '#e7eef0'
  surface-container-highest: '#dfe8ea'
  on-surface: '#161d1f'
  on-surface-variant: '#41494b'
  outline-variant: '#c4ced0'
  primary: '#2e6a47'            # same hue, darkened so white text stays readable on fills
  on-primary: '#ffffff'
  primary-container: '#b6f0c9'
  on-primary-container: '#06301c'
  error: '#b3261e'
typography:
  metric-xl:   { fontFamily: Space Grotesk, fontSize: 44px, fontWeight: '600', lineHeight: 48px, fontVariantNumeric: tabular-nums, letterSpacing: '-0.02em' }  # the one big number on a screen (active lift, today's total)
  headline-lg: { fontFamily: Space Grotesk, fontSize: 28px, fontWeight: '600', lineHeight: 36px, letterSpacing: '-0.01em' }
  headline-md: { fontFamily: Space Grotesk, fontSize: 22px, fontWeight: '500', lineHeight: 30px }
  title:       { fontFamily: Space Grotesk, fontSize: 18px, fontWeight: '600', lineHeight: 26px }
  body-lg:     { fontFamily: Inter, fontSize: 16px, fontWeight: '400', lineHeight: 26px }
  body-md:     { fontFamily: Inter, fontSize: 15px, fontWeight: '400', lineHeight: 24px }
  body-sm:     { fontFamily: Inter, fontSize: 14px, fontWeight: '400', lineHeight: 20px }
  data:        { fontFamily: Space Grotesk, fontSize: 15px, fontWeight: '500', lineHeight: 20px, fontVariantNumeric: tabular-nums }  # set/rep/load rows, table cells
  label:       { fontFamily: Space Grotesk, fontSize: 12px, fontWeight: '500', lineHeight: 16px, letterSpacing: '0.08em', textTransform: uppercase }
rounded:
  sm: 0.1875rem    # ~3px
  DEFAULT: 0.25rem # 4px  (--radius, base geometry)
  lg: 0.5rem       # 8px  (cards, inputs, sheets)
  xl: 0.75rem      # 12px (large surfaces, goal cards)
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 16px           # inline padding on phones
  content-max: 560px     # app shell caps here on tablet/desktop; full-width with gutters on phones
  touch-min: 44px        # absolute minimum tap target
  control-h: 48px        # primary buttons, list rows, log fields
  control-h-compact: 40px
  top-bar-h: 56px
  bottom-nav-h: 64px     # + safe-area-inset-bottom
---

# Design System: Telos (mobile-first)

## Brand & Thesis
Telos exists to serve a user's **goal** — staying fit, building muscle, getting strong, bodybuilding — not just to count reps. The identity should feel **calm, technical, and purposeful**: a near-black cool base, a single living-green accent for progress, depth from tonal layering rather than shadow. It carries the family's *Corporate / Modern / Minimal* register, tuned for a phone held in one hand between sets — fast, legible, unfussy. It is never loud, gamified, or "hype-fitness."

**Signature — the Telos arc.** The one memorable element: a thin accent **arc** (a partial ring) that expresses *progress toward a target* — program/week completion, weekly volume vs. the goal's target, bodyweight trending toward a goal. It's the recurring visual rhyme across Today, Program, and Progress. Keep it thin (3–4px stroke), accent-colored on an `outline-variant` track, with the value as a tabular-figure `metric` in the center. Spend the design's boldness here; keep everything around it quiet.

## Platform & PWA
Mobile-first, installable PWA — **assume a phone first, scale up gracefully.**
- **Installable & standalone:** web app manifest (name, icons, `theme_color` = `--surface`, `background_color` = `--surface`, `display: standalone`). The chrome is the app's, not the browser's.
- **Offline-first UX:** every screen works offline; show a quiet, persistent sync indicator (a chip in the top bar), never a blocking spinner. Log entries save locally and reconcile silently.
- **Safe areas:** respect `env(safe-area-inset-*)`. The bottom nav and any sticky action bar pad for the home indicator; the top bar pads for the notch.
- **Reach:** primary actions live in the bottom third (thumb zone). Destructive or rare actions go up top.

## Theming
A single attribute on `<html>` drives everything; tokens do the rest (no per-component overrides):
- `data-theme="dark | light"` — **dark is the default.** A `ThemeProvider` resolves a 3-state preference (System / Light / Dark) persisted to `localStorage['telos-theme']`, respects `prefers-color-scheme`, and sets the attribute. A boot script in `index.html` applies it before React mounts to prevent a flash.
- **No `data-app`.** Telos is standalone with one fixed accent, so the suite's per-app accent system is dropped entirely.

## Colors
The family's **Material-3 tonal** palette: a deep cool-neutral base where elevation is a step up the `surface-container-*` ramp (higher = lighter), not a shadow.
- **Surfaces (dark):** `#0a0f10` base → `#131b1c` (card) → `#182123` (hover/muted) → `#1d2729` (sheets/menus). Light inverts to `#f4f8f9` → `#ffffff` → `#e7eef0` → `#dfe8ea`.
- **Text:** `on-surface #dce7ea`, secondary `on-surface-variant #a2adaf` (light `#161d1f` / `#41494b`).
- **Outlines:** hairline `outline-variant #3f4a4c` (light `#c4ced0`) — boundaries come from these thin lines plus the tonal step, not shadow.
- **Primary (Telos green):** `#8fd6a8` dark / `#2e6a47` light — primary actions, the arc, active states, focus rings, the live data series in charts.
- **Semantic:** `error #fa746f` (light `#b3261e`), `success #7fd1a8`, `warning #e8c97a`. Because `success` sits near the accent, reserve it for explicit status (PR hit, streak kept) and never as a second brand color. Use `warning` for fatigue/deload nudges, `error` only for genuine problems.

## Typography
**Space Grotesk** for headings, labels, and *all numerics* (geometric, technical); **Inter** for body. Numerics use **tabular figures** everywhere they're compared or updated live — set/rep/load rows, timers, chart axes, the big `metric-xl` readout. Micro-labels are uppercase Space Grotesk at `0.08em`. There should be exactly one `metric-xl` per screen at most — the hero number — so it reads as the focal point.

## Elevation & Depth
Depth is **tonal**: rising elements step up the container ramp. Boundaries are thin `outline-variant` hairlines. Real shadows are reserved for true overlays only — **bottom sheets, menus, dialogs, toasts**. Cards never cast shadows; on press they step one tonal level lighter with an accent-tinted border. (On touch there's no hover — use a brief pressed/active state instead.)

## Shape & Geometry
Soft but structured. Base radius **4px** (`--radius`); standard controls/badges 4px; cards, inputs, and bottom sheets **8px** (`lg`); large surfaces like goal-selection cards **12px** (`xl`); pills/avatars/arc-caps `full`. Bottom sheets round only their **top** corners (`xl`).

## Layout & Navigation
Mobile-first, single column, **8px grid**, `16px` gutters. On tablet/desktop the app shell caps at `content-max` (560px) and centers — Telos stays a focused column, not a sprawling dashboard.

**The shell (Telos-specific — there is no shared SuiteTopBar):**
- **Top bar (56px):** screen title in `title`, an optional context action (e.g., date, edit) on the right, plus the sync chip and a small avatar/menu. Background `surface-container` at ~85% with blur and a single `outline-variant` bottom hairline. Minimal — navigation does not live here.
- **Bottom tab nav (64px + safe area):** the primary navigation. Five destinations: **Today · Program · Log · Progress · Profile.** Active tab uses the accent (icon + label + a short top indicator bar); inactive uses `on-surface-variant`. Labels are `label`-style, always shown.
- **Primary action:** the **Log** center tab doubles as the workout entry point; during onboarding/empty states a full-width accent button ("Start today's workout") sits in the thumb zone.
- **Active-workout mode:** a sticky bottom **action bar** (above the home indicator) holds the rest timer and "Log set" / "Finish" — replacing the tab bar while a session is in progress so the screen stays focused.

## Components
Token-driven, shadcn/Radix-compatible — all read the CSS variables, so theme swaps need no component edits. Family components are kept but resized for touch and joined by fitness-specific ones.

**Carried from the family (touch-tuned):**
- **Buttons** — `primary` (accent fill, `on-primary` text), `secondary` (muted surface + outline), `ghost`, `destructive`. **48px tall**, 4px radius, Space Grotesk label, full-width by default on mobile.
- **Cards** — `surface-container`, 1px `outline-variant`, 8px radius; pressed → one tonal step up + accent-tinted border.
- **Inputs / Select / Textarea** — `surface-container-low` fill, `outline-variant` border; focus = accent border + soft ring (accent ~22%). 48px tall.
- **Badges / chips** — neutral, `accent`, `success`, `warning`, `danger` variants (tinted bg + matching text).
- **Tabs** — accent underline indicator (used *within* screens, e.g., Progress sub-views; not for primary nav).
- **Toasts** — `surface-container-highest`, 8px radius, real shadow, anchored above the bottom nav; animated via `tailwindcss-animate`.

**Mobile patterns (replace desktop equivalents):**
- **Bottom sheets** instead of center dialogs for pickers, exercise swaps, and confirmations — `surface-container-highest`, top corners `xl`, a grab handle, real shadow, drag-to-dismiss. The only place center dialogs remain is destructive confirmation.
- **Segmented control** for small mutually-exclusive choices (e.g., units kg/lb, RPE vs RIR).
- **Stepper + numeric pad** for fast load/rep entry — large +/- targets (≥44px) flanking a tabular field; tapping the field opens a numeric keypad.

**Fitness-specific:**
- **Goal cards** — the four goals (Stay Fit · Build Muscle · Strength · Bodybuilding) as selectable `xl`-radius cards; selected state = accent border + tint, with a one-line plain-language summary of what that goal changes (frequency, intensity).
- **Exercise card** — name, target sets×reps, equipment chip; tap → exercise detail.
- **Exercise detail** — `metric`/`body` form **cues as a short numbered list** (numbering is justified here: clean execution is a real sequence), a **Common mistakes** block (bulleted, `warning`-tinted markers), and a **Substitute** callout card (accent-tinted) offering an easier/alternative movement with a one-tap swap.
- **Set-logger row** — `data`-styled: set # · weight · reps · RPE, with steppers; completed sets get a subtle accent left-border; the working set is highlighted (`surface-container-high`).
- **Rest timer** — a compact ring (a small sibling of the Telos arc) counting down in the sticky action bar, with ±15s controls.
- **Check-in** — energy / stress / sleep / motivation / soreness as labeled **sliders or segmented scales**; calm, quick, never clinical. (Reuses the family's slider pattern.)
- **Bodyweight entry & trend** — single numeric entry; the trend view shows the **smoothed line** prominently and raw points faintly (see Charts).
- **Progress cards** — a Telos arc (goal/volume progress) plus a sparkline; tap → full chart.
- **Empty states** — a single clear line + one primary action (see Voice).

## Data Visualization (the charts layer)
Derived entirely from tokens so charts read as part of the system — Telos's dashboards (bodyweight trend, weekly volume, estimated-1RM progression) depend on this.
- **Lines (trend, 1RM):** primary series stroke = `--primary`, **1.5–2px**, smooth but honest (no heavy easing). Optional area fill = `color-mix(in srgb, var(--primary) 14%, transparent)`. For bodyweight, draw the **moving-average line in accent** and raw daily points as faint `on-surface-variant` dots at ~40% — the trend leads, noise recedes.
- **Bars (volume):** accent fill for the current/primary metric; comparison or prior periods in `surface-container-highest`. Thin or no gap stroke.
- **Grid & axes:** gridlines = `outline-variant` hairlines, used sparingly (horizontal only is usually enough). Axis labels = `body-sm`/`data` in `on-surface-variant`, **tabular figures**. No chart borders.
- **Markers:** PRs/milestones = a small accent dot or the `success` chip; deload/fatigue flags = `warning`. Use semantic color only at thresholds, never decoratively.
- **Tooltip:** `surface-container-highest`, 8px radius, real shadow (overlay exception), tabular values.
- **Sparklines on cards:** stroke-only accent line, no axes, ~24–32px tall.
- **Tone:** thin strokes, generous whitespace, no gradients-for-drama, no 3D. Charts should feel like instruments, not infographics.

## Motion
Subtle and purposeful, via `tailwindcss-animate`; always respect `prefers-reduced-motion`.
- Tab/route changes: quick fade/slide (~150ms).
- Bottom sheets: spring up; toasts: fade+rise.
- Logging a set: a brief accent pulse on the row + light haptic (where supported) — confirmation, not celebration.
- The Telos arc animates from its previous value to the new one on load. That's the one orchestrated moment; keep the rest quiet.

## Iconography
Simple line icons (lucide pairs naturally with shadcn) at consistent 1.5px stroke, sized to the 44px target with optical padding. Icons label-pair in the bottom nav; standalone icons always have an accessible label.

## Accessibility
A quality floor, not an add-on: ≥44px tap targets, visible accent focus rings on every interactive element, `prefers-reduced-motion` honored, AA contrast in both themes (verify accent fills carry `on-primary` text at AA), one-handed reachability for primary actions, and legible body text (Inter ≥15px). Numeric data uses tabular figures so values don't jump as they update.

## Voice & Copy
Plain, active, encouraging without hype — copy is design material.
- Buttons say what happens: "Log set," "Finish workout," "Swap exercise" — and keep the name through to the resulting toast ("Set logged").
- **Empty states invite action:** "No workout yet today. Start one →" — never a dead end.
- **Errors are direct and blameless:** say what happened and the fix, in the app's voice, no apologies.
- **Wellbeing tone (matches the build brief):** frame bodyweight as a neutral trend, never a target to minimize; present substitutes and regressions as smart training, never failure; deload/recovery nudges are supportive ("Your recovery's been low — here's a lighter session"), never alarming. No streak-shaming.

## Implementation
- **Tailwind v4**, CSS-first. Canonical source: a self-contained `globals.css` in the app's `src/` (Telos does **not** copy the suite's `src/suite/` kit — it's standalone). Tokens are plain CSS custom properties; `@theme inline` exposes them as utilities (`bg-surface-container`, `text-on-surface-variant`, `border-outline-variant`, `bg-primary`, `rounded-lg`, `font-head`, …).
- **shadcn bridge:** map `--background`, `--card`, `--muted`, `--primary`, `--destructive`, `--ring`, `--radius` so shadcn/Radix components work unchanged.
- **Fonts:** bundle `@fontsource/space-grotesk` + `@fontsource/inter`; expose as `--font-head` / `--font-sans`.
- **Tints:** always `color-mix(in srgb, var(--primary) <pct>%, transparent)` — never hard-coded rgba.
- **Safe areas:** use `env(safe-area-inset-*)` on the top bar, bottom nav, and sticky action bar.
- **Theme boot script** in `index.html` reads `localStorage['telos-theme']` + `prefers-color-scheme` and sets `data-theme` before React mounts.
- **V2 note:** when Telos migrates to React Native (Android), this token set ports directly — it's the same Material-3 tonal system; only the platform primitives (nav, sheets, gestures) get native equivalents. Keep nothing web-only in the token layer.
