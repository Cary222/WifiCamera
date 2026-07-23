# Stellarium Web Engine — Assets

This directory contains the Stellarium Web Engine integration files for the HXY Cam React Native app.

## Contents

```
src/assets/stellar/
├── index.html                    # HTML shell (this file loads the engine)
├── TODO-canvas-fix.md            # iOS touch fix documentation
├── README.md                     # This file
├── stellarium-web-engine.js      # [PLACEHOLDER] Build output from Stellarium
├── stellarium-web-engine.wasm    # [PLACEHOLDER] WebAssembly binary
└── data/                         # [PLACEHOLDER] Star catalog data
```

## Files Overview

### `index.html` (✅ Ready)

HTML shell that:
- Loads `stellarium-web-engine.js`
- Initializes `StelWebEngine` with the canvas
- Handles `postMessage` from React Native
- Sends messages back to RN (`engine_ready`, `context_lost`, `context_restored`)
- Includes CSS fixes for iOS touch compatibility

### `stellarium-web-engine.js` & `.wasm` (❌ Placeholder)

**These are build outputs, not source files.** They are compiled from the Stellarium Web Engine C source code via Emscripten.

To get them:
1. Install [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html)
2. Clone the Stellarium repository:
   ```bash
   git clone https://github.com/Stellarium/stellarium.git
   cd stellarium/web-engine
   ```
3. Activate Emscripten:
   ```bash
   source emsdk_env.sh
   ```
4. Compile:
   ```bash
   make js
   ```
5. Copy from `build/js/` to this directory:
   ```bash
   cp build/js/stellarium-web-engine.js src/assets/stellar/
   cp build/js/stellarium-web-engine.wasm src/assets/stellar/
   ```

> **Important**: After copying, apply the iOS touch fix before deployment (see below).

## iOS Touch Fix (Required)

Before deploying to iOS, you **must** apply the touch fix to the Stellarium source and recompile. Without this fix, star chart dragging will trigger page scroll/bounce on iOS WKWebView.

See [TODO-canvas-fix.md](./TODO-canvas-fix.md) for full instructions.

Quick summary:
1. Modify `stellarium-web-engine/src/js/canvas.js`:
   - Change `touchstart` listener: `{passive: true}` → `{passive: false}` + add `e.preventDefault()`
   - Change `touchend` listener: add `{passive: false}` + add `e.preventDefault()`
2. Recompile: `make js`
3. Copy the new build outputs here

## Platform Paths

The `StellariumView` component loads the HTML differently per platform:

| Platform | Path |
|----------|------|
| iOS | `stellar/index.html` (bundled in app bundle) |
| Android | `file:///android_asset/stellar/index.html` |

Android requires copying assets to `android/app/src/main/assets/stellar/`.

## PostMessage API

### Messages from React Native → Stellarium

```typescript
// Go to specific sky coordinates
{ type: 'goto_radec', ra: number, dec: number, duration?: number }

// Zoom to specific field of view
{ type: 'zoom_to', fov: number, duration?: number }

// Search for a celestial object
{ type: 'search_target', name: string }

// Toggle constellation lines
{ type: 'toggle_constellations', visible: boolean }

// Set telescope FOV frame
{ type: 'set_fov_frame', fov: number, sensorW: number, sensorH: number }
```

### Messages from Stellarium → React Native

```typescript
// Sent when engine finishes initialization
{ type: 'engine_ready' }

// Sent when WebGL context is lost (e.g., backgrounded on iOS)
{ type: 'context_lost' }

// Sent when WebGL context is restored
{ type: 'context_restored' }

// Sent on error
{ type: 'error', message: string }
```

## Integration Components

The React Native integration consists of:

- `src/features/stellarium/stellarium-view.tsx` — WebView wrapper component
- `src/features/stellarium/stellarium-overlay.tsx` — Full-screen overlay with toolbar
- `src/features/stellarium/stellarium-service.ts` — postMessage TypeScript wrapper

See the [main integration docs](../../../../stellar-task/README.md) for full architecture details.

## Reference

- [Stellarium Web Engine Repository](https://github.com/Stellarium/stellarium)
- [Task Requirements](../../../../stellar-task/README.md)
- [Technical Integration Analysis](../../../../stellar-task/参考-技术方案.md)
- [Touch Compatibility Fix](../../../../stellar-task/参考-触控适配.md)
