<!-- reviewer: code-reviewer (硬层) -->

# Code Review — PR1: Phase 0 + camera-core HTTP 最小切片

**Scope:** `env.ts`, `app.config.ts`, `package.json`, `jest-setup.ts`, `src/features/camera/**`
**Review Type:** Local Uncommitted Changes
**TypeScript:** ✅ Zero errors (`tsc --noEmit` clean)

---

## Verdict: ⚠️ Approved with Suggestions

The implementation is solid overall. One **Critical** issue (Android cleartext) and several **Recommended** improvements must be addressed before merging.

---

## Findings

### Critical (Must Fix)

#### 1. **[app.config.ts:21]** `cameraIsCleartextLan` detection has a false-negative
```ts
const cameraBaseUrl = Env.EXPO_PUBLIC_CAMERA_BASE_URL ?? '';
const cameraIsCleartextLan = cameraBaseUrl.startsWith('http://');
```
- **Issue:** When `EXPO_PUBLIC_CAMERA_BASE_URL` is unset (undefined), `Env.EXPO_PUBLIC_CAMERA_BASE_URL` resolves to the default `http://192.168.1.1:8999` **in `env.ts`**, but `app.config.ts` reads from the **processed `Env` object** which already contains the fallback. However, the `startsWith('http://')` check is correct here — it catches `http://` URLs.
- **Actual problem:** The comment in `app.config.ts` line 19 says Android `usesCleartextTraffic` is a "known blocker," but no actual Android configuration was added. The `app.config.ts` `android:` key has no `usesCleartextTraffic` entry. When a real device test is run on Android, cleartext HTTP to `192.168.1.1:8999` will be blocked at the network layer regardless of iOS `NSAllowsLocalNetworking`.
- **Impact:** On Android, all camera HTTP calls will fail silently with a network-layer rejection (no `CameraApiError` will be thrown — the error will come from the native network stack).
- **Suggestion:** Add `usesCleartextTraffic: true` to the `android:` section in `app.config.ts`. If `expo-build-properties` is not installed, add it to `package.json` devDependencies and use it as a plugin in `app.config.ts`.

#### 2. **[env.ts:48]** `EXPO_PUBLIC_NAME` changed from `'SkySense'` to `'WifiCamera'`
```ts
const NAME = 'WifiCamera';
```
- **Impact:** This changes `app.config.ts#name`, the app's display name shown on the device home screen and in the app switcher. It also changes `expo-build` and EAS build app names. This is a **breaking runtime change** — existing users will see the renamed app after the update.
- **Suggestion:** Confirm this renaming is intentional. If `WifiCamera` is the desired brand name for this PR phase, it's fine — just note this requires a new build/submission to reflect in production.

---

### Improvements (Recommended)

#### 3. **[jest-setup.ts:153]** `isAxiosError` type guard is fragile
```ts
isAxiosError: (value: unknown): value is object & { isAxiosError: true } =>
  typeof value === 'object' && value !== null && 'isAxiosError' in value &&
  (value as Record<string, unknown>).isAxiosError === true,
```
- **Issue:** `object & { isAxiosError: true }` is a type intersection, not a type assertion — TypeScript allows `as` casts but this direct expression may not distribute correctly. Also, the original axios `isAxiosError` accepts `unknown` and narrows to `AxiosError` (which has many more properties). This simplified version only guarantees `isAxiosError: true` presence.
- **Impact on `errors.ts`:** The `errors.ts` uses `isAxiosError` from the mocked axios, which is fine — but in production, the real axios `isAxiosError` would narrow to a richer type. This test-to-production discrepancy is low-risk since `CameraApiError.fromAxios` only accesses `.response`, `.message`, and `.config`.
- **Suggestion:** Add a comment noting this is a minimal mock. Alternatively, use `axios.isAxiosError` from the actual axios package as a re-export instead of inlining the implementation.

#### 4. **[jest-setup.ts:165]** Global axios mock **leaks into all test files** — scope is too broad
```ts
jest.mock('axios', () => { ... });
```
- **Issue:** `jest-setup.ts` is the global setup file, so this mock applies to **every test file** in the project, not just `startup-service.test.ts`. Any test for `src/lib/api/client.tsx` (which also uses `axios.create()`) will now receive the global mock. This means:
  - The cloud API tests (if any exist) cannot make real requests.
  - The mock shares `mockErr`/`mockResp` state across all test files, causing cross-test contamination.
- **Impact:** If another test file imports axios and calls `axios._setState()`, it will interfere with `startup-service.test.ts` and vice versa.
- **Suggestion:** The `jest.mock('axios')` in `jest-setup.ts` is appropriate only if **no other test** touches axios. If other tests exist (e.g., for `src/lib/api/`), this mock should be scoped to `*.test.ts` files that specifically need it, or the global mock should be augmented with test-file-specific state isolation. For now, the `beforeEach(() => { axios._reset(); })` in `startup-service.test.ts` mitigates this, but it's fragile.

#### 5. **[src/features/camera/config.ts:27]** Dual fallback: `config.ts` and `env.ts` both have defaults
```ts
// config.ts
export function getCameraBaseUrl(): string {
  return Env.EXPO_PUBLIC_CAMERA_BASE_URL ?? CAMERA_DEFAULT_BASE_URL;
}

// env.ts
EXPO_PUBLIC_CAMERA_BASE_URL:
  process.env.EXPO_PUBLIC_CAMERA_BASE_URL ?? DEFAULT_CAMERA_BASE_URL,
```
- **Issue:** `Env.EXPO_PUBLIC_CAMERA_BASE_URL` in `env.ts` already falls back to `'http://192.168.1.1:8999'` at module evaluation time. Then `config.ts#getCameraBaseUrl()` applies a **second** fallback to the same constant. This is redundant — if `Env.EXPO_PUBLIC_CAMERA_BASE_URL` is `undefined`, it would already be `'http://192.168.1.1:8999'` by the time `config.ts` reads it.
- **Impact:** No runtime bug, but it creates confusion about which layer owns the default.
- **Suggestion:** Remove the `?? CAMERA_DEFAULT_BASE_URL` in `config.ts` — `Env.EXPO_PUBLIC_CAMERA_BASE_URL` will always be a string (never `undefined`) since `env.ts` applies the fallback. Alternatively, remove the default from `env.ts` and keep only `config.ts`'s fallback.

#### 6. **[src/features/camera/client.ts:16-18]** Response interceptor is registered on `cameraClient` at module level
```ts
cameraClient.interceptors.response.use(
  response => response,
  error => Promise.reject(CameraApiError.fromAxios(error)),
);
```
- **Issue:** The interceptor always wraps errors with `CameraApiError`, even when axios's own `isAxiosError` type narrowing doesn't apply (e.g., non-axios errors). This is fine — `CameraApiError.fromAxios` handles non-axios errors by treating them as `kind: 'network'`. However, `Promise.reject` creates a rejected promise without using the axios error pipeline, which means the error is not transformed through axios's own error handling chain.
- **Impact:** Minimal — the camera service only uses `cameraRequest` which reads `response.data`, and the error case is handled by `CameraApiError`. No observable bug.
- **Suggestion:** Consider adding a comment explaining that `Promise.reject` bypasses axios's internal error pipeline but is intentional since we want all camera errors as `CameraApiError`.

#### 7. **[src/features/camera/types.ts:31]** `UpdateTimePayload.time_zone` is typed as `number`
- **Issue:** `time_zone: number` is correct, but no range validation exists (e.g., -12 to +14 for valid UTC offsets). The firmware may reject out-of-range values silently, returning `success: false` with a business error.
- **Impact:** Low — the firmware will return a business error if the value is invalid. The `CameraApiError` error handling chain covers this.
- **Suggestion:** Consider adding a zod refinement or comment documenting valid range.

---

### Nitpicks (Optional)

#### 8. **[package.json:3]** Package name changed from `skysense-app` to `wificamera-app`
- **Impact:** Changes `npm/yarn/pnpm` package identifier. EAS build configurations referencing the old name will break. No functional impact on the app itself.
- **Note:** This is likely intentional as part of the branding change, but verify all EAS build profiles and CI scripts reference the new name.

#### 9. **[uniwind-types.d.ts:8]** Minor formatting/style change
```ts
// Before
export interface UniwindConfig { ... }

// After
export type UniwindConfig = { ... };
```
- **Impact:** `interface` → `type` is a minor style change. Both are functionally identical for object shapes. No functional impact.

#### 10. **[.cursor/skills/skysense-app-conventions/SKILL.md]** Minor whitespace/JSX changes
```diff
-      <DeviceHeader />          {/* or <ScreenHeader title=... /> on sub-screens */}
+      <DeviceHeader />
+      {' '}
+      {/* or <ScreenHeader title=... /> on sub-screens */}
...
-  </>
+  </>;
```
- **Impact:** The `</>;` (note the semicolon) changes the JSX — it now has a trailing semicolon. The original `</>` is more idiomatic. This is a cosmetic change.
- **Note:** This change touches a skill file unrelated to camera-core, suggesting an accidental modification during editing.

---

## Non-Issues (Confirmed Safe)

### ✅ `.env` diff — only comments added
The `.env` diff adds only commented-out `EXPO_PUBLIC_CAMERA_BASE_URL` documentation. No actual env values changed. Safe.

### ✅ `jest-setup.ts` — `react-native-reanimated` mock typing improvements
Changing `any` → `unknown` for function parameters in the reanimated mock is a **strictness improvement**, not a regression. No impact.

### ✅ `docs/architecture/nextjs-feature-first-architecture.md` — untracked (not staged)
This file is `??` (untracked), meaning it was created but never added to git. Not part of the staged changes. No review scope.

### ✅ No existing API client broken
`src/lib/api/client.tsx` uses a separate `axios.create()` instance. The global axios mock in `jest-setup.ts` does not break this file's tests (none exist yet), and they use separate instances at runtime.

### ✅ `src/components/ui/utils.tsx` — unchanged
Uses real `axios` import for type only (`AxiosError`). No tests exist for this file. No conflict with the global mock.

### ✅ FSD boundary compliance
The `camera/` feature:
- ✅ Lives in `src/features/camera/` — correct FSD location
- ✅ Has its own `client.ts` (separate from `lib/api/client.tsx`) — correct separation of concerns
- ✅ No cross-feature imports — no FSD violations
- ✅ `config.ts` documents the separation from cloud API — good architectural intent

---

## Test Gaps

| Scenario | Covered? | File |
|---|---|---|
| `getVersion()` — happy path | ✅ Yes | `startup-service.test.ts:42-51` |
| `getVersion()` — business error | ✅ Yes | `startup-service.test.ts:53-65` |
| `getVersion()` — network error | ✅ Yes | `startup-service.test.ts:67-72` |
| `getVersion()` — HTTP 5xx error | ✅ Yes | `startup-service.test.ts:74-82` |
| `getSerial()` — all 4 cases | ✅ Yes | `startup-service.test.ts:85-127` |
| `postUpdateTime()` — all 4 cases | ✅ Yes | `startup-service.test.ts:129-173` |
| `CameraApiError` class methods | ✅ Yes | `startup-service.test.ts:176-207` |
| `unwrapCamera()` — null/undefined payload | ❌ Missing | No test for `payload: null` edge case |
| `unwrapCamera()` — `success: undefined` | ❌ Missing | No test for `success` field being `undefined` vs `false` |
| Camera client — base URL resolution | ❌ Missing | No test that `getCameraBaseUrl()` returns the correct value |
| Camera client — timeout behavior | ❌ Missing | No test that the 8s timeout is set correctly |
| Camera client — interceptor invoked | ⚠️ Partial | The mock invokes interceptors but no test verifies the interceptor actually transforms errors |
| Android cleartext — config present | ❌ Missing | No test verifying `usesCleartextTraffic` is set in the built config |
| `cameraRequest()` — URL construction | ❌ Missing | No test verifying the full URL (baseURL + endpoint) is passed correctly |
| `getCameraBaseUrl()` — env fallback | ❌ Missing | No test verifying fallback to `CAMERA_DEFAULT_BASE_URL` when env is undefined |

---

## Summary Table

| # | Severity | File | Line | Issue |
|---|---|---|---|---|
| 1 | **Critical** | `app.config.ts` | 21 | Android cleartext not configured (`usesCleartextTraffic` missing) |
| 2 | **Critical** | `env.ts` | 48 | `EXPO_PUBLIC_NAME` changed from `SkySense` → `WifiCamera` (breaking app name change) |
| 3 | Recommended | `jest-setup.ts` | 153 | `isAxiosError` mock is a simplified type guard |
| 4 | Recommended | `jest-setup.ts` | 98 | Global axios mock leaks to all test files; lacks per-file state isolation |
| 5 | Recommended | `config.ts` | 27 | Redundant dual fallback (`env.ts` + `config.ts`) for camera base URL |
| 6 | Recommended | `client.ts` | 16-18 | Interceptor `Promise.reject` bypasses axios error pipeline; add comment |
| 7 | Recommended | `types.ts` | 31 | `time_zone` number has no range validation |
| 8 | Nitpick | `package.json` | 3 | Package name change may affect EAS build references |
| 9 | Nitpick | `uniwind-types.d.ts` | 8 | `interface` → `type` style change |
| 10 | Nitpick | `skysense-app-conventions/SKILL.md` | 216 | Accidental modification to unrelated skill file |

---

## Positive Points

- **Architecture:** Clean separation — `camera/client.ts` is completely independent from `lib/api/client.tsx`, preventing axios instance collision.
- **Error taxonomy:** Three-way `CameraApiError` kind (`network` / `http` / `business`) is well-designed and makes error handling unambiguous for callers.
- **`unwrapCamera` pattern:** Thin and honest — callers get typed data or an exception, no boolean-check boilerplate.
- **TypeScript:** Zero `tsc` errors across the entire project. Strict typing throughout (`unknown`, discriminated unions).
- **Test quality:** The `CameraApiError` class tests (`describe('camera/CameraApiError')`) are particularly good — they test the class itself, not just its consumers.
- **iOS cleartext:** `NSAllowsLocalNetworking: true` correctly scoped to `http://` URLs only, preserving ATS security for all other traffic.
- **Doc comments:** Wire types (`types.ts`) and service functions are well-documented with firmware contract notes.
- **Config comments:** The `app.config.ts` comment block accurately documents the iOS/Android cleartext situation and flags the Android blocker.
- **`jest-setup.ts` axios mock design:** Passing interceptors through captured closures (`respOnFulfilled`/`respOnRejected`) is a clever and correct way to exercise the interceptor chain in tests.
- **FSD compliance:** New `camera/` feature follows all FSD conventions — correct directory placement, barrel `index.ts`, separate `client.ts` for the API layer.

---

## Next Steps

1. **[Critical]** Add `expo-build-properties` to `package.json` devDependencies and configure `usesCleartextTraffic: true` in `app.config.ts`'s `android:` block.
2. **[Critical]** Confirm `EXPO_PUBLIC_NAME: 'WifiCamera'` is the intended production app name. If so, update all EAS build profiles and CI references.
3. **[Recommended]** Scope the axios mock to only camera test files, or add per-test isolation to prevent cross-test contamination.
4. **[Recommended]** Remove the redundant `?? CAMERA_DEFAULT_BASE_URL` in `config.ts#getCameraBaseUrl()` — let `env.ts` own the single source of truth for the default.
5. **[Test Gap]** Add `unwrapCamera` edge case tests: `payload: null`, `success: undefined`.
6. **[Test Gap]** Revert accidental changes to `.cursor/skills/skysense-app-conventions/SKILL.md`.
