---
name: skysense-app-conventions
description: SkySense app (React Native + Expo SDK 54) project conventions. Use whenever creating, editing, or reviewing code in this repo — covers file/folder layout, feature module structure, UI theme tokens (Uniwind + custom palette), base component usage, icon system, i18n keys, state management (Zustand + MMKV), forms (TanStack Form + Zod), charts (SVG), and hard rules. Auto-invoke for any non-trivial code change in `src/`.
---

# SkySense App — Project Conventions

> Reference: `CLAUDE.md` describes the high-level stack. This skill captures the *observed* conventions actually used in the codebase, so generated code blends in.

## 1. Tech stack (locked in)

- Expo SDK 54 + React Native 0.81.5 + React 19
- Expo Router 6 (file-based routes in `src/app/`)
- **Uniwind** (NOT classic NativeWind) — Tailwind v4 with `@theme` tokens in `src/global.css`
- **tailwind-variants** (`tv`) for component variants
- TypeScript strict
- Zustand + MMKV + React Query
- TanStack Form + Zod (zod v4 — no `@tanstack/zod-form-adapter`, do `validators: { onChange: schema as any }`)
- react-native-gifted-charts is *available* but the team mostly uses **custom react-native-svg** charts (see `src/features/weather/line-chart.tsx`)
- Inter font (loaded via `@expo-google-fonts/inter`)

## 2. Directory layout (follow exactly)

```
src/
├── app/                        # Expo Router file-based routes
│   ├── _layout.tsx             # Root providers (GestureHandler, Keyboard, Theme, API, BottomSheet, FlashMessage)
│   ├── (app)/                  # Authenticated tab group; decisions delegated to useAppGate
│   │   ├── _layout.tsx         # Calls useAppGate; renders <Redirect> or <Tabs>
│   │   ├── index.tsx           # Re-exports DashboardScreen (one-liner)
│   │   ├── weather.tsx
│   │   ├── device-setup/       # Stack group: bound-device wizard (real routes, not in-layout components)
│   │   │   ├── _layout.tsx     # Stack, header hidden
│   │   │   ├── index.tsx       # Re-exports DeviceListScreen
│   │   │   └── connected.tsx   # Re-exports DeviceConnectedScreen
│   │   └── profile/
│   │       ├── _layout.tsx
│   │       ├── index.tsx
│   │       ├── account.tsx
│   │       ├── device-detail.tsx
│   │       ├── wifi-detail.tsx
│   │       ├── detection-frequency.tsx
│   │       └── settings.tsx
│   ├── onboarding.tsx
│   └── login.tsx
├── features/                   # Feature modules — see §3
│   ├── auth/
│   ├── dashboard/              # Active home (SQM real-time + charts)
│   ├── device/                 # Device scan/connect/store
│   ├── profile/                # User-facing settings & device info
│   ├── settings/
│   ├── onboarding/
│   └── weather/                # History charts
├── components/
│   └── ui/                     # Base components — see §4
│       ├── icons/              # SVG icon set — see §5
│       └── colors.ts           # (⚠️ MISSING — see §4 note)
├── lib/
│   ├── api/                    # axios + React Query provider
│   ├── auth/utils.tsx
│   ├── hooks/                  # use-is-first-time, use-selected-theme, use-app-gate
│   ├── i18n/                   # i18next setup, translate(), TxKeyPath
│   ├── storage-keys.ts         # Centralised MMKV key constants (STORAGE_KEYS)
│   ├── storage.tsx             # MMKV singleton (`storage`) + getItem/setItem/removeItem
│   ├── test-utils.tsx
│   └── utils.ts                # openLinkInBrowser, createSelectors
├── translations/               # en.json, ar.json, zh.json
└── global.css                  # @theme tokens (Tailwind v4) + dark mode
```

**Always use `@/` imports** (tsconfig path alias). Never use relative imports beyond a feature's own folder.

### 2.1 Storage key convention

Every key written to or read from the MMKV `storage` singleton MUST come from `STORAGE_KEYS` in `@/lib/storage-keys`. The on-disk string literals live in one place; call sites reference `STORAGE_KEYS.BOUND_DEVICE_ID` etc. Adding a new key = one edit to `storage-keys.ts` plus its call sites. Renaming an on-disk value is a data-migration event (existing user devices still hold the old key) — do not change the literal without a migration plan.

## 3. Feature module layout

Every feature follows this structure. `dashboard/` is the canonical reference:

```
src/features/dashboard/
├── dashboard-screen.tsx       # Default export: <FeatureName>Screen()
├── components/
│   ├── device-header.tsx
│   ├── sky-info-card.tsx
│   ├── sensor-tripod.tsx
│   └── trend-chart.tsx
└── hooks/
    └── use-measurement-store.ts
```

Rules:
- A feature's screen is exposed via a single named export, then re-exported by a route file in `src/app/`.
- Internal components live in `components/`, internal stores/hooks in `hooks/` (or `use-*-store.tsx` at the feature root for a primary store).
- Sub-screens (e.g. `profile/`) follow `screens/<feature>-screen.tsx` + `components/` (see `src/features/profile/`).
- **No two features may both own a "dashboard" or other top-level screen.** Active work goes into `features/dashboard/`. Do not re-create `features/skysense/` — it was removed.

### 3.1 Navigation gate

`(app)/_layout.tsx` does NOT contain business logic. It calls `useAppGate()` (from `@/lib/hooks/use-app-gate`), which returns a discriminated union:

- `{ kind: 'redirect', href: '/onboarding' | '/login' | '/device-setup' }` — render `<Redirect href=... />`
- `{ kind: 'tabs' }` — render `<Tabs>...</Tabs>`

The layout's only branch is `if (gate.kind === 'redirect') return <Redirect href={gate.href} />`. Adding a new gate condition (e.g. paid subscription, region lock) is a one-file change to `useAppGate` plus a new variant in the `AppDestination` union — never modify `(app)/_layout.tsx` to add new business conditions.

**The device-setup wizard is a real route group** (`app/(app)/device-setup/{_layout,index,connected}.tsx`), not a component rendered inside `(app)/_layout.tsx`. `device-list-screen` explicitly `router.push('/device-setup/connected')` when a device connects; `device-connected-screen` `router.replace('/(app)')` on "Start Using". Do NOT add a `DeviceSetupScreen` switch component back — that pattern is gone.

## 4. Base UI components (`src/components/ui/`)

Exported via `src/components/ui/index.tsx`:

| Component | Notes |
|---|---|
| `Button` | `tv()` variants: `default`, `secondary`, `outline`, `destructive`, `ghost`, `link`; sizes: `default`, `lg`, `sm`, `icon`; props: `label`, `loading`, `variant`, `size`, `disabled`, `fullWidth`, `className`, `textClassName` |
| `Text` | Wraps RN `Text`; default `font-inter text-base text-black dark:text-white`; supports `tx="key.path"` for i18n |
| `Input` | Standard form input; use with `KeyboardAvoidingView` from `react-native-keyboard-controller` |
| `Checkbox.Root` / `Checkbox.Icon` | Compound component |
| `Modal` | — |
| `Select` | — |
| `List` | — |
| `Image` | Wraps `expo-image` |
| `ProgressBar` | — |
| `FocusAwareStatusBar` | Theme-aware `StatusBar`; put one at the top of every screen |
| `ScreenHeader` | Back-arrow + centered title; use as the standard header for sub-screens |
| `StyledSvg` | `withUniwind(Svg)` — base for any SVG that should accept `className` |
| `colors` | Re-exported as a default from `./colors` — **but `src/components/ui/colors.ts` does not exist on disk**; consumers must NOT import it. Use raw hex from `global.css` or hardcode. (See §6.) |
| RN primitives | `View`, `ScrollView`, `Pressable`, `TouchableOpacity`, `ActivityIndicator`, `SafeAreaView` |

**Component pattern**: variants in `tv({ slots: { ... }, variants: { ... }, defaultVariants: { ... } })`. The component calls `styles.<slot>({ className: override })`. See `button.tsx` for the canonical example.

## 5. Icon system (`src/components/ui/icons/`)

- Every icon is a named function-component exporting from `react-native-svg`'s `Svg` + `Path` etc.
- Signature: `function X({ color, size = N, ...props }: SvgProps & { size?: number })`.
- Always re-exported through `icons/index.tsx`.
- **Before creating a new icon**, check `icons/index.tsx` and `icons/`. Reuse `arrow-left`, `arrow-right`, `battery`, `bluetooth`, `camera`, `caret-down`, `device`, `droplet`, `feed`, `github`, `help`, `home`, `info`, `language`, `rate`, `settings`, `share`, `weather`, `support`, `temperature`, `user`, `website`, `wifi` when possible.
- Tab bar uses: `Feed` (Dashboard), `Weather`, `Settings` (Profile). Don't change tab labels without updating all three.
- Stroke style convention: `strokeWidth={2}`, `strokeLinecap="round"`, `strokeLinejoin="round"`, `fill="none"`.

## 6. Theme & colors (the most error-prone area)

**The repo's color system is partially missing.** Plan accordingly.

- **Tokens live in `src/global.css`** under `@theme { --color-... }`. Tailwind v4 generates utilities from these.
- Available palettes (use them via Tailwind classes, not via a TS import):
  - `charcoal-{50..950}` (with non-standard 850) — neutral grays; **primary gray scale for UI surfaces**
  - `neutral-{50..900}` — secondary gray scale
  - `primary-{50..900}` — **brand orange** (`#FFE2CC → #B24C00`); brand accent = `primary-500` (`#FF7B1A`) / `primary-600` (`#FF6C00`)
  - `success-{50..900}`, `warning-{50..900}`, `danger-{50..900}`
  - Semantic: `background`, `foreground`, `card`, `card-foreground`, `muted`, `muted-foreground`, `border`, `input`, `ring`, `destructive`
- Dark mode: toggled by setting `className` to `dark` / `light` on the root `GestureHandlerRootView` (see `src/app/_layout.tsx`). Read it with `const { theme } = useUniwind(); const isDark = theme === 'dark';`.
- **`src/components/ui/colors.ts` is imported (`use-theme-config.tsx`, `screen-header.tsx` history) but the file is not on disk.** Code that needs `colors.primary[200]` etc. currently breaks. Two viable options:
  1. Prefer Uniwind class names (`text-primary-500`, `bg-charcoal-900`) over TS color imports.
  2. If you need raw hex in JS, import directly from `global.css` constants — or just inline the hex (`#FF7B1A`).
- **Hardcoded hex is common in this codebase** (e.g. `'#1A1A1A'` card bg, `'#888'` icon color). When matching existing screens, mirror those exact values rather than inventing new tokens. Reference values:

  | Use | Light | Dark |
  |---|---|---|
  | Screen bg | `bg-white` | `bg-black` |
  | Card bg | `bg-neutral-100` | `bg-[#1A1A1A]` |
  | Divider | `bg-neutral-200` | `bg-[#2C2C2C]` |
  | Primary text | `text-black` | `text-white` |
  | Secondary text | `text-neutral-500` | `text-charcoal-400` |
  | Tertiary text | `text-neutral-500` | `text-[#888888]` |
  | Icon | `#666` | `#B0B0B0` or `#888` |
  | Brand orange | `#FF7B1A` (primary-500) | same |
  | Login button | `#FF8F1C` (explicit override) | same |

- **Chart palette (used in `weather-screen.tsx`)**:
  - SQM: `#FF8F1C` (orange)
  - Temperature: `#FFEA00` (yellow)
  - Humidity: `#2DA8FF` (blue)
  - Pressure: `#AD7EFF` (purple)

## 7. State management

- **Global app state**: Zustand stores with the `createSelectors` helper from `@/lib/utils`. Pattern: `export const useFoo = createSelectors(_useFoo);` then consumers call `useFoo.use.fieldName()`.
- **Persisted state** (auth token, bound device id, language): MMKV via `useMMKVString(key, storage)` from `react-native-mmkv`, using the singleton `storage` from `@/lib/storage`.
- **Server state**: React Query, wrapped in `<APIProvider>` (`src/lib/api/provider.tsx`). `queryClient` is exported and devtools are enabled.
- **Measurement store** (`src/features/dashboard/hooks/use-measurement-store.ts`) is the canonical example of a Zustand store with mock-data side effects (`startMock` / `stopMock`).

## 8. i18n

- Locales: `en`, `ar`, `zh` (default). Add new locale = add JSON + entry in `src/lib/i18n/resources.ts`.
- Keys are namespaced by feature: `dashboard.*`, `device.*`, `profile.*`, `weather.*`, `login.*`, `onboarding.*`, `account.*`, `device_detail.*`, `settings.*`.
- Use `<Text tx="dashboard.realtime_trend" />` for static strings.
- Use `translate('dashboard.unit_sqm')` from `@/lib/i18n` inside JS/TS code (it's `lodash.memoize`d).
- Adding a key: add to **all three** JSON files; `TxKeyPath` is auto-derived from `en.json`, so en must be the canonical source.
- Type-safe paths: `TxKeyPath` from `@/lib/i18n` enforces that the path exists in `en.json`.
- RTL: `ar` is the only RTL locale; `I18nManager.forceRTL` is set in `i18n/index.tsx` and `changeLanguage()` triggers a restart via `RNRestart` (or dev reload).

## 9. Forms

- Use `@tanstack/react-form` (`useForm`) + `zod`.
- zod v4 syntax only. No `@tanstack/zod-form-adapter` — pass validators as `validators: { onChange: schema as any }`.
- For per-field error display, use `getFieldError(field)` from `@/components/ui/form-utils`.
- Submit state via `form.Subscribe selector={state => [state.isSubmitting]}`.
- Reference: `src/features/auth/components/login-form.tsx`.

## 10. Charts

- Two chart systems coexist:
  1. **Custom react-native-svg** — `src/features/weather/line-chart.tsx`, `multi-line-chart.tsx`, `chart-utils.ts`. Preferred for the History/Weather screen.
  2. **`react-native-gifted-charts`** — declared as a dependency for SQM trend. Used optionally.
- Both implement the same UX: pan/tap tooltip, gradient area fill, grid lines, x/y labels, dark-mode aware colors.
- New chart components should follow the `line-chart.tsx` pattern: `PanResponder` for touch, `useMemo` for paths, `useUniwind` for theme, `containerRef.measure` for responsive width.

## 11. Screen layout conventions

- Every screen renders:
  ```tsx
  <>
    <FocusAwareStatusBar />
    <View className={`flex-1 ${isDark ? 'bg-black' : 'bg-white'}`}>
      <DeviceHeader />          {/* or <ScreenHeader title=... /> on sub-screens */}
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        ...
      </ScrollView>
    </View>
  </>
  ```
- Sub-screens (profile, device-detail, etc.) use `<ScreenHeader title={translate('...')} />` at the top.
- Horizontal padding: `mx-4` or `mx-5` / `mx-6` for cards and lists.
- Cards: `rounded-[15px]` (or `rounded-2xl`), `px-5 py-6` for big cards.
- Tabs redirect logic lives in `useAppGate` (`@/lib/hooks/use-app-gate`): onboarding (first time) → login (signed out) → device-setup (no bound device) → tabs. The layout is a 5-line `<Redirect>` branch; all decisions are inside the hook.

## 12. Hard rules (don't break these)

- ❌ Do NOT add third-party component libraries (no `react-native-paper`, `antd-mobile`, `Victory Native`, `WebView` chart libs).
- ❌ Do NOT add WebView-based chart libraries.
- ❌ Do NOT edit `android/` or `ios/` directly — go through Expo config plugins.
- ❌ Do NOT use relative imports outside a single feature folder.
- ❌ Do NOT use AsyncStorage — use the MMKV `storage` from `@/lib/storage`.
- ❌ Do NOT introduce `react-hook-form` — use TanStack Form.
- ❌ Do NOT hardcode brand-orange outside the documented palette (`primary-*` or `#FF7B1A` / `#FF8F1C`).
- ❌ Do NOT add a new icon without first checking `src/components/ui/icons/`.
- ❌ Do NOT add translation keys to only some locales — all three (en/ar/zh) must stay in sync.
- ❌ Do NOT import from `@/components/ui/colors` — the file is missing; use Tailwind classes or inline hex instead.
- ❌ Do NOT use `npm` or `yarn` — only `pnpm` (enforced by `preinstall` script).
- ❌ Do NOT touch the `react-native-screens` version; it's pinned to `~4.25.x` for RN 0.81.5.
- ❌ Do NOT inline a MMKV key string literal — always go through `STORAGE_KEYS` in `@/lib/storage-keys`.
- ❌ Do NOT re-create `features/skysense/` or `features/feed/` — both were removed as template residue.
- ❌ Do NOT add a `DeviceSetupScreen` switch component — `app/(app)/device-setup/` is a route group.
- ❌ Do NOT add business-state reads to `(app)/_layout.tsx` — extend `useAppGate` instead.
- ✅ DO use `EXPO_PUBLIC_*` prefix for env vars exposed to the app.
- ✅ DO run `pnpm check-all` (lint + type-check + translations + tests) before declaring done.
- ✅ DO write tests for new `src/components/ui/*` components (see `button.test.tsx` for the pattern).
- ✅ DO prefer the existing screens in `src/features/dashboard/` as the visual reference for new screens.

## 13. Common commands

```bash
pnpm start                  # Metro dev server
pnpm android / pnpm ios     # Native dev
pnpm lint                   # ESLint
pnpm type-check             # tsc --noemit
pnpm test                   # Jest
pnpm check-all              # Everything
pnpm lint:translations      # i18n JSON lint
pnpm start:preview          # Preview env
pnpm build:production:android   # EAS production Android
```

## 14. When in doubt

1. Find a similar existing screen and mirror its structure (`grep` for `useUniwind`, `rounded-[15px]`, `mx-4`, `translate(`).
2. Prefer copying patterns from `src/features/dashboard/` (canonical) and `src/features/profile/` (canonical for sub-screens with `ScreenHeader`).
3. If a new color is needed and not in `global.css`, add a token there and use the resulting Tailwind class.
4. If unsure about chart APIs, look at `src/features/weather/line-chart.tsx` — it's the most complete example.
5. If unsure about i18n keys, run `grep -r "tx=\"" src/` to see real usage.
