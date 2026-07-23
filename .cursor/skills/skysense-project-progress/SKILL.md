---
name: skysense-project-progress
description: Track and report SkySense app development progress across all phases. Use when the user asks about project status, progress, what is next, or current phase.
disable-model-invocation: true
---

# SkySense Project Progress Tracker

## Current Phase: Phase 7 (Device Provisioning & Binding)

**Phase 7: Device Provisioning & Binding** — IN PROGRESS

> Snapshot taken: 2026-06-16. App code on `src/` is largely feature-complete through Phase 5; native build (Phase 1) and cloud sync (Phase 6) are still pending hardware / backend.
>
> Cleanup pass 2026-06-16: removed `src/features/feed/` (Obytes template residue), introduced `useAppGate` hook + `app/(app)/device-setup/` route group (replaces the in-layout `<DeviceSetupScreen />`), centralised MMKV keys in `src/lib/storage-keys.ts`.

---

## All Phases

### Phase 0: Rename & Initialize
- **Status**: COMPLETED — 2026-05-29
- **Key Deliverables**:
  - [x] Renamed `obytesapp` → `skysense-app`
  - [x] Updated bundle IDs: `com.obytes.*` → `com.skysense.*`
  - [x] Updated EAS project, slug, scheme, app name
  - [x] Created `src/features/skysense/dashboard-screen.tsx` (placeholder, since superseded by `features/dashboard/`)
  - [x] Updated CLAUDE.md, README.md, translations with SkySense context
  - [x] Fixed zod v4 vs @tanstack/zod-form-adapter conflict (removed adapter)
  - [x] Fixed react-native-screens version (locked to ~4.25.x for RN 0.81.5)
  - [x] Installed pnpm and upgraded to Node 20 for metro-config compatibility

### Phase 1: Run App + Build APK
- **Status**: PARTIALLY COMPLETED (dev server verified, native build pending)
- **Goal**: Verify the app runs and produces a working APK
- **Steps**:
  - [x] Run `pnpm install` to install dependencies
  - [x] Run `pnpm start` to verify dev server starts (Metro running OK — confirmed in terminal 2.txt)
  - [ ] Run `pnpm prebuild` to generate `android/` directory (no `android/` folder exists yet)
  - [ ] Run `cd android && ./gradlew assembleDebug` to build debug APK
  - [ ] Install APK on device and verify it launches
- **Notes**:
  - `app.config.ts` is fully configured (Inter font, splash, edge-to-edge, EAS project ID `13d38557-…`).
  - To resume: `pnpm prebuild` then `pnpm android` (which runs `expo run:android`).

### Phase 2: ESP8266 Communication (HTTP API)
- **Status**: COMPLETED (mock layer, no real HTTP yet)
- **Goal**: Establish HTTP communication with ESP8266 device
- **Steps**:
  - [x] Define measurement data model (SQM, temp, humidity, pressure, battery) — `src/features/dashboard/hooks/use-measurement-store.ts`
  - [x] Create HTTP service layer in `src/services/api/` — axios client set up at `src/lib/api/client.tsx` + React Query provider at `src/lib/api/provider.tsx` (no ESP8266 endpoint calls yet, but the transport is ready)
  - [x] Implement mock data for development — `useMeasurementStore.startMock()` ticks every 60s with realistic jitter
  - [x] Add device heartbeat/online-status logic — `Device` type + `useDeviceStore` track `available | connecting | connected | unavailable` and signal strength; device header shows a green online dot
- **Files (created)**: `src/features/dashboard/hooks/use-measurement-store.ts`, `src/features/device/use-device-store.tsx`, `src/features/device/types.ts`, `src/lib/api/{client,provider}.{ts,tsx}`
- **Files (planned, not yet)**: `src/services/api/measurements.ts`, `src/services/api/devices.ts` — currently the store reads/writes in-process; no HTTP calls to ESP8266 yet.

### Phase 3: Dashboard Core UI
- **Status**: COMPLETED
- **Goal**: Build the main monitoring dashboard with real-time data display
- **Steps**:
  - [x] SQM card (large number, "Quality Sky" label, "SQM" tag) — `SkyInfoCard`
  - [x] Sensor grid (temperature, humidity, pressure) — `SensorTripod` (3-column card row)
  - [x] Battery / WiFi / Bluetooth status icons in the device header — `DeviceHeader`
  - [x] Real-time data refresh — `startMock` interval at 60s, kept in `history` (last 60 points)
  - [x] Dark mode optimization — `useUniwind` driven, separate light/dark token tables in `global.css`
  - [x] Real-time trend chart (last hour, SQM) — `TrendChart` (custom react-native-svg, catmull-rom smoothed, pan-tooltip)
  - [x] Tabs: Dashboard / Weather / Profile wired up in `(app)/_layout.tsx`
- **Files**: `src/features/dashboard/{dashboard-screen.tsx,components/{device-header,sky-info-card,sensor-tripod,trend-chart}.tsx,hooks/use-measurement-store.ts}`

### Phase 4: Device Management Module
- **Status**: COMPLETED
- **Goal**: Allow users to add, view, and manage ESP8266 devices
- **Steps**:
  - [x] Device list screen with scan/connect — `device-list-screen.tsx` (sectioned list: Available / Other)
  - [x] Device bound/connected screen with "Start Using" CTA — `device-connected-screen.tsx`
  - [x] Device detail screen — `features/profile/screens/device-detail-screen.tsx` (Name, Version, Model, Serial)
  - [x] WiFi detail screen — `features/profile/screens/wifi-detail-screen.tsx` (SSID, IP, Subnet, MAC, Signal)
  - [x] Bind / unbind flow — `useBoundDeviceId` + `useBoundDeviceName` in MMKV; `clearBoundDevice()` resets; `device-setup-screen` decides which screen to show based on bound state
  - [x] Online/offline status — `Device.status` (`available | connecting | connected | unavailable`); green dot in header
  - [x] Device info (firmware version, last-seen) — fields exist in detail screens (FALLBACK_VERSION=1.0 today, real wiring in Phase 7)
- **Files**: `src/features/device/{screens/{device-list,device-connected,device-setup}-screen.tsx,use-device-store.tsx,types.ts,components/{device-list-item,section-header}.tsx}`

### Phase 5: Historical Data & Charts
- **Status**: COMPLETED
- **Goal**: Display historical SQM data with trend charts
- **Steps**:
  - [x] History screen with day selector — `WeatherScreen` + `DaySelector` (Mon–Sun, last N days)
  - [x] Chart library integrated — both `react-native-gifted-charts` (dep installed) and **custom `react-native-svg` charts** (the ones actually used: `line-chart.tsx`, `multi-line-chart.tsx`, `chart-utils.ts`)
  - [x] SQM trend visualization (full day) — Chart 1 in `weather-screen.tsx` (24h, gradient area, y-axis 17–22)
  - [x] Multi-metric comparison (temp / humidity / pressure) — Chart 2 (independent y-ranges per metric)
  - [x] All-metrics combined chart — Chart 3 (SQM filled, plus the three other metrics, with legend)
  - [x] Data aggregation — implicit via mock generator (`generateWeekData`); avg/max/min *not* computed yet (could be added in a future refinement)
- **Files**: `src/features/weather/{weather-screen.tsx,line-chart.tsx,multi-line-chart.tsx,chart-utils.ts,mock-data.ts,types.ts,components/day-selector.tsx}`

### Phase 6: User System + Supabase
- **Status**: IN PROGRESS (UI + store complete, backend not yet wired)
- **Goal**: Add user authentication and cloud data sync
- **Steps**:
  - [x] Login screen with TanStack Form + Zod — `src/features/auth/login-screen.tsx` + `components/login-form.tsx`
  - [x] Auth store with Zustand + selectors — `src/features/auth/use-auth-store.tsx` (`signIn`, `signOut`, `status: 'idle' | 'signIn' | 'signOut'`)
  - [x] Auth state hydration on app boot — `hydrateAuth()` called in `src/app/_layout.tsx`
  - [x] Splash / login / onboarding routing — `signOut` → redirect to `/login`; `signIn` → push `/`
  - [x] Account screen UI — `src/features/profile/screens/account-screen.tsx` (username, email, phone, bio; save handler currently just `Alert.alert`)
  - [ ] Supabase integration (auth + Postgres) — *not started*; no `@supabase/supabase-js` dependency
  - [ ] JWT token storage with MMKV — `signIn` currently hard-codes fake tokens (`{access, refresh}`); MMKV key not yet defined
  - [ ] Sync measurement data to Supabase — `useMeasurementStore` still pure-mock
  - [ ] Offline queue with auto-retry — not started
  - [ ] Multi-device account linking — not started
- **Files (created)**: `src/features/auth/{login-screen.tsx,use-auth-store.tsx,components/login-form.tsx}`, `src/features/profile/screens/account-screen.tsx`
- **Files (planned)**: `src/services/supabase/`, MMKV keys `AUTH_ACCESS_TOKEN` / `AUTH_REFRESH_TOKEN`

### Phase 7: Device Provisioning & Binding
- **Status**: IN PROGRESS (UI / mock complete, real provisioning not yet)
- **Goal**: Allow users to provision and bind new ESP8266 devices via the app
- **Steps**:
  - [x] Device discovery via mDNS-or-equivalent — currently `useDeviceStore.scan()` returns hard-coded `MOCK_DEVICES`; UX (scanning spinner, sectioned list) is ready for swap
  - [x] Device binding confirmation UI — `device-connected-screen.tsx` shows bound device with "Start Using" CTA and "Device not found? Reset" link
  - [x] Connection state feedback — green dot, `connecting` state, "Discover" header
  - [ ] WiFi provisioning flow (SmartConfig / AP mode) — *not started*; no BLE, no WiFi-AP UI
  - [ ] Real binding (writing the device ID to the device's flash) — *not started*
  - [ ] MQTT support (future-proof) — *not started*
- **Files (created)**: `src/features/device/screens/*`, `src/features/device/use-device-store.tsx`
- **Files (planned)**: `src/features/device/provision-screen.tsx`, `src/services/ble/`, `src/services/mqtt/`

---

## How to Use This Skill

When the user asks:
- "What's the current progress?" → Report current phase and what's done/pending
- "What should I do next?" → Point to the current phase's next step
- "Update phase status" → Mark the current phase as complete and advance
- "Is phase X done?" → Check the phase status and report

## Updating Phase Status

When a phase is completed:

1. Mark all steps in the phase as `[x]`
2. Change phase status to `COMPLETED`
3. Move to next phase, change its status to `IN PROGRESS`
4. Update the "Current Phase" header at the top of this file
5. Add a "Date:" line under the phase status with `YYYY-MM-DD`

## Quick reference: what still needs work

| Area | Status | Blocker |
|---|---|---|
| Android APK build | ❌ | `pnpm prebuild` never run; no `android/` dir on disk |
| Login → real backend | ❌ | `signIn` mocks tokens; no Supabase / API URL integration |
| ESP8266 over HTTP | ❌ | `src/services/api/{devices,measurements}.ts` not written |
| WiFi provisioning (BLE / SmartConfig) | ❌ | New feature, requires native deps |
| History aggregation (avg/max/min) | ⚠️ | Optional polish; not in spec blocker |
| `colors.ts` (TS) | ⚠️ | Imported by `use-theme-config.tsx` & `screen-header.tsx` but file is missing — only a JS stub (`colors.js`) exists. Add a TS module with the same shape from `global.css`. |
| Navigation gate (post-cleanup) | ✅ DONE 2026-06-16 | `(app)/_layout.tsx` delegates to `useAppGate`; device-setup is a real route group. Future gates (subscription, region) extend the hook, not the layout. |
| MMKV key centralisation | ✅ DONE 2026-06-16 | All 6 keys live in `src/lib/storage-keys.ts`; no string literals at call sites. |
