# Telos Mobile → Web Visual Parity Spec

Source of truth: `web/src/globals.css`, `design.md`, `web/src/components/**`, `web/src/screens/**`.
Target: `mobile/app/**`, `mobile/components/**`, `mobile/lib/theme.ts`, `mobile/lib/theme-context.tsx`.

This file is self-sufficient: restyle agents should need only this file + the mobile files they're editing (cross-reference the web paths cited here only if something is ambiguous).

---

## 0. Ground truth token values (do not re-derive, copy exactly)

Dark palette (`mobile/lib/theme.ts` `darkColors`) already matches web `:root` 1:1 — **no changes needed to color hex values**. Light palette also already matches `[data-theme="light"]` 1:1. The gaps are entirely in **typography, geometry constants, component composition, and screen structure**, detailed below.

```
surface #0a0f10   surfaceBright #232e30   surfaceContainerLowest #000000
surfaceContainerLow #0e1416   surfaceContainer #131b1c
surfaceContainerHigh #182123   surfaceContainerHighest #1d2729
onSurface #dce7ea   onSurfaceVariant #a2adaf
outline #6c777a   outlineVariant #3f4a4c
primary #8fd6a8   onPrimary #06351f   primaryContainer #21543a   onPrimaryContainer #abf2c4
secondary #b2cbd0   tertiary #accdf0
error #fa746f   onError #490006   success #7fd1a8   warning #e8c97a
```

---

## 1. TYPE SCALE — web `.type-*` → mobile `makeType` keys

Web scale lives in `web/src/globals.css` lines 155–199 (and `design.md` `typography:`). Mobile's `makeType` (`mobile/lib/theme.ts`) currently only has 7 keys and several **don't match web's px values**. Rebuild `makeType` to carry all 8 web scales, 1:1.

| Web class | fontFamily | size | lineHeight | weight | letterSpacing | tabular-nums | Mobile key (add/fix) |
|---|---|---|---|---|---|---|---|
| `.type-metric-xl` | Space Grotesk | 44 | 48 | 600 | -0.02em | yes | **add** `metricXl` |
| `.type-headline-lg` | Space Grotesk | 28 | 36 | 600 | -0.01em | — | **fix** `display` (currently 28/34, weight unset — set lineHeight 36, fontWeight 600, letterSpacing -0.01em) |
| `.type-headline-md` | Space Grotesk | 22 | 30 | 500 | — | — | **add** `headlineMd` |
| `.type-title` | Space Grotesk | 18 | 26 | 600 | — | — | **fix** `title` (currently 18/24 — set lineHeight 26; font is `SpaceGrotesk_600SemiBold` already, good) |
| `.type-body-lg` | Inter | 16 | 26 | 400 | — | — | **fix** `bodyLg` (currently 16/24 — set lineHeight 26) |
| `.type-body-md` | Inter | 15 | 24 | 400 | — | — | **add** `bodyMd` (mobile's current `body` is 14/20 = web's body-sm, see below — keep `body` mapped to body-sm and add a distinct `bodyMd` for the many web body-md usages) |
| `.type-body-sm` | Inter | 14 | 20 | 400 | — | — | `body` (already correct: 14/20) |
| `.type-data` | Space Grotesk | 15 | 20 | 500 | — | yes | `data` (already correct: `SpaceGrotesk_500Medium` 15/20 — add `fontVariant: ["tabular-nums"]`) |
| `.type-label` | Space Grotesk | 12 | 16 | 500 | 0.08em (~1.9px @12px) | — | **fix** `label` (currently `fontFamily: fonts.bodyMedium` i.e. Inter — must be `fonts.headMedium` i.e. **Space Grotesk 500**; currently no `textTransform: "uppercase"` — web's `.type-label` is always-uppercase, so either bake `textTransform: "uppercase"` into the style or keep screens' manual `.toUpperCase()` calls consistent — prefer baking it into the style so every label auto-uppercases like web) |
| — (no web equiv, internal) | Inter | 14 | 20 | 500 | — | — | `bodyVariant` — keep, but this is really just `body` + `onSurfaceVariant` color; consider deriving it from `body` instead of a separate literal |

Concrete replacement for `mobile/lib/theme.ts`:

```ts
export const makeType = (c: Palette) =>
  StyleSheet.create({
    metricXl: { fontFamily: fonts.head, fontSize: 44, lineHeight: 48, letterSpacing: -0.88, color: c.onSurface, fontVariant: ["tabular-nums"] },
    display: { fontFamily: fonts.head, fontSize: 28, lineHeight: 36, letterSpacing: -0.28, color: c.onSurface },       // headline-lg
    headlineMd: { fontFamily: fonts.headMedium, fontSize: 22, lineHeight: 30, color: c.onSurface },                    // headline-md (weight 500!)
    title: { fontFamily: fonts.head, fontSize: 18, lineHeight: 26, color: c.onSurface },                                // weight 600
    bodyLg: { fontFamily: fonts.body, fontSize: 16, lineHeight: 26, color: c.onSurface },
    bodyMd: { fontFamily: fonts.body, fontSize: 15, lineHeight: 24, color: c.onSurface },
    body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: c.onSurface },                                 // body-sm
    bodyVariant: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: c.onSurfaceVariant },
    label: { fontFamily: fonts.headMedium, fontSize: 12, lineHeight: 16, color: c.onSurfaceVariant, letterSpacing: 0.96, textTransform: "uppercase" },
    data: { fontFamily: fonts.headMedium, fontSize: 15, lineHeight: 20, color: c.onSurface, fontVariant: ["tabular-nums"] },
  });
```

Note: RN `letterSpacing` is in **px, not em** — convert each `em` value at its own font size (`-0.02em × 44px = -0.88px`, `-0.01em × 28px = -0.28px`, `0.08em × 12px = 0.96px`).

`fonts.head` = `SpaceGrotesk_600SemiBold`, `fonts.headMedium` = `SpaceGrotesk_500Medium` — both already loaded (`mobile/app/_layout.tsx`); no new font weights needed since web only ever uses 400/500/600 for either family and both 500/600 Space Grotesk weights are already present.

---

## 2. TOKENS

### Radii (`mobile/lib/theme.ts` `radius`) — already correct, keep:
```
sm: 3    (web --radius-sm 0.1875rem = 3px)
base: 4  (web --radius 0.25rem = 4px)   — buttons, badges, inputs, steppers, chips
lg: 8    (web --radius-lg 0.5rem = 8px) — cards, sheets (body), inputs on web (Input.tsx uses rounded-lg=8, mobile sign-in input uses radius.base=4 — FIX, see §5)
xl: 12   (web --radius-xl 0.75rem = 12px) — onboarding/goal cards, bottom-sheet TOP corners only
pill: 999
```
**Radius corrections needed in mobile code:**
- `mobile/app/sign-in.tsx` input `radius.base` (4px) → web Input.tsx is `rounded-lg` (8px). **Fix to `radius.lg`.**
- `mobile/app/onboarding.tsx` `.input` uses `radius.base` (4px) → web onboarding Input uses the same 8px Input component. **Fix to `radius.lg`.**
- `mobile/app/(tabs)/profile.tsx` `.input` (height/birthYear) `radius.base` → web uses the 8px `Input`. **Fix to `radius.lg`.**
- Card-like surfaces across mobile screens (`today.tsx` `.card`, `program.tsx` `.card`/`.row`, `log.tsx` `.card`/`.row`, `progress.tsx` `.card`) already correctly use `radius.lg` — good, keep.
- `Sheet.tsx` panel: `borderTopLeftRadius/borderTopRightRadius: radius.xl` — correct (web BottomSheet is `rounded-t-xl`).

### Control heights (`design.md` spacing:) — already defined in theme, verify usage:
```
touch-min: 44
control-h: 48       — primary Button height (mobile Button.tsx: 48 ✓)
control-h-compact: 40 — Segmented segment height (mobile Segmented.tsx seg: 40 ✓); web Button "compact" size = 40 (mobile Button.tsx has NO "compact" size — ADD one, see §5)
top-bar-h: 56       — mobile topbars already 56 ✓ (today/program/log/progress/profile/exercise-detail/workout all use height:56)
bottom-nav-h: 64    — mobile Tabs has NO explicit tabBarStyle.height — ADD height:64 (see §4)
```

### Spacing/gutters
`space(n) = n*4`, gutter = `space(4) = 16px` — matches web `--gutter: 16px`. Already consistent across mobile screens' `padding: space(4)`. Keep using `space()` — no change.

### Tint-primary formulas (web `.tint-primary-8/14/22`)
Web: `color-mix(in srgb, var(--primary) X%, transparent)` composited **over whatever sits behind it** (usually `surface` or `surfaceContainer`). React Native has no `color-mix`; pre-flatten to RGBA using the primary hex directly — this is mathematically identical to `color-mix(... X%, transparent)` when rendered over any backdrop, since RN natively composites alpha the same way:

```
tint-primary-8  → rgba(143, 214, 168, 0.08)   // #8fd6a8 @ 8%
tint-primary-14 → rgba(143, 214, 168, 0.14)
tint-primary-22 → rgba(143, 214, 168, 0.22)
```
(Light theme primary is `#2e6a47` → `rgba(46, 106, 71, X)` if a light-mode tint is ever needed; light mode doesn't currently use these tints on web except the same class names, so derive from `colors.primary` at runtime, not a hardcoded dark-only hex — i.e. compute `${colors.primary}` → parse to rgb → apply alpha, or maintain a small helper `withAlpha(hex, alpha)` in `theme.ts` and call `withAlpha(colors.primary, 0.08 | 0.14 | 0.22)`.)

Same pattern for warning/error/success tints seen on web (`color-mix(in srgb, var(--warning) 8%, transparent)` etc. in Today's `EngineNote`, Program's engine-note card, ExerciseDetail's substitute callout):
```
warning @ 8%  → rgba(232, 201, 122, 0.08)   (dark) — used for EngineNote/deload card background
warning @ 40% (border, mixed with outline-variant) → approximate as rgba(232,201,122,0.4) over outlineVariant, or just use a flat warning-tinted border color at ~40% alpha
primary @ 30% (border) → rgba(143, 214, 168, 0.30)
error/success @ 14%/30% → same formula
```

Add to `mobile/lib/theme.ts`:
```ts
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
```

### Card border+bg combo (canonical, from web `Card.tsx`)
```
background: surfaceContainer
border: 1px solid outlineVariant
borderRadius: 8 (radius.lg)
padding: typically 16 (p-4) or 14 (p-3.5 for ExerciseCard)
pressed state (pressable cards): background → surfaceContainerHigh, border → color-mix(primary 40%, outlineVariant) ≈ withAlpha-blend; mobile can approximate the pressed border as a flat `colors.primary` at reduced opacity via `withAlpha(colors.primary, 0.4)` composited, or simpler: just switch border color to `colors.primary` outright on press (visually close enough, no shadow either way — never add shadow to cards per design.md)
```

### Badge tone → bg/border/text (web `Badge.tsx`, 5 variants — mobile only has 4, missing "danger"/"accent" naming mismatch)
```
neutral: bg surfaceContainerHigh, border outlineVariant, text onSurfaceVariant
accent:  bg tint-primary-14 (rgba primary 0.14), border rgba(primary,0.30), text primary
success: bg rgba(success,0.14), border rgba(success,0.30), text success   [mobile currently: bg transparent, border success, text success — WRONG, fix bg to rgba(success,0.14) and border to rgba(success,0.30) to match web, i.e. drop the primaryContainer-based "primary" tone entirely, see §5]
warning: bg rgba(warning,0.14), border rgba(warning,0.30), text warning
danger:  bg rgba(error,0.14), border rgba(error,0.30), text error   [mobile has no "danger" tone key — add it; mobile's current "primary" tone (bg=primaryContainer/border=primary/text=onPrimaryContainer) doesn't exist on web at all — remove or repurpose]
```
Badge text: web `.type-label` (Space Grotesk 500, 12/16, uppercase, 0.08em) — mobile Badge text currently uses `fonts.bodyMedium` (Inter) 11px — **fix to Space Grotesk 500, 12px, uppercase** to match `type.label`.
Badge padding: web `px-2 py-0.5` = horizontal 8px, vertical 2px; radius `rounded` = 4px (web Badge is NOT pill-shaped — it's 4px radius). Mobile Badge uses `radius.pill` — **fix to `radius.base` (4px)**.

---

## 3. PER-SCREEN DELTAS

### 3.1 Sign-in (`mobile/app/sign-in.tsx` vs `web/src/screens/SignIn.tsx` + `web/src/i18n/locales/en/signin.json`)
- [ ] **No register mode at all.** Web has a `mode: "signin" | "register"` toggle. Add the same: a `mode` state, a `toggleMode()` that flips it and clears the error, and copy switches:
  - signin: password placeholder `t("signin.passwordPlaceholder")`, submit label `t("signin.signIn")`, autoComplete `"password"` (RN: `"current-password"` platform equivalent)
  - register: password placeholder `t("signin.createPasswordPlaceholder")` ("Create a password"), submit label `t("signin.createAccount")` ("Create account"), autoComplete `"new-password"` (RN: `"new-password"`... RN TextInput supports `textContentType="newPassword"` on iOS / `autoComplete="password-new"` on Android)
  - below the form, add the mode-toggle text button: signin→register shows `t("signin.noAccount")` ("No account? Create one"); register→signin shows `t("signin.haveAccount")` ("Already have an account? Sign in"). **These keys already exist in `mobile/lib/i18n/locales/en.json` under `signin.*`** (confirmed present) — just wire them up.
  - Need a `registerWithEmail` call — mobile's `lib/auth.tsx` likely only exports `signInWithEmail`; add `registerWithEmail(email, password)` calling Firebase `createUserWithEmailAndPassword` (mirror `web/src/lib/firebase.ts`'s `registerWithEmail`).
  - Error-code mapping: web maps `auth/wrong-password|invalid-credential|user-not-found` → wrongPassword copy, `auth/email-already-in-use` → emailInUse, `auth/weak-password` → weakPassword, `auth/invalid-email` → invalidEmail, else generic. Mobile currently only has a crude `/auth\//.test()` → wrongPassword-or-generic. **Replace with the same explicit code switch** (all copy keys already exist in mobile's `signin.errors.*`).
- [ ] **No Arc/brand mark.** Web shows an `Arc value={0.75} size={120}` above the headline as a pure decorative brand mark. Mobile has no Arc component at all yet (§5 — build it first) — add a static `Arc value={0.75} size={120}` above the title, matching web exactly (decorative, no label/metric).
- [ ] **No Google "G" SVG logo.** Web's Google button shows the real 4-color Google "G" mark inline (`viewBox 0 0 18 18`, 4 paths in primary/secondary/warning/error). Mobile secondary Google button uses only a text label. Add the equivalent as an `react-native-svg` `<Svg>` with the same 4 `<Path>`s (colors: primary, secondary, warning, error — these map directly to `colors.primary/secondary/warning/error` from the palette, NOT web's literal hexes, so it re-themes automatically) at 18×18, to the left of the label.
- [ ] **Divider "or"** exists on mobile already (`styles.divider`) — keep, but only rendered `if (googleAvailable)`; web always shows Google button + divider regardless of platform capability. That's fine as a platform-specific omission (native Google Sign-In availability check) — no change needed, just note it's intentional.
- [ ] **Field/label pattern**: web wraps each input in a `Field` component with a `type-label` caption above it ("Email", "Password"). Mobile currently uses bare `TextInput` with only a `placeholder`, no persistent label. Add label captions (`type.label` style, e.g. `t("signin.email")`) above each field to match web's `Field` composition — **note**: mobile's `en.json` may need an `"email": "Email"` key added under `signin.*` if not present (web has it in `signin.json`).
- [ ] Input height/radius/font: web `Input` = 48h, `rounded-lg` (8px), `text-[16px]`, bg `surfaceContainerLow`, border `outlineVariant`, focus → border `primary` + ring `rgba(primary,0.22)`. Mobile input currently: 48h ✓, `radius.base` (4px) ✗ → fix to `radius.lg` (8px), bg `colors.surfaceContainer` ✗ → fix to `colors.surfaceContainerLow`, font size 16 ✓. No focus-ring treatment on mobile (RN doesn't have `:focus-visible` the same way) — acceptable to skip or add an `onFocus`-driven border-color swap to `colors.primary` for parity.

### 3.2 Onboarding (`mobile/app/onboarding.tsx` vs `web/src/screens/Onboarding.tsx`)
Structure already matches closely (6 steps, same order, same field names, revisit-mode prefill). Deltas:
- [ ] **Card radius**: web goal/experience `SelectCard`-equivalent (`GoalCard`/`ExperienceCard`) is `rounded-xl` (12px) — mobile's `styles.card` already uses `radius.xl` ✓. Good, no change.
- [ ] **Selected-card treatment**: web selected state = `tint-primary-8` background (rgba(primary,0.08)) + border `rgba(primary,0.5)`. Mobile selected state = `backgroundColor: colors.primaryContainer` (a solid opaque fill, `#21543a`) + `borderColor: colors.primary` — **too strong/opaque vs. web's subtle tint.** Fix `cardSelected` to `{ borderColor: colors.primary, backgroundColor: withAlpha(colors.primary, 0.08) }`.
- [ ] **Badge/freq-chip selected state**: web selected freq badge = text `primary`, border `rgba(primary,0.4)`, bg `rgba(primary,0.12)`; unselected = text `onSurfaceVariant`, border `outlineVariant`, bg `surfaceContainerHigh`. Mobile's `badgeSelected` = border `primary` + bg `"transparent"`, text via `badgeTextSelected: onPrimaryContainer`. Fix to bg `withAlpha(colors.primary, 0.12)` and text `colors.primary` for closer parity.
- [ ] **Equipment chip selected state**: web = `tint-primary-14` bg + border `rgba(primary,0.4)` + text `primary`. Mobile `chipOn` = bg `primaryContainer` (opaque) + border `primary`, text `onPrimaryContainer`. Fix bg to `withAlpha(colors.primary, 0.14)`, text to `colors.primary`.
- [ ] **Progress dots**: web dot sizing: current = `w-5 h-1.5` (20×6) bg-primary; done = `w-1.5 h-1.5` (6×6) bg-primary opacity-40; upcoming = `w-1.5 h-1.5` outline-variant. Mobile dots: `dot` 6×6 outlineVariant, `dotActive` width 20 primary (height still 6 — OK, matches since base height is 6), `dotDone` bg primary opacity 0.4 (via RN `opacity` prop on the View — check it's applied, currently `dotDone: { backgroundColor: colors.primary, opacity: 0.4 }` ✓ this matches). No change needed — already correct.
- [ ] **Bottom action bar** matches web's fixed bottom bar composition (back ghost button + primary continue button, safe-area bottom, top hairline) — mobile's `styles.bottom` already mirrors this reasonably (border-top hairline, `paddingBottom: space(2)` — verify this also accounts for the safe-area inset via `SafeAreaView edges={["bottom"]}`, which it does). No structural change needed, but confirm back button width matches web's icon-only `ChevronLeft` ghost button (mobile uses a text `"‹ Back"` — acceptable localization-safe substitute, but consider using an icon-only chevron for tighter parity since web's back button on step 0 is icon-only with no label).
- [ ] Textarea height: web `Textarea` = `min-h-24` (96px) + `py-3` — mobile textarea `minHeight: 96` ✓ already matches.

### 3.3 Today (`mobile/app/(tabs)/today.tsx` vs `web/src/screens/Today.tsx`) — biggest structural gap
- [ ] **Missing weekly Arc ring entirely.** Web shows a `<Arc value={weekCompleted/weekTotal} size={96} strokeWidth={3.5} metric="{done}/{total}" label={t("weekLabel")} />` to the right of the hero card, in a `flex items-start gap-4` row. Mobile shows only a text chip (`weekChip`) in the top bar. **Add**: build the Arc component (§5) and place a `size={96} strokeWidth={3.5}` instance beside the hero card (a `flexDirection: "row", alignItems: "flex-start", gap: space(4)` wrapper; hero card `flex:1`, Arc `flexShrink:0`), metric = `${weekDone}/${weekTotal}`, label = `t("today.weekLabel")` (add key if missing, web's key is `today:weekLabel`).
- [ ] **No SyncChip in the top bar** as a real component — mobile approximates with a plain `Text` (`styles.syncChip`) showing only the "syncing"/"queued" states, missing the "offline" (CloudOff icon) and "all synced" (Cloud icon, shown by default when idle) states entirely. Build a proper `SyncChip` (§5) with 4 states (offline / queued-offline / syncing / synced) each as a pill: `border-radius: pill`, `paddingHorizontal: 8, paddingVertical: 4`, `type.label`-styled text, icon (12px, strokeWidth 1.5 via `lucide-react-native` or `@expo/vector-icons` equivalents: `cloud-offline`/`cloud`/`sync` Ionicons already used elsewhere in the app) + gap 6px. States:
  - offline: bg `surfaceContainerHigh`, border `outlineVariant`, text `onSurfaceVariant`, icon cloud-off
  - offline+pending: same bg/border/text, append `· {pending}`
  - syncing (flushing or pending>0): bg `withAlpha(primary,0.14)`, no border, text `primary`, icon spinning refresh
  - synced (idle, default): no bg/border, text `onSurfaceVariant`, icon cloud
- [ ] **EngineNote card styling mismatch.** Web: `rounded-lg px-4 py-3 border`, warning variant = border `rgba(warning,0.4)-ish mixed with outlineVariant`, bg `rgba(warning,0.08)`, text `warning`; default/accent variant = border `rgba(primary,0.3)-ish`, bg `tint-primary-8` (rgba(primary,0.08)), text `primary`. Mobile's `noteBanner` = bg `surfaceContainerHigh`, border `outlineVariant` (no distinct warning styling at all — every note looks identical regardless of code), left-border 2px primary always. **Fix**: branch on `isWarningNote(code)` (code starts with `deload_` or equals `eased_today` — same helper web uses) and apply the two distinct treatments above; drop the flat `borderLeftWidth`/`borderLeftColor` in favor of the full-border tint treatment (no left-accent-bar on web's EngineNote — that's a different pattern web doesn't use here).
- [ ] **Hero card composition**: web hero card (when a workout exists) shows: `type-headline-md` workout name, `type-body-sm` summary line (`"{count} exercises · ~{minutes} min"` via `hero.summary`), a bulleted list of the **first 3 exercises** (`name` bold + `sets×reps` right-aligned via flex), a "+N more" line if >3, then the Start/Resume button. Mobile hero card only shows: exercise count text + warmup count, no per-exercise preview list, no "+N more" line, and no `estimateMinutes()` computation for the summary. **Add**: port `estimateMinutes(workout)` (sum of `targetSets * (restSeconds + 45)` per exercise, /60, rounded to nearest 5, min 5) and render the first-3-exercises list with `name` (medium weight, truncated) + `sets×reps` (shrink-0), plus overflow line `t("today.hero.more", {count})`.
- [ ] **noProgram / restDay branches**: web has 4 distinct hero-card states (loading / noProgram-with-"View program"-ghost-button / todayWorkout / restDay-with-"View program"-ghost-button). Mobile collapses "no workout" into a single `restDay`/`weekComplete` card with no "View program" link-out. Add the ghost "View program" button (`variant="ghost"`, navigates to `/program`) to the rest-day/no-program empty states, matching web's `t("viewProgram")` + chevron-right affordance.
- [ ] **Quick action cards**: web quick-action cards are `Card pressable` (bg `surfaceContainer`, border `outlineVariant`, radius 8, `p-4`) with `type-label` caption + `type-body-md font-medium` action line. Mobile's `.quick` card matches structurally (bg surfaceContainer / border outlineVariant / radius.lg / padding space(4)) — reasonably close already; just verify caption uses the fixed `label` type style (Space Grotesk, uppercase) once §1 lands, rather than the current ad-hoc `quickLabel` style (which duplicates label styling inline — replace with `type.label`).
- [ ] Greeting line (`t("today.greeting", {name})`) exists only on mobile — harmless addition, not present on web, no action needed (keep, it's an acceptable native enhancement) — **do not remove**, just don't treat its absence on web as a bug.

### 3.4 Program (`mobile/app/(tabs)/program.tsx` vs `web/src/screens/Program.tsx`)
- [ ] **No header/Arc card at all.** Web wraps the program header in a `Card p-4` with: `type-headline-md` goal display name + phase `Badge` (warning tone if phase is `deload`, else neutral... actually neutral/warning per `PHASE_VARIANTS`), a `type-body-sm` week/split line (`weekLine`: "Week {n} of {days}× — {split}"), and an `Arc size={88}` showing `{completed}/{total}` week-workout completion with label `arcWeek`, laid out as `flex items-start gap-3` (text block flex-1, Arc shrink-0). Mobile only shows a plain uppercase text line (`{PHASE} · WEEK {n} · {days}×/WEEK`) with **no card wrapper, no badge, no Arc**. **Add**: the full header Card + Arc(88) + phase Badge composition.
- [ ] **No engine notes section.** Web shows the same warning/accent-tinted note cards (via `Card` with conditional warning border/bg) between the header and the workout list. Mobile has none. Add (can reuse the same EngineNote-style component built for Today, §3.3, as a shared component — see §5 recommendation to extract `EngineNoteCard` once, used by both Today and Program).
- [ ] **Workout row → collapsible WorkoutCard with exercise preview, not a flat Pressable row.** Web's `WorkoutCard`: header row (workout name `type-title` + status Badge + scheduled-day `type-body-sm`) is itself a button that expands/collapses; collapsed state shows up to 4 `type-data` exercise summary lines (`"{name} {sets}×{reps}"`) + "+N more"; expanded state renders full `ExerciseCard`s (see §5 — mobile has no `ExerciseCard` component); footer has a status-dependent action button (Start/Resume/View) inside the card. Mobile's `program.tsx` row is a single flat `Pressable` → whole row navigates straight to the workout, no expand/collapse, no exercise preview at all, no in-card action button (navigation only). **This is a significant composition gap** — rebuild `program.tsx`'s workout list using the same collapsible-card pattern:
  - `useState(false)` per-row expanded flag (render as a child component, not inline, so each row has independent state)
  - collapsed: first 4 exercises as `type.data`-styled one-liners + overflow line
  - expanded: full exercise cards (name, target sets×reps, equipment badge — build `ExerciseCard`, §5)
  - footer button inside the card: `planned` → secondary compact "Start workout"; `in_progress` → primary compact "Resume"; `completed`/`aborted` → ghost compact "View"
- [ ] **Regenerate button + confirm sheet missing.** Web has a footer `Button variant="secondary"` "Rebuild program" (RefreshCw icon) that opens a `BottomSheet` confirmation (title + body copy + primary "confirm/working" button + ghost "cancel"). Mobile has nothing. Add both the button and the `Sheet`-based confirm flow (mirror `handleRegenerate` calling `api.regenerate()`, toast success/fail).
- [ ] Empty/loading/error states: web wraps these in `AppShell` with a titled top bar reading "Program" (via i18n `nav.program`) — mobile already does this via its own `topbar` View; keep, no structural change, just confirm loading state shows the same centered spinner (already matches).

### 3.5 Log (`mobile/app/(tabs)/log.tsx` vs `web/src/screens/Log.tsx`) — mobile is missing 2 of 3 sections
- [ ] **Missing "Today" section entirely** (the primary Start/Resume-workout entry point + "Start empty workout" secondary button + rest-day message). Mobile's Log screen jumps straight to history. **Add** a `section` at the top mirroring web: `type.label` header "Today", then conditionally: `in_progress` workout → primary Button "Resume workout"; else today's `planned` workout → primary Button "Start today's workout"; else → `type.bodyVariant` "Rest day" text. Then always a `secondary` Button "Start empty workout" below (calls the same custom-workout creation flow as web: enqueue a new `workout` with `name: "Custom workout"`, `status: "in_progress"`, `scheduledFor: today`, `edited: true`, then navigate to it).
- [ ] **Missing "Quick log" section** (2-up grid of Bodyweight / Check-in cards opening the sheets). Mobile's Log screen has no bodyweight/check-in entry points at all (only Today tab has them). Add a `grid grid-cols-2`-equivalent (`flexDirection: "row", gap: space(3)`) pair of pressable cards (icon + `type.body-sm font-medium` label), wired to the same `BodyweightSheet`/`CheckInSheet` mobile already has built.
- [ ] **History section exists but composition differs slightly**: web history rows show workout name + `"{date} · {n} sets"` + status Badge (`success`/`neutral` tone only for completed/aborted) — mobile's existing row composition (`type.title` name, `type.bodyVariant` meta line, `Badge`) is structurally equivalent already; just verify the meta line format matches web's `"{date} · {n} sets"` (mobile currently shows `"{n} exercises · {n} sets"` — drop the exercise count to match web's simpler line, or keep as an intentional native enhancement — **recommend matching web exactly**: `{date} · {setCount} sets"`).
- [ ] History window: web fetches a rolling 14-day window (`daysAgoISO(14)` to today); mobile fetches 180 days (`localDate(-180)`). This is a behavioral (not visual) difference — flag for product decision, not required for visual parity, but note it since it changes what's likely to render. No visual fix needed unless product wants exact parity.

### 3.6 Progress (`mobile/app/(tabs)/progress.tsx` vs `web/src/screens/Progress.tsx`) — mobile flattens the tabbed structure
- [ ] **No tab bar (Overview / Weight / Strength / Recovery).** Web presents 4 sub-views behind an in-screen tab bar (`role="tablist"`, underline indicator: `absolute bottom-0 h-0.5 bg-primary rounded-full` under the active tab, `type-label text-[11px]`, `h-11` per tab, row has `border-b border-outline-variant`). Mobile instead stacks **all** sections vertically in one scroll (Energy, Weight, Weekly volume, Recovery, Strength — in a different order and every one always visible). **Rebuild as tabs**: add local `useState<Tab>("overview")`, render the same 4-tab bar (height 44 per segment, active = `onSurface` text + 2px primary underline bar spanning the full tab width at the bottom, inactive = `onSurfaceVariant`), and split content into 4 view-functions matching web's tab contents:
  - **Overview**: EnergyCard + weekly-volume bar chart (current-week bar highlighted in `primary`, others `surfaceContainerHighest`) + recent-workouts list (name, date · sets, volume)
  - **Weight**: composed chart (trend line + faint raw dots) + big `metric-xl` current-weight readout + 7-day-change line + "Log weight" button + recent-entries list
  - **Strength**: exercise-selector chips (up to 4) + per-exercise e1RM line chart + explainer text
  - **Recovery**: 30-day recovery-score area chart + 7-day-average line + tier sentence + "Check in" button + recent-check-ins list (with abbreviated E/St/Sl/M/So columns)
- [ ] **Charts are far simpler than web's.** Web uses `recharts` with horizontal-only gridlines (`outline-variant`), no vertical gridlines, `axisStyle` ticks in `onSurfaceVariant`/11px/Space-Grotesk-via-`.recharts-text`, tooltips (`surfaceContainerHighest` bg, 8px radius, real shadow — the one shadow exception per design.md), and semantically-colored series (primary line/area, `surfaceContainerHighest` bars for non-current). Mobile's `LineChart`/`BarChart` (react-native-svg, `mobile/components/charts/Charts.tsx`) render bare polylines/bars with **no axes, no gridlines, no tooltips, no comparison-bar coloring, no area fill**. This is a large capability gap; at minimum for visual parity:
  - Add a horizontal baseline gridline or two (`outline-variant`, 1px) to both chart types
  - `BarChart`: color the **last/current bar** `primary`, all others `surfaceContainerHighest` (mirrors web's weekly-volume `Cell`-based highlighting)
  - `LineChart` (weight trend): add a `fill` polygon under the line at `withAlpha(primary, 0.14)` to mirror web's Area, and render faint raw-entry dots (`onSurfaceVariant` at ~40% opacity, r≈2) separately from the smoothed trend line, exactly like web's `RawDot` + trend `Area`
  - Axis labels are a nice-to-have; not required for the core visual read (numbers-as-cards already substitute), but at minimum keep chart height bands close to web's (160–200px) — already roughly matched (120/140 mobile vs 160–200 web; bump `LineChart` default height 120→160 and `BarChart` 140→160 for closer parity)
- [ ] **EnergyCard**: web title uses `type-label`, big range readout `type-data !text-[22px]`, explainer + maintenance line in `type-body-sm`; missing-data state shows a tappable link ("Log your weight" / "Add your details") navigating to `/log` or `/profile`. Mobile's Energy card shows a `bigStat` (26px Space-Grotesk-head, not tabular data style) + a single range line, and the "unavailable" branch has **no tappable link** at all — just static text. Add the navigable link matching web's conditional copy/destination.

### 3.7 Profile (`mobile/app/(tabs)/profile.tsx` vs `web/src/screens/Profile.tsx`) — section order + editability differ substantially
Web section order: **Training** (Goal/Experience/Days-per-week/Split — each a tappable row opening a BottomSheet picker, except Days which is an inline SegmentedControl) → **Equipment** (chip grid, inline toggle) → **Redo setup button** → **Body** (height/birthYear/sex, inline fields) → **Preferences** (Units/Theme/Language, inline Segmented) → **Account** (email + Sign out).

Mobile section order: **Account** → **Your plan** (read-only rows, no edit affordance) → **Units** → **Language** → **Theme** → **Body details** → **Redo setup** → **Sign out**.

- [ ] **Reorder sections to match web**: Training (editable) → Equipment → Redo setup → Body → Preferences (Units/Theme/Language, in that sub-order) → Account. Move Account to the bottom.
- [ ] **"Your plan" rows are read-only text on mobile — web's are editable tap-to-open-sheet rows.** Add:
  - Goal row: tappable, opens a `Sheet` listing all `TrainingProfile`s as selectable `GoalCard`s (same 12px-radius card pattern as onboarding, tinted-selected state) — calls `api.putMe` with the new goal + clamped `daysPerWeek`, shows a saved toast.
  - Experience row: tappable, opens a `Sheet` with 3 `ExperienceCard`s (title + description), same selection pattern.
  - Days-per-week: **inline** `Segmented` control (not a sheet) bound to the goal's `[freqMin, freqMax]` range — mobile is missing this entirely (currently just a static "Row" showing the number as text). Add it exactly as onboarding step 3 does.
  - Split-preference row (**entirely missing on mobile**): tappable row opening a `Sheet` listing 5 `SplitCard`s (`auto`, `full_body`, `upper_lower`, `push_pull_legs`, `body_part`), each showing a description + a "needs N–M days" badge when incompatible with the user's current `daysPerWeek` (disabled + 50% opacity in that case). Uses `splitCompatible(value, daysPerWeek)` — port this helper from `web/src/lib/types.ts` into `mobile/lib/types.ts` if not already present.
- [ ] **Equipment chips are entirely missing on mobile Profile** (only shown as a comma-joined read-only string in the "Your plan" card). Add the same toggleable chip grid as onboarding (`tint-primary-14` selected bg, `primary` border/text when on; `surfaceContainer`/`outlineVariant`/`onSurfaceVariant` when off), each toggle immediately persisting via `api.putMe` (optimistic local state + revert-on-failure, matching web's `toggleEquipment`/`saveEquipment`).
- [ ] **Section label styling**: web `SectionLabel` = `type-label text-on-surface-variant px-1 mb-2` (uppercase Space Grotesk, small, no card wrapper — sits directly above the section's Card). Mobile currently uses an in-card `kicker` style baked into every card's top — restructure so each section has a standalone label above its card (matching web's placement outside/above rather than as the card's first row), once the reordering above is done.
- [ ] **Card row divider pattern**: web wraps grouped rows in one `Card className="divide-y divide-outline-variant"` (single card, hairline dividers between rows) — e.g. Training section is ONE card with 4 rows. Mobile currently gives each concern its **own separate card** (Account card, Plan card, Units card, Language card, Theme card — 5 separate cards where web has fewer, denser cards). Consolidate: Training section = 1 card with divided rows (Goal/Experience/Days/Split); Preferences section = 1 card with divided rows (Units/Theme/Language); Body section = 1 card with divided rows (Height/BirthYear/Sex); Account = 1 card (Email row + Sign out button).
- [ ] Redo-setup hint copy: web shows a `type-body-sm` hint line under the button (`redoSetupHint`) — verify mobile has the equivalent (currently absent, only the button itself) — add `t("profile.redoSetupHint")` line if the key exists in mobile's locale, else port it from web's `profile.json`.

### 3.8 Active Workout (`mobile/app/workout/[id].tsx` vs `web/src/screens/ActiveWorkout.tsx`)
Mobile is already close in structure (warmup card, per-exercise set rows two-line working / one-line logged, swap/remove/add-exercise/finish-confirm sheets, sticky bottom bar). Deltas:
- [ ] **Rest ring in the sticky bar is missing — mobile only shows the RestBanner, no compact ring.** Web's sticky action bar always shows a compact 48px ring (`RestTimer` component, §5) to the LEFT of the Finish button, in addition to the (separately positioned, above-the-bar) `RestBanner`. Mobile's `finishRow` only has the Finish button — no ring. Add the `RestRing` (§5) to the left of Finish, `flexDirection:"row", justifyContent:"space-between"` like web's `flex items-center justify-between gap-4 px-4 h-16`.
- [ ] **Finish button width**: web's Finish button in the action bar is NOT full-width (`fullWidth={false} className="px-6 shrink-0"`) — it sits to the right of the ring. Mobile's `Button` in `finishRow` currently has no `style` override, so it defaults to `Button`'s implicit full width behavior (mobile Button doesn't have a `fullWidth` prop at all — it's always as-wide-as-its-container via flex). Adjust the row layout so Finish is `flexShrink:0`, sized to content with horizontal padding, sitting beside the ring rather than stretching the full row.
- [ ] **Exercise header row info-icon**: mobile uses a plain `"ⓘ"` glyph character appended to the name; web has no such icon at all (web's exercise name itself is the tappable link to detail, no separate icon). This is a minor mobile-only addition — acceptable, but if going for literal parity, remove the `ⓘ` glyph since web signals tappability via `active:text-primary` on the whole name instead. Low priority.
- [ ] **Swap/remove icon buttons**: web uses lucide `ArrowLeftRight`/`Trash2` (22/18px line icons, 1.5 stroke) in 44×44 tap targets; mobile uses glyph characters `"⇄"`/`"✕"` in 40×40 boxes. Recommend switching to `@expo/vector-icons` (Ionicons has `swap-horizontal`/`trash-outline`) at consistent sizing (22px icon in a 44×44 target) to match the icon-based (not glyph-text) language used everywhere else on web. Also bump target size 40→44 to match web's `w-11 h-11` (44px) touch targets.
- [ ] **Target-sets chip styling**: matches reasonably (`bg-surface-container-high border border-outline-variant type-label`) — mobile's `targetChip` uses `radius.base` + border/bg matching — just confirm font is `type.label` (Space Grotesk, uppercase) not the current ad-hoc 12px Inter-medium style once §1's label fix lands.
- [ ] **RPE button / set-chip colors**: web logged-RPE chip = `tint-primary-14` bg + primary-tinted border + `text-primary`; mobile's `rpeBtnOn` = `primaryContainer` bg (opaque) + `primary` border + `onPrimaryContainer` text. Fix to `withAlpha(primary,0.14)` bg + `withAlpha(primary,0.3)` border + `colors.primary` text for the lighter, tinted-not-opaque look web uses everywhere.
- [ ] **Warm-up card chevron**: web uses lucide `ChevronUp`/`ChevronDown` (18px); mobile uses `▾`/`▸` glyphs — recommend Ionicons `chevron-up`/`chevron-down` at 18px for visual consistency with the rest of the icon language.
- [ ] Read-only summary view: composition already matches (status label, per-exercise card with set rows, volume line, "back to today" button) — no material gap.

### 3.9 Exercise Detail (`mobile/app/exercise/[id].tsx` vs `web/src/screens/ExerciseDetail.tsx`)
- [ ] **Substitute callout entirely missing.** Web shows an accent-tinted callout card (`bg rgba(primary,0.08)`, border `rgba(primary,0.3)`, `p-4 rounded-lg`) with label "Substitute" (`type-label text-primary`), the substitute exercise's name + first form cue, a blurb, and a ghost "View {name}" link-button navigating to that exercise. Mobile has none of this — the whole substitute/progression system is absent from the mobile detail screen. **Add both**:
  - `SubstituteCallout`: tinted card as above, needs `exercise.substituteId` resolved against the exercises list (mirror web's lookup).
  - `ProgressionCallout`: plain `Card` (not tinted) with label "Progression" (`type-label text-on-surface-variant`), name, and a ghost "View {name}" link.
- [ ] **Secondary muscles row missing** — web shows primary muscles as `accent`-tone badges and secondary muscles as `neutral`-tone badges at 70% opacity, in two separate flex-wrap rows. Mobile only renders primary-equipment chips + primary-muscle chips (as two custom `chip`/`chipMuscle` styles, functionally OK) but has **no secondary-muscles row at all**. Add it (neutral Badge tone, `opacity: 0.7` on the container).
- [ ] **Numbered form-cue circles**: web uses a `tint-primary-14` circular badge (24×24, `rounded-full`) with the step number inside, `type-data` 12px. Mobile shows a plain `"{i+1}."` text prefix with no circle/badge at all. Add the circular numbered badge (`withAlpha(primary,0.14)` bg, `colors.primary` text, 24×24 `radius.pill`) to match.
- [ ] **Common-mistakes markers**: web uses a `TriangleAlert` lucide icon (14px, `text-warning`) per bullet; mobile uses a plain `"!"` character colored warning. Swap to an actual warning-triangle icon (Ionicons `warning-outline` or `alert` at 14px, warning color) for icon-language consistency.
- [ ] Back button: web is icon-only (`ArrowLeft` 22px in a 44×44 target, `-ml-2` to align with the edge); mobile shows `"‹ Back"` text. Consider icon-only `chevron-back`/`arrow-back` Ionicons at 22px in a 44×44 box for closer parity (localization-safe icon vs. text — recommended especially since Dutch locale exists).
- [ ] Title truncation: web truncates long exercise names to 28 chars + "…" in the top-bar title (full name still shown in the `type-headline-md` header below); mobile shows the exercise name directly in the top bar via `numberOfLines={1}` (visually similar outcome, acceptable — no fix required, RN's ellipsis truncation achieves the same effect natively).

---

## 4. NAV BAR — exact bottom-nav spec

Web spec (`web/src/components/shell/AppShell.tsx` + `design.md`):
```
height: 64px content + safe-area-inset-bottom padding
background: surfaceContainer, border-top 1px outlineVariant
grid: 5 equal columns (Today/Program/Log/Progress/Profile)
icon: 22px, strokeWidth 1.5 (lucide: Sun/CalendarRange/Dumbbell/ChartNoAxesCombined/CircleUserRound)
label: type-label but forced to 10px (!text-[10px]) — i.e. Space Grotesk 500, uppercase, 0.08em tracking, 10px/16px-ish line-height, NOT the full 12px label size
active tab: icon+label colored `primary`; a 32×2px (w-8 h-0.5) rounded-full `primary` bar pinned to the ABSOLUTE TOP of the tab item (span className="absolute top-0 w-8 h-0.5 rounded-full bg-primary")
inactive tab: icon+label colored `onSurfaceVariant`, no top bar
tab item layout: flex-col, items-center, justify-center, gap-1 (4px), relative positioning (so the absolute top-indicator anchors to the tab item, not the whole nav bar)
```

Mobile currently (`mobile/app/(tabs)/_layout.tsx`) uses stock `expo-router` `Tabs`:
- `tabBarStyle: { backgroundColor, borderTopColor }` — **no explicit `height: 64`** (defaults to platform-native tab-bar height, e.g. ~49–83px depending on device/OS and safe area — inconsistent with web's fixed 64+safe-area spec). **Add `height: 64` (content height, excluding safe-area — React Navigation adds safe-area padding automatically on top of `height` when the tab bar sits at the screen bottom, so setting `height: 64` should NOT double-add the inset; verify visually and adjust if the effective height is off) plus explicit `paddingTop`/`alignItems` if needed to vertically center icon+label within 64px.**
- Icon size: `Ionicons` default size passed via `tabBarIcon` render prop `size` — currently whatever RN Navigation's default is (not forced to 22). **Add `tabBarIconStyle` or pass a fixed `size={22}` inside the `tab()` icon renderer** (currently `tab()` receives `{ color, size, focused }` and passes `size` straight through — override to hardcode `22` instead of the injected default).
- Label size: `tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 10 }` — **fontFamily is wrong** (Inter, should be Space Grotesk / `fonts.headMedium`) and **no `textTransform: "uppercase"` / letterSpacing** — fix to match `type.label` but at 10px:
  ```ts
  tabBarLabelStyle: { fontFamily: fonts.headMedium, fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase" }
  ```
- **No active-tab top-indicator bar at all** — this is the biggest nav-bar gap. React Navigation's `Tabs` (bottom tabs) does not natively support a per-tab absolute-positioned decoration without a custom `tabBarButton`. **Implementation approach**: supply a custom `tabBarButton` per `Tabs.Screen` (or globally via `screenOptions.tabBarButton`) that wraps the default touchable in a `View` with `position: relative`, and renders an absolutely-positioned `View` pinned to `top: 0, left: "50%", marginLeft: -16, width: 32, height: 2, borderRadius: 1, backgroundColor: colors.primary` **only when `accessibilityState.selected` (or the `focused` prop RN Navigation passes) is true**. Concretely:

  ```tsx
  function makeTabBarButton(colors: Palette) {
    return function TabBarButton(props: BottomTabBarButtonProps) {
      const focused = props.accessibilityState?.selected;
      return (
        <PlatformPressable {...props} style={[props.style, { position: "relative" }]}>
          {focused && (
            <View
              pointerEvents="none"
              style={{
                position: "absolute", top: 0, left: "50%", marginLeft: -16,
                width: 32, height: 2, borderRadius: 1, backgroundColor: colors.primary,
              }}
            />
          )}
          {props.children}
        </PlatformPressable>
      );
    };
  }
  ```
  Apply via `screenOptions={{ ...,  tabBarButton: makeTabBarButton(colors) }}` in `TabsLayout`. (`PlatformPressable` comes from `@react-navigation/elements`, already a transitive dependency of expo-router's Tabs — if unavailable, fall back to a plain `Pressable` reproducing the same hit-slop/ripple behavior.)
- Icon strokeWidth: Ionicons doesn't expose a stroke-width knob the way lucide does (Ionicons are mostly filled/outline pre-baked glyphs, selected via the `-outline` suffix already used for inactive states) — this is an acceptable platform substitution already in place (`"today"` vs `"today-outline"` filled/outline swap functions as the active/inactive visual distinction lucide's `strokeWidth 1.5` achieves on web). No fix needed here; just ensure size is forced to 22 as above.

---

## 5. COMPONENT SPECS

### 5.1 Button (web `Button.tsx` vs mobile `components/ui/Button.tsx`)
| | primary | secondary | ghost | destructive |
|---|---|---|---|---|
| bg | `primary` | `surfaceContainerHigh` | transparent | web: `error` fill; **mobile currently: transparent + error border (outline style) — MISMATCH, web's destructive is a solid error-filled button, not an outline** |
| border | none | 1px `outlineVariant` | none | web: none; mobile currently 1px `error` — remove border, fill solid |
| text | `onPrimary` | `onSurface` | `onSurface` | web: `onError`; mobile currently `error` — fix to `onPrimary`-equivalent i.e. `colors.onError` |
| height | 48 (default) / 40 (compact) | same | same | same |
| radius | 4 (`radius.base`) | same | same | same |
| font | Space Grotesk 500 (`font-head font-medium`), 15px | same | same | same |
| pressed | `active:brightness-95` ≈ slight darken; mobile uses flat `opacity:0.85` on all variants — acceptable approximation, keep | | | |
| disabled | `opacity-40` | same | same | same — mobile already `opacity: 0.45`, close enough, optionally tighten to `0.4` for exact match |

**Fix needed**: `destructive` variant in `mobile/components/ui/Button.tsx` — change from outline-style to solid fill:
```ts
destructive: {
  container: { backgroundColor: colors.error },
  label: { color: colors.onError },
},
```
**Add**: a `size="compact"` prop (40px height, matching web's `Button size="compact"` used for Program's WorkoutCard footer actions) — mobile Button currently has no size variant at all, always 48px. Add:
```ts
height: size === "compact" ? 40 : 48,
```
**Add**: a `fullWidth` prop — web defaults `fullWidth = true` but several call sites pass `fullWidth={false}` (e.g. ExerciseDetail's ghost link buttons, ActiveWorkout's Finish button, Program's back/ghost buttons). Mobile's Button has no concept of width at all (always stretches to fill its flex container) — add:
```tsx
style?: StyleProp<ViewStyle>  // already exists — callers currently work around this by passing width overrides via `style`; formalize with a `fullWidth?: boolean` prop defaulting true, applying `alignSelf: "flex-start"` + `paddingHorizontal: space(5)` when false, so call sites don't need ad-hoc style hacks.
```

### 5.2 Badge — see §2 badge-tone table above for the concrete bg/border/text/radius/font fixes (radius.base not pill; label typography not bodyMedium; add "danger" tone; fix "success" tone to tinted-not-transparent bg; remove or repurpose the non-web "primary" tone).

### 5.3 Input — mobile has no reusable `Input` component; every screen hand-rolls a `TextInput` with inline styles (`sign-in.tsx`, `onboarding.tsx`, `profile.tsx` all duplicate near-identical style objects). **Extract a shared `components/ui/Input.tsx`**:
```
height: 48 (control-h)
borderRadius: radius.lg (8 — NOT radius.base; every current mobile hand-rolled input incorrectly uses 4px)
backgroundColor: colors.surfaceContainerLow (NOT surfaceContainer — current hand-rolled versions use surfaceContainer, one shade too high)
border: 1px colors.outlineVariant (colors.primary on focus, if implementing focus state)
paddingHorizontal: space(3) i.e. 12 (web: px-3)
font: Inter 400, 16px (matches `type-16` used by web's Input, NOT the 15px body-md — web Input.tsx hardcodes text-[16px] to prevent iOS Safari zoom-on-focus; keep 16px on mobile too for visual/type consistency even though the zoom bug is web-only)
color: colors.onSurface; placeholder: colors.onSurfaceVariant
```
Also extract a matching `Textarea` variant (`minHeight: 96, paddingVertical: space(3), textAlignVertical: "top"`) and a `Field` wrapper (`type.label` caption + `gap: space(1.5)` above the input) — mirroring web's `Input.tsx` exports (`Input`, `Textarea`, `Field`) as one module so sign-in/onboarding/profile can all import the same primitives instead of duplicating style objects.

### 5.4 Segmented (`Segmented.tsx`) — already close to web's `SegmentedControl.tsx`. Confirm:
```
wrap: bg surfaceContainerLow (mobile currently uses surfaceContainer — one shade too high, FIX to surfaceContainerLow), border outlineVariant, radius.lg (mobile: radius.base — web is rounded-lg/8px on the outer wrap, FIX), padding 4 (space(1), mobile currently space(0.5)=2px — FIX to space(1)), gap 4 (space(1), mobile currently space(0.5) — FIX)
segment: flex-1, height 44 (web h-11; mobile currently 40 — FIX to 44), radius.base (4px, mobile currently radius.sm=3px — FIX to radius.base) inner segment radius
active segment: bg primary, text onPrimary — already correct
inactive: text onSurfaceVariant — already correct
font: Space Grotesk 500 14px (mobile: fonts.bodyMedium = Inter — FIX to fonts.headMedium)
```

### 5.5 Sheet/BottomSheet (`Sheet.tsx` vs web `BottomSheet.tsx`)
```
top corners: radius.xl (12px) — mobile ✓ already correct
grabber: 36×4 (w-9 h-1 = 36×4 on web scaled... web is w-9 h-1 = 36×4px), rounded-full, bg outlineVariant — mobile: 36×4, radius 2 ✓ close enough (web's h-1=4px, mobile's height:4 ✓ — matches)
backdrop: rgba(0,0,0,0.55) — mobile ✓ matches (web: color-mix(black 55%, transparent))
real shadow: web has shadow-[0_-8px_32px_rgba(0,0,0,0.4)] on the sheet panel — mobile Sheet.tsx panel has NO shadow at all. ADD:
  shadowColor: "#000", shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.4, shadowRadius: 32, elevation: 16 (Android)
content max-height: web caps inner scroll area at 70dvh; mobile caps the whole panel at 85% — close enough, acceptable difference given RN's KeyboardAvoidingView handling, no fix required
title: web type-title inside a px-4 pt-1 pb-2 wrapper, ABOVE a scrollable content div; mobile renders title directly inside the panel above the ScrollView — structurally equivalent, keep
```
**Fix**: add the drop shadow to `Sheet.tsx`'s `panel` style.

### 5.6 RestBanner/ring (web `RestTimer.tsx` vs mobile `RestBar.tsx`)
Mobile's `RestBar` already ports the banner (`over` / active states) reasonably closely:
```
banner active-state colors: web uses tint-primary-14 bg + rgba(primary,0.3) top border; mobile uses colors.primaryContainer (opaque solid, #21543a) bg + colors.primary top border — MISMATCH, fix bg to withAlpha(colors.primary, 0.14)
banner "over" state: web bg=primary solid, text=onPrimary — mobile matches ✓
countdown number: web type-data !text-[28px] !leading-9 (i.e. Space Grotesk 500 tabular-nums at 28/36) — mobile uses fonts.head (600 weight) at 28/34 — close but wrong weight/lineHeight/family-purpose; fix to fonts.headMedium (500) with lineHeight 36 to match type-data's scaling-up
progress bar: web h-0.5 (2px) track/fill, both rounded-full; mobile track height:3, FIX to 2px for exact match
+15/-15/skip controls: web are 44×44 icon-ish buttons with type-body-sm text; mobile's ctrl buttons are height:44 but width auto (minWidth:44) with 13px text — close, acceptable
```
**Missing entirely: the compact 48px ring** (web's second `RestTimer` component — a small SVG ring living permanently in the sticky action bar, distinct from the banner). Build it as a new mobile component, e.g. `components/fitness/RestRing.tsx`:
```
size: 48, strokeWidth: 3
track circle: stroke outlineVariant, fill none
progress arc: stroke primary, strokeLinecap round, strokeDasharray = circumference, strokeDashoffset animated via progress (remaining/total), rotated -90deg (start at 12 o'clock, drains clockwise) — use react-native-svg <Circle> with a rotation transform on the <Svg> (matches web's transform: rotate(-90deg) on the whole <svg>)
center label: type-data !text-[11px] tabular-nums — active: onSurface text showing clock(remaining) (m:ss); inactive: onSurfaceVariant showing "–:––"
tap target: whole ring is a Pressable; onPress = timer.skip when active, no-op when inactive
accessibility: accessibilityLabel mirroring web's aria (time remaining when active, "inactive" copy when not)
```
Render this ring to the LEFT of the Finish button in the sticky bar (see §3.8).

### 5.7 Arc — **does not exist on mobile at all; must be built from scratch.** Port `web/src/components/ui/Arc.tsx` 1:1 using `react-native-svg`:
```
props: value (0..1), size (default 120), strokeWidth (default 3.5), label?, metric?
geometry: 270° arc opening at the bottom, starting at 135°, same polar-coordinate math as web (sweep=270, startAngle=135)
track: full 270° arc, stroke outlineVariant, strokeWidth, strokeLinecap round, fill none
progress: partial arc from startAngle to startAngle + sweep*animatedValue, stroke primary, same width/cap
center content: metric text (type-data-ish but forced to 22px/28-30 lineHeight, i.e. web's !text-[22px] !leading-7 override) + label below it (type.label, marginTop ~2px)
animation: web eases from previous value over 600ms (cubic ease-out) via requestAnimationFrame, respecting prefers-reduced-motion. On RN, use Animated.Value / react-native-reanimated driven over 600ms with an Easing.out(Easing.cubic) curve; respect the OS reduce-motion setting via AccessibilityInfo.isReduceMotionEnabled() — if enabled, snap directly to the target value with no animation.
accessibility: when `label` is provided, treat the whole SVG as an image with accessibilityLabel = "{label}: {round(value*100)}%"; otherwise mark accessibilityElementsHidden/importantForAccessibility="no" (mirrors web's aria-hidden when no label).
```
Needed at 4 call sites once built: Sign-in brand mark (120, no label/metric — purely decorative), Today weekly ring (96/3.5, metric `{done}/{total}`, label "This week"), Program header ring (88, metric `{completed}/{total}`, label "This week" — web key `arcWeek`).

### 5.8 ExerciseCard — **does not exist on mobile; needed for Program's expanded WorkoutCard (§3.4) and could replace ad-hoc rows elsewhere.** Port `web/src/components/fitness/ExerciseCard.tsx`:
```
container: Card (pressable variant) — bg surfaceContainer, border outlineVariant, radius.lg, padding 14 (p-3.5)
layout: row, gap 12 (gap-3), items-center
left (flex 1, min-width 0): exercise name (type.bodyMd, medium weight, numberOfLines=1) then below it target line (type.data, onSurfaceVariant: "{sets} × {reps}" + optional " · {load}" + optional " · RPE {n}") then optional note line (type.body onSurfaceVariant)
right: optional equipment Badge (neutral tone) + a chevron-right icon (18px, onSurfaceVariant)
onPress: navigates to /exercise/{exerciseId}
```

### 5.9 SyncChip — **does not exist as a component on mobile; build per §3.3's spec** (4-state pill, `components/shell/SyncChip.tsx` or similar), consumed by Today's top bar (and optionally every screen's top bar, matching web's `AppShell` which renders it globally next to every screen title — currently only Today shows any sync indication at all; **recommend adding the SyncChip to program/log/progress/profile top bars too**, matching web where it's part of the shared `AppShell` and thus present on every screen).

---

## 6. Build/consolidation recommendations (cross-cutting, not screen-specific)
- Extract a shared top-bar component (`components/shell/TopBar.tsx`) since all 7 mobile screens currently hand-roll an identical `{height:56, borderBottom, ...}` header — this would also be the natural place to mount the new `SyncChip` once, rather than per-screen.
- Extract a shared `Card` primitive (`components/ui/Card.tsx`) — every screen currently duplicates the `{bg:surfaceContainer, border:1px outlineVariant, radius:radius.lg, padding:space(4)}` object literal inline; centralizing it makes the radius/tint fixes in this spec a one-file change instead of N-file.
- Centralize the `EngineNote`/warning-vs-accent-tinted-note-card pattern (needed by both Today §3.3 and Program §3.4) into one `components/fitness/EngineNoteCard.tsx`.
- Add the `withAlpha(hex, alpha)` helper to `lib/theme.ts` (§2) — nearly every fix in this spec depends on it for tint parity.
