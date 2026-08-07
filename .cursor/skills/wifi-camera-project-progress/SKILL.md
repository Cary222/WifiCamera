---
name: wifi-camera-project-progress
description: Track and report WiFi Camera app development progress across all phases. Use when the user asks about project status, progress, what is next, or current phase.
disable-model-invocation: true
---

# WiFi Camera App — Project Progress Tracker

## Current Phase: Phase 5 (Stellarium Web Engine Integration)

**Phase 5: Stellarium Web Engine Integration** — IN PROGRESS

> Snapshot taken: 2026-08-07. The app has completed foundational UI through Phase 4. The new focus is integrating Stellarium Web Engine for deep-space star map functionality.
>
> Key architectural changes 2026-08-07:
> - Removed `src/features/device/` (device scan/connect was a template residue)
> - Removed `src/app/device-setup/` (connection handled via modal on home screen)
> - Removed `src/app/login.tsx` (login gate removed from `useAppGate`)
> - Renamed app conventions skill to `wifi-camera-app-conventions`
> - Added `src/features/stellarium/` with WebView bridge + overlay
> - App now has 3 tabs: Home / Deep Space / Settings

---

## All Phases

### Phase 0: Rename & Initialize
- **Status**: COMPLETED — 2026-05-29
- **Key Deliverables**:
  - [x] Renamed `obytesapp` → `wifi-camera`
  - [x] Updated bundle IDs: `com.obytes.*` → appropriate identifiers
  - [x] Updated EAS project, slug, scheme, app name
  - [x] Updated CLAUDE.md, README.md, translations with WiFi Camera context
  - [x] Fixed zod v4 vs @tanstack/zod-form-adapter conflict (removed adapter)
  - [x] Fixed react-native-screens version (locked to ~4.25.x for RN 0.81.5)
  - [x] Installed pnpm and upgraded to Node 20 for metro-config compatibility

### Phase 1: Run App + Build APK
- **Status**: COMPLETED (dev server verified, native build pending)
- **Goal**: Verify the app runs and produces a working APK
- **Steps**:
  - [x] Run `pnpm install` to install dependencies
  - [x] Run `pnpm start` to verify dev server starts
  - [ ] Run `pnpm prebuild` to generate `android/` directory
  - [ ] Run `cd android && ./gradlew assembleDebug` to build debug APK
  - [ ] Install APK on device and verify it launches
- **Notes**:
  - `app.config.ts` is fully configured (Inter font, splash, edge-to-edge, EAS project ID).

### Phase 2: Camera Communication (WebSocket Protocol)
- **Status**: COMPLETED
- **Goal**: Establish WebSocket communication with the camera device
- **Steps**:
  - [x] Define camera data model — `src/features/camera/types.ts`
  - [x] Create WebSocket service layer — `src/features/camera/services/websocket-service.ts`
  - [x] Implement camera store with Zustand selectors — `src/features/camera/camera-store.ts`
  - [x] Add CameraProvider to root layout — `src/app/_layout.tsx`
  - [x] Camera connects on boot, tracks connection status, battery, disk space
- **Files (created)**: `src/features/camera/{camera-store.ts, camera-context.tsx, types.ts, config.ts, services/{websocket-service.ts, websocket-protocol.ts, startup-service.ts}}`

### Phase 3: Home Screen Core UI
- **Status**: COMPLETED
- **Goal**: Build the main home screen with connection status and shooting mode selection
- **Steps**:
  - [x] Home screen with connection status card — `ConnectionStatusCard`
  - [x] Device info cards (battery, storage) — `DeviceInfoCards`
  - [x] Mode grid (Landscape, Planet, Starry Sky, Album) — `ModeGrid`
  - [x] Device connection modal — `DeviceConnectionModal`
  - [x] Dark mode optimization — `useUniwind` driven
  - [x] Tab navigator: Home / Deep Space / Settings wired up
- **Files**: `src/features/home/{home-screen.tsx,components/{connection-status-card,device-connection-modal,device-info-cards,mode-grid}.tsx}`

### Phase 4: Camera & Album Screens
- **Status**: COMPLETED
- **Goal**: Camera capture controls and photo gallery
- **Steps**:
  - [x] Camera screen with preview area — `PreviewArea`
  - [x] Mode selector (RAW / STREAM / DEEP) — `ModeSelector`
  - [x] Exposure presets (Saturn, Jupiter, Moon presets) — `ExposurePresets`
  - [x] Capture controls (single capture, repeat sequence) — `CaptureControls`
  - [x] Exposure controls (gain, stretch) — `ExposureControls`
  - [x] Countdown display — `CountdownDisplay`
  - [x] Album screen with folder list — `FolderList`
  - [x] Image grid with viewer — `ImageGrid`, `ImageViewer`
  - [x] Download progress tracking — `DownloadProgress`
- **Files**: `src/features/camera/`, `src/features/album/`

### Phase 5: Stellarium Web Engine Integration
- **Status**: IN PROGRESS
- **Goal**: Embed Stellarium Web Engine in the Deep Space screen for offline star map functionality
- **Reference**: `docs/stellarium-task/README.md` and `docs/WiFi相机-应用层架构资料-v3(1)/`
- **Steps**:
  - [x] Created `src/features/stellarium/stellarium-view.tsx` — WebView wrapper with platform-specific HTML paths
  - [x] Created `src/features/stellarium/stellarium-overlay.tsx` — Full-screen overlay with toolbar + auto-follow
  - [x] Created `src/features/stellarium/stellarium-service.ts` — postMessage TS bridge
  - [x] Deep Space screen with 3 view states (shooting / stellarium / plan) — `src/app/(app)/deep-space.tsx`
  - [ ] Prepare `stellar/` assets (index.html + WASM + star catalog data)
  - [ ] Implement `currentRaDec` → `gotoRaDec` auto-follow (connect to actual camera solving)
  - [ ] iOS / Android asset bundling (copy stellar/ to native assets)
  - [ ] Phase 0: Compile Stellarium Web Engine → `.js` + `.wasm` + star data
  - [ ] Phase 1: HTML shell + JS Bridge + postMessage bidirectional communication
  - [ ] Phase 2: Integration into app (preload strategy, context lost handling)
  - [ ] Phase 3: Experience polish (search, constellation toggle, FOV frame)
- **Files (created)**: `src/features/stellarium/{stellarium-view.tsx, stellarium-overlay.tsx, stellarium-service.ts}`
- **Files (planned)**: `src/assets/stellar/`, Android `assets/stellar/`, iOS bundle resources
- **Key reference docs**:
  - `docs/stellarium-task/参考-技术方案.md` — RN architecture integration points
  - `docs/stellarium-task/参考-触控适配.md` — iOS/Android touch differences, canvas.js fix (5 lines)
  - `docs/stellarium-task/参考-引擎API.md` — Stellarium JS API reference
  - `docs/stellarium-task/Stellarium-RN-集成全景.html` — Visual overview (open in browser)
  - `docs/WiFi相机-应用层架构资料-v3(1)/15-WiFi相机嵌入式应用层与断连同步完整架构.md` — Camera firmware architecture

### Phase 6: Settings & OTA
- **Status**: COMPLETED
- **Goal**: Settings, language, theme, firmware update
- **Steps**:
  - [x] Settings screen with language, theme, OTA, WiFi password, about
  - [x] Language switcher (en/ar/zh) with RTL support
  - [x] Theme switcher (light/dark/system)
  - [x] OTA update screen
  - [x] WiFi password change screen
  - [x] About screen
- **Files**: `src/features/settings/`, `src/app/(app)/settings/`

### Phase 7: User System + Supabase
- **Status**: PENDING (UI + store complete, backend not yet wired)
- **Goal**: Add user authentication and cloud data sync
- **Steps**:
  - [x] Auth store with Zustand + MMKV hydration — `src/features/auth/use-auth-store.tsx`
  - [ ] Supabase integration (auth + Postgres) — *not started*
  - [ ] JWT token storage with MMKV — *pending*
  - [ ] Sync measurement data to cloud — *not started*
  - [ ] Offline queue with auto-retry — *not started*

---

## Architectural Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-16 | Remove `device-setup/` route group; handle connection via modal | Simplify navigation; connection is contextual to home |
| 2026-06-16 | Remove login gate from `useAppGate`; go directly from onboarding to tabs | Reduce auth complexity for initial release |
| 2026-06-16 | Centralize MMKV keys in `src/lib/storage-keys.ts` | Single source of truth for storage key literals |
| 2026-08-07 | Use WebSocket (not HTTP) for camera communication | Camera acts as WiFi AP; WebSocket supports real-time streaming |
| 2026-08-07 | Stellarium as overlay (not independent page) | WebView + WASM init takes 1-3s; overlay pre-initializes once |
| 2026-08-07 | 3 tabs: Home / Deep Space / Settings | Simplified navigation; camera/album accessed via home mode grid |

---

## How to Use This Skill

When the user asks:
- "What's the current progress?" → Report current phase and what's done/pending
- "What should I do next?" → Point to the current phase's next step
- "Update phase status" → Mark the current phase as complete and advance
- "Is phase X done?" → Check the phase status and report
- "What about Stellarium?" → Focus on Phase 5 details and reference docs

## Updating Phase Status

When a phase is completed:

1. Mark all steps in the phase as `[x]`
2. Change phase status to `COMPLETED`
3. Move to next phase, change its status to `IN PROGRESS`
4. Update the "Current Phase" header at the top of this file
5. Add a "Date:" line under the phase status with `YYYY-MM-DD`

## Quick Reference: What Still Needs Work

| Area | Status | Notes |
|------|--------|-------|
| Android APK build | ❌ | `pnpm prebuild` never run; no `android/` dir on disk |
| Stellarium WASM compilation | ❌ | Phase 0 of Stellarium integration; needs Emscripten |
| Stellarium HTML shell | ❌ | Phase 1; needs `index.html` + asset_set_hook |
| Stellarium auto-follow RA/Dec | ⚠️ | Placeholder wired; needs real camera solving integration |
| Login → real backend | ❌ | Auth store mocks tokens; no Supabase integration |
| Camera over HTTP | ✅ DONE | Using WebSocket protocol instead |
| History aggregation (avg/max/min) | ⚠️ | Optional polish; not in spec blocker |
| `colors.ts` (TS) | ⚠️ | Imported by `use-theme-config.tsx` & `screen-header.tsx` but file is missing |
| Navigation gate (post-cleanup) | ✅ DONE | `useAppGate` handles onboarding; login/device-setup removed |
| MMKV key centralisation | ✅ DONE | All keys in `src/lib/storage-keys.ts` |

## Stellarium Integration Checklist

### New Files Needed
- [ ] `src/assets/stellar/index.html` — HTML shell + StelWebEngine init + postMessage handler
- [ ] `src/assets/stellar/stellarium-web-engine.js` — JS glue (from Emscripten build)
- [ ] `src/assets/stellar/stellarium-web-engine.wasm` — WASM binary (from Emscripten build)
- [ ] `src/assets/stellar/data/` — Star catalog (HiPS tiles), DSO, constellations
- [ ] `android/app/src/main/assets/stellar/` — Copy of `src/assets/stellar/`
- [ ] iOS Xcode: Add `stellar/` to Bundle Resources

### Modifications Needed
- [ ] `docs/stellarium-task/参考-触控适配.md` — Fix `canvas.js` L106: `passive:true` → `{passive:false}` + `e.preventDefault()`
- [ ] `StellariumOverlay` — Wire `currentRaDec` from `useCameraContext()` to `gotoRaDec`
- [ ] `StellariumView` — Add `context_lost` / `context_restored` handlers
- [ ] `package.json` — Add copy scripts: `stellar:copy-android`, `stellar:copy-ios`

### Platform Configuration
- [ ] Android: `androidLayerType="hardware"` for WebGL
- [ ] iOS: `WKWebView` supports WebGL 2.0 on A12+ (iPhone XS+)
- [ ] Both: WebView props: `scrollEnabled={false}`, `bounces={false}`, `overScrollMode="never"`
