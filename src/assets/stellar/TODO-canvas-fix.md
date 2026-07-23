# iOS Touch Fix — `canvas.js` Modification Required

> **Status**: TODO (requires recompile)
>
> **File**: `stellarium-web-engine/src/js/canvas.js`
>
> **Problem**: iOS WKWebView passive touch listeners block `preventDefault()`, causing page scroll/bounce during star chart drag

---

## Problem Description

On iOS WKWebView, the Stellarium Web Engine's canvas has a touch handling issue that prevents smooth star chart dragging.

### Root Cause

The `touchstart` and `touchend` event listeners in `canvas.js` use `{ passive: true }` (or no passive declaration, which defaults to `true` in modern browsers).

When `passive: true`:
- The browser assumes the event handler **will not** call `e.preventDefault()`
- iOS Safari/WKWebView proceeds with default gestures (scroll, bounce, pinch-zoom) **immediately**
- Even if the handler later tries to call `preventDefault()`, it has **no effect**
- Result: star chart drag + page scroll happen simultaneously → broken UX

### Problem Chain

```
User drags finger on star chart
  │
  ▼
iOS WKWebView receives touchstart
  │
  ├─ canvas.js has {passive: true} listener
  │   → No preventDefault() called
  │   → Browser thinks "scroll is allowed"
  │
  ├─ Browser starts gesture recognizer
  │   → Page scroll / rubber-band bounce / pinch-zoom
  │
  └─ Result: Star chart jumps + page scrolls → unusable
```

---

## Required Fix (3 Locations)

### Fix 1: `touchstart` event listener (~L106)

**Before:**
```javascript
canvas.addEventListener('touchstart', function(e) {
    var rect = canvas.getBoundingClientRect();
    for (var i = 0; i < e.changedTouches.length; i++) {
        var id = e.changedTouches[i].identifier;
        var relX = e.changedTouches[i].pageX - rect.left;
        var relY = e.changedTouches[i].pageY - rect.top;
        Module._core_on_mouse(id, 1, relX, relY, 1);
    }
}, {passive: true});
```

**After:**
```javascript
canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();  // ← ADD: Prevent browser default gestures
    var rect = canvas.getBoundingClientRect();
    for (var i = 0; i < e.changedTouches.length; i++) {
        var id = e.changedTouches[i].identifier;
        var relX = e.changedTouches[i].pageX - rect.left;
        var relY = e.changedTouches[i].pageY - rect.top;
        Module._core_on_mouse(id, 1, relX, relY, 1);
    }
}, {passive: false});  // ← CHANGE: false allows preventDefault()
```

---

### Fix 2: `touchend` event listener (~L117)

**Before:**
```javascript
canvas.addEventListener('touchend', function(e) {
    // ... existing logic ...
});
```

**After:**
```javascript
canvas.addEventListener('touchend', function(e) {
    e.preventDefault();  // ← ADD: Prevent browser default gestures
    // ... existing logic ...
}, {passive: false});  // ← ADD: Explicit passive:false
```

---

### Fix 3: HTML shell CSS (already done in `index.html`)

```css
canvas {
    touch-action: none;  /* Tell browser: element handles all touches */
}
```

---

## How to Apply

### Step 1: Modify `canvas.js`

Locate `stellarium-web-engine/src/js/canvas.js` and apply the two changes above.

### Step 2: Recompile the Engine

After modifying `canvas.js`, you must recompile the engine:

```bash
cd stellarium-web-engine

# Activate Emscripten
source emsdk_env.sh

# Compile JavaScript/WebAssembly build
make js
```

### Step 3: Copy Build Outputs

Copy the following files from `build/js/` to `src/assets/stellar/`:

- `stellarium-web-engine.js`
- `stellarium-web-engine.wasm`

---

## Platform Behavior Summary

| Platform | touchstart passive:true impact | Fix needed? |
|----------|------------------------------|--------------|
| iOS WKWebView | **Severe** — scroll/bounce blocks drag | **Yes** |
| iOS Safari | Same as WKWebView | **Yes** |
| Android WebView | Moderate — scroll conflicts | Recommended |
| Android Chrome | Low — usually works | Optional |
| Desktop browsers | None | No |

---

## Reference

Full requirements: [Stellarium × React Native — 触控与平台适配分析](../../../../../../stellarium-task/参考-触控适配.md)

See also: [Stellarium Web Engine Integration README](./README.md)
