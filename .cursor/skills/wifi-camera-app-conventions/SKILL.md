---
name: wifi-camera-app-conventions
description: WiFi Camera app (React Native + Expo SDK 54) project conventions. Use whenever creating, editing, or reviewing code in this repo — covers file/folder layout, feature module structure, UI theme tokens (Uniwind + custom palette), base component usage, icon system, i18n keys, state management (Zustand + MMKV), camera WebSocket protocol, forms (TanStack Form + Zod), charts (SVG), and hard rules. Auto-invoke for any non-trivial code change in `src/`.
---

# WiFi Camera App — Project Conventions

> Reference: This skill captures the *observed* conventions actually used in the codebase. Generated code must blend in. The project is a WiFi astronomical camera controller app (HXY Cam / STAR) with three shooting modes: Landscape, Planet, and Deep Space.

## 1. Tech Stack (locked in)

- Expo SDK 54 + React Native 0.81.5 + React 19
- Expo Router 6 (file-based routes in `src/app/`)
- **Uniwind** (NOT classic NativeWind) — Tailwind v4 with `@theme` tokens in `src/global.css`
- **tailwind-variants** (`tv`) for component variants
- TypeScript strict
- Zustand + MMKV + React Query
- TanStack Form + Zod (zod v4 — no `@tanstack/zod-form-adapter`, do `validators: { onChange: schema as any }`)
- Custom **react-native-svg** charts (see `src/features/weather/line-chart.tsx`)
- **react-native-webview** for Stellarium Web Engine integration
- Inter font (loaded via `@expo-google-fonts/inter`)

## 2. Directory Layout (follow exactly)

```
src/
├── app/                          # Expo Router file-based routes
│   ├── _layout.tsx               # Root providers (GestureHandler, Keyboard, Theme, API, BottomSheet, FlashMessage, CameraProvider)
│   ├── (app)/                    # Authenticated tab group; decisions delegated to useAppGate
│   │   ├── _layout.tsx           # Calls useAppGate; renders <Redirect> or <Tabs>
│   │   ├── index.tsx             # Re-exports HomeScreen (one-liner)
│   │   ├── home.tsx             # Re-exports HomeScreen (same pattern)
│   │   ├── deep-space.tsx        # Deep Space screen (Stellarium integration)
│   │   ├── camera.tsx            # Re-exports CameraScreen (one-liner)
│   │   ├── album.tsx             # Re-exports AlbumScreen (one-liner)
│   │   └── settings/
│   │       ├── _layout.tsx
│   │       ├── index.tsx         # Re-exports SettingsScreen
│   │       ├── about.tsx         # Re-exports AboutScreen
│   │       ├── ota.tsx          # Re-exports OtaScreen
│   │       └── wifi-password.tsx
│   ├── onboarding.tsx
│   └── +html.tsx / [...messing].tsx
├── features/                     # Feature modules — see §3
│   ├── auth/                     # Auth state (Zustand + MMKV hydration)
│   ├── album/                    # Photo gallery (folders, image grid, viewer, download)
│   │   ├── album-screen.tsx
│   │   └── components/
│   ├── camera/                   # Camera control (WebSocket, capture, exposure, stream)
│   │   ├── camera-screen.tsx
│   │   ├── camera-context.tsx
│   │   ├── camera-store.ts      # Zustand store (Zustand selectors pattern)
│   │   ├── types.ts
│   │   ├── config.ts
│   │   └── services/
│   │       ├── websocket-service.ts
│   │       ├── websocket-protocol.ts
│   │       └── startup-service.ts
│   ├── home/                     # Home screen (connection status, mode grid, device cards)
│   │   ├── home-screen.tsx
│   │   └── components/
│   ├── onboarding/
│   ├── settings/                 # Settings (language, theme, OTA, WiFi password, about)
│   │   ├── settings-screen.tsx
│   │   ├── components/
│   │   └── screens/
│   └── stellarium/               # Stellarium Web Engine integration (deep-space star map)
│       ├── stellarium-view.tsx   # WebView wrapper
│       ├── stellarium-overlay.tsx # Overlay with toolbar + auto-follow
│       └── stellarium-service.ts  # postMessage bridge TS wrapper
├── components/
│   └── ui/                       # Base components — see §4
│       ├── icons/                # SVG icon set — see §5
│       └── colors.ts             # (⚠️ MISSING — see §6 note)
├── lib/
│   ├── api/                      # axios + React Query provider
│   │   ├── client.tsx
│   │   ├── provider.tsx
│   │   ├── utils.tsx
│   │   └── index.ts
│   ├── hooks/                    # use-is-first-time, use-selected-theme, use-app-gate
│   ├── i18n/                     # i18next setup, translate(), TxKeyPath
│   ├── storage-keys.ts           # Centralised MMKV key constants (STORAGE_KEYS)
│   ├── storage.tsx               # MMKV singleton (`storage`) + getItem/setItem/removeItem
│   ├── utils.ts                  # createSelectors, openLinkInBrowser
│   └── test-utils.tsx
├── translations/                 # en.json, ar.json, zh.json
└── global.css                    # @theme tokens (Tailwind v4) + dark mode
```

**Always use `@/` imports** (tsconfig path alias). Never use relative imports beyond a feature's own folder.

### 2.1 Storage Key Convention

Every key written to or read from the MMKV `storage` singleton MUST come from `STORAGE_KEYS` in `@/lib/storage-keys`. The on-disk string literals live in one place; call sites reference `STORAGE_KEYS.BOUND_DEVICE_ID` etc. Adding a new key = one edit to `storage-keys.ts` plus its call sites. Renaming an on-disk value is a data-migration event — do not change the literal without a migration plan.

### 2.2 Camera Communication

Camera communication is via **WebSocket** (not HTTP). The camera acts as a WiFi AP/STA and communicates over WebSocket:

```
Camera WebSocket Service (src/features/camera/services/websocket-service.ts)
  → Connects to getCameraWebSocketUrl()
  → Receives JSON messages: { device_name, instruction, data, power, ... }
  → Sends commands: { device_name, instruction, params, id }
```

Protocol: `CameraJsonMessage` for outgoing commands, `CameraWebSocketMessage` for incoming.

## 3. Feature Module Layout

Every feature follows this structure. `home/` is the canonical reference:

```
src/features/home/
├── home-screen.tsx               # Default export: <HomeScreen />
├── components/
│   ├── connection-status-card.tsx
│   ├── device-connection-modal.tsx
│   ├── device-info-cards.tsx
│   └── mode-grid.tsx
```

Rules:
- A feature's screen is exposed via a single named export, then re-exported by a route file in `src/app/`.
- Internal components live in `components/`, internal stores in the feature root.
- **No two features may own a "home" or other top-level screen.** Active work goes into `features/home/`.
- Route files in `src/app/(app)/` are one-liners: `export { FeatureScreen as default } from '@/features/home/home-screen'`

### 3.1 Navigation Gate

`(app)/_layout.tsx` does NOT contain business logic. It calls `useAppGate()` (from `@/lib/hooks/use-app-gate`), which returns a discriminated union:

- `{ kind: 'redirect', href: '/onboarding' | '/login' | '/device-setup' }` — render `<Redirect href=... />`
- `{ kind: 'tabs' }` — render `<Tabs>...</Tabs>`

The layout's only branch is `if (gate.kind === 'redirect') return <Redirect href={gate.href} />`. Adding a new gate condition (e.g. paid subscription, region lock) is a one-file change to `useAppGate` plus a new variant in the `AppDestination` union — never modify `(app)/_layout.tsx` to add new business conditions.

**Current gate priority**: first launch → onboarding, otherwise → tabs. Login and device-setup have been removed as explicit gates; device connection is handled via a modal on the home screen.

### 3.2 Tab Navigator

The tab navigator lives in `(app)/_layout.tsx` and renders 3 tabs:

| Tab | Route | Icon (focused) | Icon (unfocused) | Label |
|-----|-------|----------------|-------------------|-------|
| Home | `(app)/index` | `HomeFilled` | `HomeFilled` (focus-aware) | `home.title` |
| Deep Space | `(app)/deep-space` | `StarmapFilled` | `StarmapFilled` (focus-aware) | `deep_space.title` |
| Settings | `(app)/settings` | `SettingsFilled` | `SettingsFilled` (focus-aware) | `settings.title` |

`camera` and `album` routes exist but are `href: null` (not shown in tabs, navigated to programmatically).

## 4. Base UI Components (`src/components/ui/`)

Exported via `src/components/ui/index.tsx`:

| Component | Notes |
|---|---|
| `Button` | `tv()` variants: `default`, `secondary`, `outline`, `destructive`, `ghost`, `link`; sizes: `default`, `lg`, `sm`, `icon`; props: `label`, `loading`, `variant`, `size`, `disabled`, `fullWidth`, `className`, `textClassName` |
| `Text` | Wraps RN `Text`; supports `tx="key.path"` for i18n |
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

## 5. Icon System (`src/components/ui/icons/`)

- Every icon is a named function-component exporting from `react-native-svg`'s `Svg` + `Path` etc.
- Signature: `function X({ color, size = N, ...props }: SvgProps & { size?: number })`.
- Always re-exported through `icons/index.tsx`.
- **Before creating a new icon**, check `icons/index.tsx` and `icons/`. Reuse existing icons when possible.
- Tab bar icons accept a `focused: boolean` prop for styling difference.
- Stroke style convention: `strokeWidth={2}`, `strokeLinecap="round"`, `strokeLinejoin="round"`, `fill="none"`.
- Tab icons: `HomeFilled`, `SettingsFilled`, `StarmapFilled` (all filled variants for focused state).

## 6. Theme & Colors (the most error-prone area)

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
  | Screen bg | `bg-white` | `bg-black` / `bg-[#090a0c]` |
  | Card bg | `bg-neutral-100` | `bg-[#1A1A1A]` |
  | Tab bar bg | `bg-white` | `bg-[#0A0B0D]` |
  | Divider | `bg-neutral-200` | `bg-[#2C2C2C]` |
  | Primary text | `text-black` | `text-white` |
  | Secondary text | `text-neutral-500` | `text-charcoal-400` |
  | Tertiary text | `text-neutral-500` | `text-[#888888]` |
  | Icon | `#666` | `#B0B0B0` or `#888` |
  | Brand orange | `#FF7B1A` (primary-500) | same |

## 7. State Management

- **Global app state**: Zustand stores with the `createSelectors` helper from `@/lib/utils`. Pattern: `export const useFoo = createSelectors(_useFoo);` then consumers call `useFoo.use.fieldName()`.
  - See `useCameraStore` in `src/features/camera/camera-store.ts` as the canonical example.
- **Persisted state** (auth token, language, selected theme): MMKV via `useMMKVString(key, storage)` from `react-native-mmkv`, using the singleton `storage` from `@/lib/storage`.
- **Server state**: React Query, wrapped in `<APIProvider>` (`src/lib/api/provider.tsx`). `queryClient` is exported and devtools are enabled.
- **Camera state**: `useCameraStore` (Zustand + selectors). Access via `useCameraStore.use.<field>()`.

## 8. Camera WebSocket Protocol

Camera communication uses WebSocket (not HTTP REST):

```typescript
// Outgoing command (CameraJsonMessage)
{
  device_name: 'main_camera',
  instruction: 'start_exposure' | 'set_gain' | 'get_camera_status' | ...,
  params: unknown[],
  id: string,
}

// Incoming message (CameraWebSocketMessage)
{
  device_name: 'main_camera',
  instruction: 'get_camera_status' | 'battery' | 'disk' | ...,
  data?: CameraStatus,
  power?: number,
  in_charging?: 0 | 1,
  used_space?: number,
  all_space?: number,
}
```

Camera connects on app boot via `CameraProvider` in `src/app/_layout.tsx`. Store methods call `sendCameraCommand()` helper which wraps with the correct message shape.

## 9. i18n

- Locales: `en`, `ar`, `zh` (default). Add new locale = add JSON + entry in `src/lib/i18n/resources.ts`.
- Keys are namespaced by feature: `home.*`, `camera.*`, `album.*`, `settings.*`, `deep_space.*`, `onboarding.*`, `ota.*`.
- Use `<Text tx="home.title" />` for static strings.
- Use `translate('home.title')` from `@/lib/i18n` inside JS/TS code.
- Adding a key: add to **all three** JSON files; `TxKeyPath` is auto-derived from `en.json`, so en must be the canonical source.
- RTL: `ar` is the only RTL locale; `I18nManager.forceRTL` is set in `i18n/index.tsx` and `changeLanguage()` triggers a restart via `RNRestart` (or dev reload).

## 10. Forms

- Use `@tanstack/react-form` (`useForm`) + `zod`.
- zod v4 syntax only. No `@tanstack/zod-form-adapter` — pass validators as `validators: { onChange: schema as any }`.
- For per-field error display, use `getFieldError(field)` from `@/components/ui/form-utils`.
- Submit state via `form.Subscribe selector={state => [state.isSubmitting]}`.

## 11. Charts

- **Custom react-native-svg** — the preferred approach. See `src/features/weather/line-chart.tsx`, `multi-line-chart.tsx`, `chart-utils.ts`.
- Both implement the same UX: pan/tap tooltip, gradient area fill, grid lines, x/y labels, dark-mode aware colors.
- New chart components should follow the `line-chart.tsx` pattern: `PanResponder` for touch, `useMemo` for paths, `useUniwind` for theme, `containerRef.measure` for responsive width.

## 12. Screen Layout Conventions

- Every screen renders:
  ```tsx
  <>
    <FocusAwareStatusBar />
    <View className={`flex-1 ${isDark ? 'bg-black' : 'bg-white'}`}>
      {/* Screen content */}
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        ...
      </ScrollView>
    </View>
  </>;
  ```
- Top area: `pt-12 pb-2` for the title row on home screen; use `pt-12` for safe area.
- Sub-screens use `<ScreenHeader title={translate('...')} />` at the top.
- Horizontal padding: `mx-4` or `mx-5` / `mx-6` for cards and lists.
- Cards: `rounded-[15px]` (or `rounded-2xl`), `px-5 py-6` for big cards.
- Tab bar renders 3 tabs: Home / Deep Space / Settings (see §3.2).

## 13. Stellarium Web Engine Integration

The app integrates Stellarium Web Engine via `react-native-webview` for the Deep Space shooting mode. Key files:

```
src/features/stellarium/
├── stellarium-view.tsx          # WebView wrapper; platform-specific HTML path
├── stellarium-overlay.tsx        # Full-screen overlay with toolbar + auto-follow
└── stellarium-service.ts         # postMessage TS bridge (gotoRaDec, zoomTo, searchTarget...)
```

Architecture:
- Stellarium is a **full-screen overlay** on the Deep Space screen, not a separate page.
- WebView HTML path: iOS `'stellar/index.html'`, Android `'file:///android_asset/stellar/index.html'`
- postMessage JSON format: `{ type: 'goto_radec', ra, dec, duration }`, `{ type: 'zoom_to', fov, duration }`, etc.
- `StellariumOverlay` listens to `currentRaDec` from `useCameraContext()` and auto-follows camera pointing.
- WebView is mounted/unmounted based on `visible` prop — pre-initialization via opacity=0 is a future optimization.

## 14. Hard Rules (don't break these)

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
- ❌ Do NOT add a `DeviceSetupScreen` switch component — device connection is handled via modal on home screen.
- ❌ Do NOT add business-state reads to `(app)/_layout.tsx` — extend `useAppGate` instead.
- ❌ Do NOT use HTTP for camera communication — the camera uses WebSocket protocol.
- ✅ DO use `EXPO_PUBLIC_*` prefix for env vars exposed to the app.
- ✅ DO run `pnpm check-all` (lint + type-check + translations + tests) before declaring done.
- ✅ DO write tests for new `src/components/ui/*` components (see `button.test.tsx` for the pattern).
- ✅ DO prefer the existing screens in `src/features/home/` as the visual reference for new screens.

## 15. Common Commands

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

## 16. When in Doubt

1. Find a similar existing screen and mirror its structure (`grep` for `useUniwind`, `rounded-[15px]`, `mx-5`, `translate(`).
2. Prefer copying patterns from `src/features/home/` (canonical for main screens) and `src/features/settings/screens/` (canonical for sub-screens with `ScreenHeader`).
3. For camera-related code, look at `src/features/camera/camera-store.ts` and `src/features/camera/camera-context.tsx`.
4. For Stellarium integration, see `src/features/stellarium/stellarium-view.tsx` and `src/features/stellarium/stellarium-overlay.tsx`.
5. If a new color is needed and not in `global.css`, add a token there and use the resulting Tailwind class.
6. If unsure about i18n keys, run `grep -r "tx=\"" src/` to see real usage.
