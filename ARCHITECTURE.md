# eyeswitch — Technical Deep-Dive

Everything about how eyeswitch works: every file, every concept, every algorithm, every design decision.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Project Structure](#3-project-structure)
4. [Core Data Types](#4-core-data-types)
5. [Configuration System](#5-configuration-system)
6. [The Processing Pipeline](#6-the-processing-pipeline)
7. [Camera Capture](#7-camera-capture)
8. [Face Detection — TF.js MediaPipe FaceMesh](#8-face-detection--tfjs-mediapipe-facemesh)
9. [Pose Estimation — Yaw and Pitch Math](#9-pose-estimation--yaw-and-pitch-math)
10. [Calibration System](#10-calibration-system)
11. [Gaze-to-Monitor Mapping + Hysteresis](#11-gaze-to-monitor-mapping--hysteresis)
12. [Native Bridge (macOS + Windows)](#12-native-bridge-macos--windows)
13. [CLI Interface & Subcommands](#13-cli-interface--subcommands)
14. [Animated Eye Launch Sequence](#14-animated-eye-launch-sequence)
15. [Immutability Pattern](#15-immutability-pattern)
16. [Build System](#16-build-system)
17. [Testing Architecture](#17-testing-architecture)
18. [Required Permissions](#18-required-permissions)
19. [Known Constraints & Design Decisions](#19-known-constraints--design-decisions)

---

## 1. Project Overview

**eyeswitch** is a macOS CLI tool that uses your webcam to track where your head is pointing and automatically moves keyboard/mouse focus to whichever monitor you're looking at — no hotkey, no click, no friction.

- **Package**: `eyeswitch` on npm, v1.0.2
- **Author**: Abhijitam01
- **License**: MIT
- **Platform**: macOS only (uses CoreGraphics and Accessibility APIs)
- **Runtime**: Node.js ≥ 18
- **Entry point**: `bin/eyeswitch` → `dist/index.js`

The core loop is: capture webcam frame → detect face landmarks with TensorFlow.js → compute head orientation (yaw/pitch) → compare against per-monitor calibration centroids → if the nearest monitor changed and cooldown elapsed, call the native helper to warp the cursor and simulate a click.

---

## 2. Technology Stack

### Runtime & Language
| Layer | Technology |
|---|---|
| Language | TypeScript 5.4 (strict mode, ES2022 target, CommonJS output) |
| Runtime | Node.js ≥ 18 |
| CLI framework | Commander.js 12 |
| Terminal output | chalk 5 (colours), ora 8 (spinners) |
| Schema validation | Zod 3 |

### Computer Vision
| Layer | Technology |
|---|---|
| ML framework | TensorFlow.js 4.20 (`@tensorflow/tfjs-core`, `@tensorflow/tfjs-backend-cpu`) |
| Face model | MediaPipe FaceMesh (`@tensorflow-models/face-landmarks-detection` 1.0.5) |
| Image processing | node-canvas (`canvas` 2.11) — decodes JPEG frames into ImageData |

### Camera
| Layer | Technology |
|---|---|
| Camera capture | `node-webcam` 0.8 → wraps `imagesnap` on macOS |
| Frame pipeline | JPEG-to-disk → fs.readFile → canvas.loadImage → getImageData |

### Native macOS Integration
| Layer | Technology |
|---|---|
| Native binary | Objective-C compiled with `clang` |
| macOS frameworks | `Cocoa`, `CoreGraphics`, `AppKit`, `ApplicationServices` |
| Bridge | `child_process.execFileSync` calling `bin/eyeswitch-helper` |
| APIs used | `CGGetActiveDisplayList`, `CGDisplayBounds`, `CGWarpMouseCursorPosition`, `CGEventCreateMouseEvent`, `CGEventPost`, `AXIsProcessTrusted`, `NSScreen.localizedName` |

### Dev Tools
| Tool | Purpose |
|---|---|
| Jest 29 + ts-jest | Unit, integration, and E2E tests |
| TypeScript compiler (`tsc`) | Build (`dist/`) |
| ts-node | Dev mode (no compile step) |
| ESLint + @typescript-eslint | Linting |

---

## 3. Project Structure

```
eyeswitch/
├── src/
│   ├── index.ts                  ← CLI entry (Commander), all subcommands, main loop
│   ├── cli.ts                    ← Terminal output helpers, animated eye banner
│   ├── config.ts                 ← Zod schema, load/save/merge, sensitivity presets
│   ├── types.ts                  ← All shared TypeScript interfaces (all Readonly)
│   ├── camera/
│   │   └── frame-capture.ts      ← Webcam → JPEG → canvas → FrameBuffer
│   ├── face/
│   │   ├── face-detector.ts      ← TF.js MediaPipe FaceMesh wrapper
│   │   └── pose-estimator.ts     ← Landmarks → yaw/pitch with EMA smoothing
│   ├── calibration/
│   │   ├── calibration-manager.ts ← Sample collection, persistence, gaze→monitor
│   │   └── sample-aggregator.ts  ← Immutable median aggregator
│   ├── monitor/
│   │   ├── focus-switcher.ts     ← Calls native helper to switch focus
│   │   ├── monitor-detector.ts   ← Queries monitor layout via native helper
│   │   └── monitor-mapper.ts     ← Pose + calibration → GazeTarget
│   └── native/
│       ├── native-bridge.ts      ← Cross-platform TypeScript wrapper
│       └── helper/
│           ├── eyeswitch-helper.m   ← macOS Objective-C binary source
│           └── eyeswitch-helper-win.c ← Windows C (Win32) binary source
├── bin/
│   ├── eyeswitch                 ← Shell entry point (#!/usr/bin/env node)
│   ├── eyeswitch-helper          ← Compiled macOS binary (built at install time)
│   └── eyeswitch-helper.exe      ← Compiled Windows binary (built at install time)
├── tests/
│   ├── __mocks__/                ← Manual mocks for TF.js, canvas, node-webcam
│   ├── unit/                     ← Pure-logic tests (no I/O)
│   ├── integration/              ← Full sub-system tests (real fs, real timers)
│   └── e2e/                      ← CLI process spawn tests
├── dist/                         ← TypeScript compilation output (gitignored)
├── package.json
├── tsconfig.json
└── jest.config.js
```

### File-by-file breakdown

#### `src/types.ts`
The single source of truth for all shared data structures. Every interface uses TypeScript `readonly` modifiers and every array type is `ReadonlyArray<T>`. Nothing in this file has logic — it's purely types. The principle: if a type crosses a module boundary, it lives here.

#### `src/config.ts`
Config loading, saving, and validation. Defines the Zod schema (`ConfigSchema`) that doubles as both the type definition and the runtime validator. Exports `DEFAULT_CONFIG` (frozen), `loadConfig`, `saveConfig`, `mergeConfig`, `validateConfig`, three sensitivity presets, and key constants (`CALIBRATION_FORMAT_VERSION`, `CALIBRATION_DURATION_S`, landmark indices).

#### `src/cli.ts`
Two exports:
- `printBanner(version)` — the animated eye opening sequence (see §14)
- `CLI` — a frozen object of named output functions (`CLI.success`, `CLI.error`, `CLI.warn`, `CLI.info`, `CLI.focusSwitch`, `CLI.calibrationPrompt`, `CLI.calibrationProgress`, `CLI.calibrationResult`, `CLI.trackingStatus`, `CLI.doctorCheck`)

Also exports `createSpinner(text)` which creates an `ora` dots-spinner.

#### `src/index.ts`
The application's main file. Defines the Commander.js program and all subcommands (`calibrate`, `status`, `reset`, `config get/set`, `doctor`, `calibration export/import`). Contains two async functions: `runCalibration` and `runMain`. This is the only file intentionally excluded from test coverage because it wires everything together.

#### `src/camera/frame-capture.ts`
See §7.

#### `src/face/face-detector.ts`
See §8.

#### `src/face/pose-estimator.ts`
See §9.

#### `src/calibration/calibration-manager.ts`
See §10.

#### `src/calibration/sample-aggregator.ts`
Immutable accumulator. `push(sample)` returns a new `SampleAggregator` with the sample appended — never mutates. `median()` returns sorted-median of all yaw and pitch values independently. Used during calibration to get a noise-robust single point per monitor.

#### `src/monitor/monitor-detector.ts`
Thin wrapper around `native-bridge.listMonitors()`. Checks `isHelperAvailable()` first; if the native binary is missing, returns a hardcoded single-monitor fallback layout (used for `--dry-run` and tests). Enforces a `minMonitors` count requirement — throws if fewer monitors are found than required.

#### `src/monitor/monitor-mapper.ts`
One-method class that delegates to `CalibrationManager.targetMonitor()`. Also computes the raw Euclidean distance (without hysteresis) for the returned monitor, used for informational/verbose output.

#### `src/monitor/focus-switcher.ts`
Wraps the native bridge calls. Respects `dryRun` (log only) and `noClick` (warp cursor but no click) modes. Returns `true`/`false` to indicate whether the switch actually happened. Catches errors from the native helper rather than propagating them.

#### `src/native/native-bridge.ts`
See §12.

#### `src/native/helper/eyeswitch-helper.m` / `eyeswitch-helper-win.c`
See §12.

---

## 4. Core Data Types

All interfaces are in `src/types.ts`. Every field is `readonly`; arrays are `ReadonlyArray<T>`.

### Camera / Frame

```typescript
interface FrameBuffer {
  readonly data: Uint8ClampedArray;  // Raw RGBA pixel data (width × height × 4 bytes)
  readonly width: number;            // 640 (fixed)
  readonly height: number;           // 480 (fixed)
  readonly timestamp: number;        // ms since epoch (Date.now() at capture time)
}
```

### Geometry

```typescript
interface Point2D { readonly x: number; readonly y: number; }
interface Point3D extends Point2D { readonly z: number; }
```

### Face Detection

```typescript
interface FaceLandmarks {
  readonly keypoints: ReadonlyArray<Point3D>;  // 468 points from MediaPipe FaceMesh
  readonly score: number;                       // Detection confidence 0–1
  readonly frameTimestamp: number;              // Forwarded from FrameBuffer.timestamp
}
```

### Head Pose

```typescript
interface HeadPose {
  readonly yaw: number;    // Horizontal rotation in degrees. Negative=left, positive=right
  readonly pitch: number;  // Vertical rotation in degrees. Negative=down, positive=up
  readonly timestamp: number;
}

interface SmoothedPose extends HeadPose {
  readonly isSmoothed: true;  // Brand type: proves EMA was applied
}
```

### Monitor

```typescript
interface Monitor {
  readonly id: number;         // CGDirectDisplayID from CoreGraphics
  readonly x: number;          // Top-left origin in global screen coordinates
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly name: string;       // NSScreen.localizedName (e.g. "Built-in Retina Display")
  readonly isPrimary: boolean; // CGDisplayIsMain()
}

interface MonitorLayout {
  readonly monitors: ReadonlyArray<Monitor>;
  readonly primaryMonitorId: number;
}
```

### Calibration

```typescript
interface CalibrationSample {
  readonly yaw: number;
  readonly pitch: number;
  readonly timestamp: number;
}

interface MonitorCalibration {
  readonly monitorId: number;
  readonly yaw: number;        // Median yaw over all calibration samples
  readonly pitch: number;      // Median pitch over all calibration samples
  readonly sampleCount: number;
  readonly capturedAt: number; // ms epoch
}

interface CalibrationData {
  readonly version: number;    // Must equal CALIBRATION_FORMAT_VERSION (2)
  readonly monitors: ReadonlyArray<MonitorCalibration>;
  readonly savedAt: number;
}
```

### Gaze & Config

```typescript
interface GazeTarget {
  readonly monitorId: number;
  readonly distance: number;   // Euclidean distance in yaw/pitch space (informational)
}

interface EyeSwitchConfig {
  readonly smoothingFactor: number;      // EMA α. 0=no smoothing, 0.99=very sluggish
  readonly switchCooldownMs: number;     // Min ms between focus switches
  readonly hysteresisFactor: number;     // 0–1 bias toward staying on current monitor
  readonly minFaceConfidence: number;    // Min detection score to process a frame
  readonly cameraIndex: number;          // Which webcam (0 = default)
  readonly calibrationFilePath: string;
  readonly targetFps: number;
  readonly verticalSwitching: boolean;   // Enable pitch-based switching
}

interface TrackingState {
  readonly currentMonitorId: number | null;
  readonly lastSwitchAt: number;   // ms epoch of most recent switch
  readonly isPaused: boolean;
}
```

---

## 5. Configuration System

### File Location

Config lives at `~/.config/eyeswitch/config.json`. Calibration data lives at `~/.config/eyeswitch/calibration.json` (configurable via `calibrationFilePath`).

### Zod Schema

`ConfigSchema` in `src/config.ts` defines both the shape and the constraints:

```
smoothingFactor:      0.0 – 0.99, default 0.3
switchCooldownMs:     100 – 5000, default 500
hysteresisFactor:     0.0 – 0.99, default 0.25
minFaceConfidence:    0.1 – 1.0,  default 0.4
cameraIndex:          int ≥ 0,    default 0
calibrationFilePath:  string,     default ~/.config/eyeswitch/calibration.json
targetFps:            int 5–60,   default 30
verticalSwitching:    boolean,    default false
```

### Config Functions

| Function | What it does |
|---|---|
| `loadConfig(overrides?)` | Reads `config.json`, merges `overrides`, validates with Zod, returns frozen object |
| `saveConfig(config)` | Serialises to JSON, writes to `~/.config/eyeswitch/config.json` |
| `mergeConfig(base, overrides)` | Returns a new frozen config with `overrides` applied on top of `base` |
| `validateConfig(partial)` | Validates a partial config object, throws `ZodError` if invalid |

`loadConfig` is always safe to call: if the file is missing, it falls back to defaults. If the file is corrupt JSON, it silently falls back to defaults.

### Sensitivity Presets

Three named presets are available via `--sensitivity <level>` or mixed into config manually:

| Preset | smoothingFactor | hysteresisFactor | switchCooldownMs |
|---|---|---|---|
| `low` | 0.5 | 0.40 | 800 ms |
| `medium` (default) | 0.3 | 0.25 | 500 ms |
| `high` | 0.1 | 0.10 | 200 ms |

**Low** = more smoothing (sluggish), higher hysteresis (sticky), long cooldown → fewer accidental switches, best for stable setups.
**High** = minimal smoothing (snappy), low hysteresis, short cooldown → responds almost immediately.

### Key Constants

```typescript
CALIBRATION_FORMAT_VERSION = 2   // If file has different version, it's discarded
CALIBRATION_DURATION_S     = 8   // Seconds of gaze sampling per monitor
NOSE_TIP_INDEX             = 1   // MediaPipe landmark index for nose tip
CHIN_INDEX                 = 152 // MediaPipe landmark index for chin
LEFT_EYE_INDICES           = [234] // Left jaw-outline landmark (NOT left eye corner)
RIGHT_EYE_INDICES          = [454] // Right jaw-outline landmark (NOT right eye corner)
POSE_SCALING_FACTOR        = 1.5   // Empirical factor in atan() for yaw/pitch
```

---

## 6. The Processing Pipeline

This is the full data flow from webcam to focus switch, showing the type at each stage:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  setInterval (1000/targetFps ms)                                                │
│                                                                                 │
│  1. FrameCapture.captureOneFrame()                                              │
│     imagesnap → JPEG file → loadImage() → canvas.getImageData()                │
│     Output: FrameBuffer { data: Uint8ClampedArray, width, height, timestamp }  │
│                                                                                 │
│  2. FaceDetector.detect(frame, minFaceConfidence)                               │
│     FrameBuffer → node-canvas → TF.js MediaPipe FaceMesh                       │
│     Output: FaceLandmarks { keypoints: Point3D[468], score, frameTimestamp }   │
│             or null (no face / low confidence → skip frame)                    │
│                                                                                 │
│  3. PoseEstimator.estimate(landmarks)                                           │
│     Landmark geometry → raw yaw/pitch → EMA filter                             │
│     Output: SmoothedPose { yaw, pitch, timestamp, isSmoothed: true }            │
│                                                                                 │
│  4. MonitorMapper.map(pose, calibration, layout, currentMonitorId)              │
│     Euclidean distance in yaw/pitch space with hysteresis                       │
│     Output: GazeTarget { monitorId, distance }                                  │
│             or null (no calibration data)                                       │
│                                                                                 │
│  5. Cooldown + change check                                                     │
│     if target.monitorId !== state.currentMonitorId                              │
│       && Date.now() - state.lastSwitchAt >= switchCooldownMs                   │
│                                                                                 │
│  6. FocusSwitcher.focus(monitorId)                                              │
│     → native-bridge.focusMonitor(id) or warpMonitor(id)                        │
│     → execFileSync('bin/eyeswitch-helper', ['--focus', id])                    │
│     → ObjC: CGWarpMouseCursorPosition + CGEventPost (left click)               │
│                                                                                 │
│  7. State update (immutable)                                                    │
│     state = Object.freeze({ ...state, currentMonitorId, lastSwitchAt: now })   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

The entire pipeline runs inside a `setInterval` callback. Each tick is independent — a slow frame (TF.js inference + imagesnap are both slow) simply delays the next tick; the `isCapturing` guard prevents concurrent runs.

---

## 7. Camera Capture

**File**: `src/camera/frame-capture.ts`

### How node-webcam works on macOS

`node-webcam` is an abstraction layer. On macOS it calls `imagesnap`, a command-line tool that captures a single JPEG frame from the webcam and writes it to disk. This is fundamentally a per-frame-file approach — not a streaming approach.

```
setInterval tick
  └─ isCapturing guard (skip if previous capture not done)
  └─ webcam.capture(filename, callback)
       └─ spawns: imagesnap -w 0 -q filename.jpg
       └─ callback fires when imagesnap exits
  └─ fs.existsSync(filename.jpg) → loadImage(actualFile)
  └─ canvas.drawImage(img, 0, 0, 640, 480)
  └─ ctx.getImageData(0, 0, 640, 480) → Uint8ClampedArray (RGBA)
  └─ Object.freeze(FrameBuffer) → onFrame(frame)
```

### Effective frame rate

`imagesnap` takes approximately 1 second per capture on macOS due to camera initialization overhead. This means that even though `targetFps` defaults to 30 (33ms interval), the actual delivery rate is ~1 frame per second in practice. The `isCapturing` boolean ensures that if the previous `imagesnap` process is still running when the next interval fires, the tick is simply skipped.

### Temporary file handling

Each instance uses a unique temp file path: `/tmp/eyeswitch-frame-{pid}`. node-webcam appends `.jpg` or `.jpeg` (varies), so the code checks both extensions. On `stop()`, both paths are cleaned up.

### Error handling

Consecutive failures are counted. After 5 consecutive failures, the error is always logged (even without `EYESWITCH_DEBUG`). This catches cases where camera permissions are revoked mid-session.

---

## 8. Face Detection — TF.js MediaPipe FaceMesh

**File**: `src/face/face-detector.ts`

### Model choice

The `@tensorflow-models/face-landmarks-detection` package supports two models — BlazeFace and MediaPipe FaceMesh. eyeswitch uses **MediaPipe FaceMesh** because it provides 468 3D landmarks including the specific jaw-outline and chin points needed for pose estimation.

### Backend selection — why CPU not tfjs-node

There are two TF.js backends available in Node.js:

- `@tensorflow/tfjs-node` — uses the TensorFlow C++ binary (libtensorflow). Fast, but does not implement every TF operation.
- `@tensorflow/tfjs-backend-cpu` — pure JavaScript CPU implementation. Slower, but has full op coverage.

MediaPipe FaceMesh requires a `Transform` kernel that `tfjs-node` does not implement. Calling `tf.setBackend('cpu')` before initialising the detector is mandatory; without it the model crashes at runtime.

```typescript
await tf.setBackend('cpu');
await tf.ready();
const detector = await faceLandmarksDetection.createDetector(
  faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
  { runtime: 'tfjs', refineLandmarks: false, maxFaces: 1 }
);
```

`refineLandmarks: false` skips the iris refinement step (which adds ~68 extra landmarks for iris tracking). eyeswitch doesn't use those landmarks, so skipping them saves inference time.

### Warm-up pass

On `initialize()`, after loading the model, a single inference is run on a blank 640×480 grey frame. This forces TF.js to JIT-compile the TF graph and allocate internal buffers. Without the warm-up, the first real frame in tracking would have several seconds of cold-start latency.

### FrameBuffer → Canvas

TF.js `estimateFaces()` accepts a canvas element. The `frameToCanvas` private method converts a `FrameBuffer` into a node-canvas canvas:

```typescript
const canvas = createCanvas(frame.width, frame.height);
const ctx = canvas.getContext('2d');
const imageData = ctx.createImageData(frame.width, frame.height);
imageData.data.set(frame.data);  // Copy RGBA bytes directly
ctx.putImageData(imageData, 0, 0);
return canvas;
```

### Detection output

The model returns an array of face objects. eyeswitch takes only `faces[0]` (since `maxFaces: 1`). The `score` property is checked against `minFaceConfidence` (default 0.4) — frames with low confidence are discarded entirely. The 468 keypoints are mapped to frozen `Point3D` objects.

---

## 9. Pose Estimation — Yaw and Pitch Math

**File**: `src/face/pose-estimator.ts`

### Landmark selection

The 468-point MediaPipe FaceMesh model numbers landmarks consistently across all faces. eyeswitch uses four specific points:

| Index | Landmark | Why |
|---|---|---|
| 1 | Nose tip | Moves with head rotation; central reference |
| 152 | Chin | Defines the vertical face extent |
| 234 | Left jaw outline (cheekbone level) | Horizontal reference |
| 454 | Right jaw outline (cheekbone level) | Horizontal reference |

**Why jaw outline instead of eye corners?** Eye corners (landmarks ~33, ~263) are partially occluded by glasses frames and can be distorted by lens reflections. The jaw outline at indices 234/454 is reliably visible even with thick-framed glasses.

### Yaw computation (horizontal rotation)

```
leftRef  = keypoints[234]
rightRef = keypoints[454]
noseTip  = keypoints[1]

jawMidX    = (leftRef.x + rightRef.x) / 2
faceWidth  = euclidean2D(leftRef, rightRef)
offsetX    = (noseTip.x - jawMidX) / faceWidth   // normalised, scale-invariant

yaw = atan(offsetX * POSE_SCALING_FACTOR) converted to degrees
```

- When looking **straight ahead**, the nose is at `jawMidX` → `offsetX ≈ 0` → `yaw ≈ 0°`
- When looking **right**, the nose shifts right of the jaw midpoint → positive `offsetX` → positive `yaw`
- When looking **left** → negative `yaw`
- Dividing by `faceWidth` makes the result independent of how close the user is to the camera
- `POSE_SCALING_FACTOR = 1.5` is an empirical constant calibrated to give roughly correct degree values

### Pitch computation (vertical rotation)

```
noseTip  = keypoints[1]
chin     = keypoints[152]
leftRef  = keypoints[234]
rightRef = keypoints[454]

faceWidth = euclidean2D(leftRef, rightRef)
faceMidY  = (noseTip.y + chin.y) / 2
offsetY   = (faceMidY - noseTip.y) / faceWidth

pitch = atan(offsetY * POSE_SCALING_FACTOR) converted to degrees
```

- Canvas Y-axis grows **downward**, so `chin.y > noseTip.y` when looking straight
- `faceMidY` is the midpoint between nose tip and chin
- When looking **up**, the nose moves up → `noseTip.y` decreases → `faceMidY - noseTip.y` increases → positive `pitch`
- When looking **down** → negative `pitch`

### EMA Smoothing

```typescript
// Exponential Moving Average
ema(current, prev) {
  if (prev === null) return current;  // First frame: no smoothing
  return prev + smoothingFactor * (current - prev);
}
```

With `smoothingFactor = 0.3` (default):
- Each new sample contributes 30% to the smoothed value
- The previous smoothed value contributes 70%
- This low-passes the signal and removes single-frame noise spikes

`reset()` sets `lastYaw = lastPitch = null`, which causes the next `estimate()` call to return the raw value with no smoothing. This is called between monitors during calibration to prevent the EMA state from one monitor contaminating the first samples of the next.

### `estimateRaw()` vs `estimate()`

- `estimateRaw()` computes yaw/pitch without updating internal EMA state. Used in tests to verify the geometric math in isolation.
- `estimate()` computes and updates the EMA state. Used in the tracking loop.

---

## 10. Calibration System

**Files**: `src/calibration/calibration-manager.ts`, `src/calibration/sample-aggregator.ts`

### Why calibration is necessary

The yaw/pitch values from the pose estimator are relative to the camera. But where each monitor sits in yaw/pitch space depends on:
- Where the monitors are physically positioned (left/right/above/below)
- Where the camera is (laptop vs external, top vs bottom)
- How the user sits relative to their desk

Calibration captures the user's actual gaze direction for each monitor as a (yaw, pitch) centroid, solving all of these unknowns without requiring any explicit geometry configuration.

### Calibration workflow

```
for each monitor:
  1. Print prompt: "Look at [MonitorName] and press Enter"
  2. Wait for Enter keypress
  3. poseEstimator.reset()          ← clear EMA from previous monitor
  4. calManager.collectSamples()    ← 8 seconds of sampling
  5. Display captured yaw/pitch
calManager.save(buildData(results))
```

### `collectSamples()` in detail

```typescript
// Runs for CALIBRATION_DURATION_S (8 seconds)
// Polls at targetFps interval
const timer = setInterval(() => {
  onProgress(elapsed / durationMs);  // 0.0 → 1.0 progress bar
  const pose = getPose();            // getter into shared state (latest pose from camera loop)
  if (pose !== null) {
    aggregator = aggregator.push({ yaw, pitch, timestamp });  // immutable accumulation
  }
  if (elapsed >= durationMs) clearInterval(timer);
}, intervalMs);
```

`getPose` is a closure that returns the latest pose from the concurrent camera + detection loop. The camera loop and calibration sampling run in parallel — calibration reads from the shared state rather than running its own capture.

### `SampleAggregator` — immutable accumulation

```typescript
push(sample): SampleAggregator {
  return new SampleAggregator([...this.samples, sample]);  // new instance every time
}

median(): { yaw, pitch } | null {
  const yaws   = this.samples.map(s => s.yaw).sort((a,b) => a-b);
  const pitches = this.samples.map(s => s.pitch).sort((a,b) => a-b);
  return { yaw: medianOfSorted(yaws), pitch: medianOfSorted(pitches) };
}
```

**Why median instead of mean?** The median is robust to outlier frames (e.g., a single frame where the head moved suddenly or face detection was noisy). The mean would be pulled toward those outliers.

**Why immutable push?** Follows the codebase-wide immutability rule. Each `push` returns a new aggregator object. In practice this is used in a loop: `aggregator = aggregator.push(sample)`.

### Persistence

Calibration data is stored at `~/.config/eyeswitch/calibration.json` (format version 2):

```json
{
  "version": 2,
  "savedAt": 1711234567890,
  "monitors": [
    {
      "monitorId": 69732608,
      "yaw": -18.4,
      "pitch": 2.1,
      "sampleCount": 8,
      "capturedAt": 1711234560000
    },
    {
      "monitorId": 69749248,
      "yaw": 17.2,
      "pitch": 1.8,
      "sampleCount": 9,
      "capturedAt": 1711234568000
    }
  ]
}
```

On load, the file is read, JSON-parsed, then validated against `CalibrationDataSchema` (Zod). If the version doesn't match `CALIBRATION_FORMAT_VERSION`, `load()` returns null (treated as "not calibrated"). If the file is missing or corrupt JSON, `load()` also returns null.

### Single-monitor recalibration

`eyeswitch calibrate --monitor 2` recalibrates only the second monitor (1-based). The index.ts code:
1. Runs `collectSamples` only for the target monitor
2. Loads existing calibration data
3. Filters out the old entry for the recalibrated monitor
4. Builds new `CalibrationData` with `[...preserved, newMc]`
5. Saves the merged result

This preserves all other monitors' calibration data.

### Export / Import

`eyeswitch calibration export` dumps the raw JSON to stdout (or a file via `-o`). `eyeswitch calibration import <file>` reads, validates with `CalibrationDataSchema`, and saves. This allows copying calibration between machines or backing it up.

---

## 11. Gaze-to-Monitor Mapping + Hysteresis

**Files**: `src/monitor/monitor-mapper.ts`, `src/calibration/calibration-manager.ts` (method `targetMonitor`)

### Distance-based mapping

For each calibrated monitor, compute the Euclidean distance between the current (yaw, pitch) pose and the stored calibration centroid:

```
distance(pose, monitor) = sqrt((pose.yaw - mc.yaw)² + (pose.pitch - mc.pitch)²)
```

The monitor with the smallest distance is the target. This is a simple nearest-neighbour lookup in 2D angle space.

### Hysteresis — preventing flicker

Without hysteresis, when your gaze is near the boundary between two monitors, tiny head movements would flip the target back and forth dozens of times per second. The hysteresis fix: artificially reduce the effective distance of the **currently focused** monitor by a factor of `(1 - hysteresisFactor)`.

```typescript
if (mc.monitorId === currentId) {
  dist *= (1 - hysteresisFactor);  // Default: dist *= 0.75
}
```

With `hysteresisFactor = 0.25`, the current monitor is treated as 25% closer than it geometrically is. This means:
- To switch away from monitor A to monitor B, monitor B must be meaningfully closer than A.
- At the geometric midpoint between A and B, the current monitor always wins.
- The user must gaze significantly past the boundary to trigger a switch.

### Cooldown gate

Even when the hysteresis distance calculation says "switch", the switch only fires if at least `switchCooldownMs` (default 500ms) have elapsed since the last switch. This is a hard temporal gate in `index.ts`:

```typescript
const cooldownOk = Date.now() - state.lastSwitchAt >= cfg.switchCooldownMs;
const monitorChanged = target.monitorId !== state.currentMonitorId;
if (monitorChanged && cooldownOk) {
  focusSwitcher.focus(target.monitorId);
  state = Object.freeze({ ...state, currentMonitorId: target.monitorId, lastSwitchAt: Date.now() });
}
```

---

## 12. Native Bridge (macOS + Windows)

**Files**: `src/native/native-bridge.ts`, `src/native/helper/eyeswitch-helper.m` (macOS), `src/native/helper/eyeswitch-helper-win.c` (Windows)

### Architecture

Pure JavaScript/TypeScript cannot directly call OS display APIs. eyeswitch bridges this with a tiny platform-specific binary compiled at install time. The TypeScript side calls it via `child_process.execFileSync` (synchronous, blocking, 5-second timeout):

```
TypeScript
  native-bridge.ts
    execFileSync('bin/eyeswitch-helper[.exe]', ['--focus', '1'])
      → spawn process → native binary runs → prints result to stdout → TypeScript reads it
```

### Helper binary location

The helper is resolved relative to the JavaScript file's `__dirname`, with platform-aware filename:

```typescript
const HELPER_BINARY = process.platform === 'win32'
  ? 'eyeswitch-helper.exe'
  : 'eyeswitch-helper';
const HELPER_PATH = path.resolve(
  path.join(__dirname, '..', '..', 'bin', HELPER_BINARY)
);
```

### TypeScript API (`native-bridge.ts`)

| Function | Calls | Returns |
|---|---|---|
| `listMonitors()` | `--list-monitors` | `MonitorLayout` (Zod-validated, frozen) |
| `focusMonitor(id)` | `--focus <id>` | `void` |
| `warpMonitor(id)` | `--warp <id>` | `void` |
| `getFocusedMonitorId()` | `--get-focused` | `number` |
| `isHelperAvailable()` | (fs.existsSync only) | `boolean` |
| `checkAccessibilityPermission()` | `--check-permissions` | `boolean` |

All functions that call the binary validate output with Zod (`MonitorListSchema`, `MonitorSchema`) or parse numbers explicitly.

### Native binaries

#### macOS (`eyeswitch-helper.m` — Objective-C)

#### `--list-monitors`

```objc
CGGetActiveDisplayList(kMaxDisplays, displays, &displayCount);
// For each display:
//   CGDisplayBounds(did)       → origin.x/y, size.width/height
//   CGDisplayIsMain(did)       → isPrimary
//   NSScreen.localizedName     → human-readable name
// Output: JSON array printed to stdout
```

#### `--focus <displayId>`

```objc
CGRect bounds = CGDisplayBounds(targetId);
CGFloat cx = bounds.origin.x + bounds.size.width / 2.0;
CGFloat cy = bounds.origin.y + bounds.size.height / 2.0;

// 1. Warp the cursor to the centre of the target display
CGWarpMouseCursorPosition(CGPointMake(cx, cy));
CGAssociateMouseAndMouseCursorPosition(true);

// 2. Simulate a left mouse button click to transfer keyboard focus
CGEventRef mouseDown = CGEventCreateMouseEvent(NULL, kCGEventLeftMouseDown, point, kCGMouseButtonLeft);
CGEventRef mouseUp   = CGEventCreateMouseEvent(NULL, kCGEventLeftMouseUp,   point, kCGMouseButtonLeft);
CGEventPost(kCGHIDEventTap, mouseDown);
CGEventPost(kCGHIDEventTap, mouseUp);
```

The synthetic click is what actually transfers keyboard focus. Just warping the cursor is not enough — macOS only transfers keyboard focus when it receives a click event.

#### `--warp <displayId>`

Same as `--focus` but skips the `CGEventCreateMouseEvent` / `CGEventPost` calls. Used when `--no-click` mode is active — moves the cursor visually but does not trigger focus transfer.

#### `--get-focused`

```objc
CGPoint location = CGEventGetLocation(CGEventCreate(NULL));
CGGetDisplaysWithPoint(location, kMaxDisplays, displays, &displayCount);
printf("%u\n", displays[0]);
```

Returns the `CGDirectDisplayID` of the display currently under the cursor (used to initialise `TrackingState.currentMonitorId` at startup).

#### `--check-permissions`

```objc
BOOL trusted = AXIsProcessTrusted();
printf("%s\n", trusted ? "true" : "false");
return trusted ? 0 : 1;
```

`AXIsProcessTrusted()` checks whether the current process (the Terminal running eyeswitch) has been granted Accessibility permission in System Preferences.

### Build command

```bash
clang \
  -framework Cocoa \
  -framework CoreGraphics \
  -framework AppKit \
  -framework ApplicationServices \
  src/native/helper/eyeswitch-helper.m \
  -o bin/eyeswitch-helper
```

This runs automatically as the `postinstall` npm script. If `clang` fails (e.g., Xcode Command Line Tools not installed), a warning is printed but the install does not fail — eyeswitch will fall back to single-monitor stub layout without the binary.

---

## 13. CLI Interface & Subcommands

**File**: `src/index.ts`

eyeswitch uses **Commander.js** to define its CLI. The program is defined declaratively and parsed with `program.parseAsync(process.argv)`.

### `eyeswitch` (default action — tracking mode)

```bash
eyeswitch [options]
  --sensitivity <level>         low | medium | high preset
  --camera <index>              Camera device index (default: 0)
  --verbose                     Print yaw/pitch on every frame
  --dry-run                     Log gaze but do not switch focus
  --no-click                    Warp cursor only, do not simulate a click
  --calibrate                   Force recalibration even if data exists
  --calibration-file <path>     Custom calibration file path
```

Startup sequence:
1. Apply sensitivity preset overrides to config
2. `printBanner(version)` — animated eye
3. Check Accessibility permission (warn if missing, do not exit)
4. Detect monitors (require 2 unless `--dry-run`)
5. Load calibration; if missing/incomplete, run `runCalibration()` automatically
6. Initialise TF.js FaceMesh model
7. Start camera loop
8. Bind `p` key for pause/resume, Ctrl+C for graceful shutdown

### `eyeswitch calibrate [--monitor N]`

Interactive calibration wizard. For each monitor, prompts the user to look at it and press Enter, then samples for 8 seconds. `--monitor N` (1-based) recalibrates only one monitor and merges the result into existing data.

### `eyeswitch doctor`

Health check that verifies 5 things in order:

| Check | Method | Fix if failing |
|---|---|---|
| Native helper binary | `fs.existsSync(HELPER_PATH)` | `npm run build:helper` |
| Accessibility permission | `AXIsProcessTrusted()` via helper | System Settings → Accessibility |
| Camera access | Open FrameCapture, wait for 1 frame (3s timeout) | System Settings → Camera |
| Calibration data | `calManager.load() !== null` | `eyeswitch calibrate` |
| TF.js FaceMesh model | `new FaceDetector().initialize()` | Network or environment issue |

### `eyeswitch status`

Calls `MonitorDetector.detect()` and `CalibrationManager.load()`, then pretty-prints the layout (with ★ for primary) and calibration angles per monitor.

### `eyeswitch reset`

Calls `calManager.reset()` which deletes the calibration file.

### `eyeswitch config get [key]` / `eyeswitch config set <key> <value>`

- `get`: Loads config and prints all key-value pairs (or just one)
- `set`: Type-coerces the raw string value (handles booleans, numbers), validates with Zod, then merges and saves

### `eyeswitch calibration export` / `eyeswitch calibration import <file>`

Export: loads calibration JSON, writes to stdout or `-o <file>`.
Import: reads file, validates with `CalibrationDataSchema`, saves.

### Runtime controls (tracking mode only)

| Key | Action |
|---|---|
| `p` | Toggle pause/resume (stops calling `focusSwitcher.focus` but continues detecting) |
| `Ctrl+C` | Graceful shutdown: `capture.stop()`, `faceDetector.dispose()`, `process.exit(0)` |

The key handling uses `process.stdin.setRawMode(true)` and reads raw `data` events (not readline) to avoid conflicts with ora spinner's terminal mode manipulation.

---

## 14. Animated Eye Launch Sequence

**File**: `src/cli.ts` — `printBanner(version)`

The banner animates a stylised eye opening in the terminal using ANSI escape codes.

### Frames

Six frames rendered with Unicode box-drawing characters and chalk colour codes:

```
Frame 0 (closed):     ─────────────────
Frame 1 (cracking):   ╭─────────────────╮
                       ╰─────────────────╯
Frame 2 (half-open):  ╭─────────────────╮
                       │                 │
                       ╰─────────────────╯
Frame 3 (iris):       ╭─────────────────╮
                       │        ○        │   ← dim cyan circle
                       ╰─────────────────╯
Frame 4 (pupil):      ╭─────────────────╮
                       │        ●        │   ← white bold dot
                       ╰─────────────────╯
Frame 5 (dilated):    ╭─────────────────╮
                       │        ◉        │   ← cyan bold bullseye
                       ╰─────────────────╯
```

### Animation technique

The rendered block is 5 lines tall (blank + 3 eye lines + title). Each frame:
1. `process.stdout.write('\x1b[5A')` — move cursor up 5 lines to the top of the block
2. Overwrite each line with `\x1b[2K\r` (erase line + carriage return) + new content
3. `await sleep(delays[i])` — frame-specific delay

Delays: `[240, 80, 70, 65, 65, 180]` ms. The first frame (closed) holds longest for dramatic effect. The iris/pupil/dilated frames are fast.

### Title typewriter

After the final eye frame, the title "eyeswitch" is typed character-by-character at 32ms/char using a loop over `'eyeswitch'.split('')` with `process.stdout.write()`. The version string is appended in dim chalk.

### Non-TTY guard

The entire animation is guarded by `if (!process.stdout.isTTY)`. In CI, piped output, or test environments, a simple two-line banner is printed instead.

---

## 15. Immutability Pattern

The entire codebase enforces immutability at two levels:

### TypeScript level (compile time)

All interfaces in `src/types.ts` use `readonly` on every field and `ReadonlyArray<T>` for every array. TypeScript will error if any code attempts to write to these fields.

### Runtime level (`Object.freeze`)

Every object that crosses a module boundary is frozen with `Object.freeze()`:

```typescript
// TrackingState updates always create a new object
state = Object.freeze({
  ...state,
  currentMonitorId: target.monitorId,
  lastSwitchAt: now,
});

// CalibrationData loaded from disk
return Object.freeze({
  version: parsed.version,
  monitors: Object.freeze(parsed.monitors.map((m) => Object.freeze(m))),
  savedAt: parsed.savedAt,
});

// FaceLandmarks from detection
return Object.freeze({
  keypoints: Object.freeze(face.keypoints.map(kp => Object.freeze({ x, y, z }))),
  score,
  frameTimestamp: frame.timestamp,
});
```

`Object.freeze()` prevents runtime mutation even if TypeScript's type system were bypassed. This is especially important for objects shared between the camera callback and the main tracking loop.

### SampleAggregator — functional immutability

`SampleAggregator.push()` always returns a new instance:
```typescript
push(sample: CalibrationSample): SampleAggregator {
  return new SampleAggregator([...this.samples, sample]);
}
```
The original aggregator is never modified. Usage:
```typescript
aggregator = aggregator.push(sample);  // Rebind, don't mutate
```

---

## 16. Build System

### TypeScript compilation

```bash
npm run build    # tsc (uses tsconfig.json)
```

Output goes to `dist/` with:
- `.js` files (CommonJS, ES2022 target)
- `.d.ts` declaration files (for consumers using eyeswitch as a library)
- `.d.ts.map` declaration maps (IDE source navigation)
- `.js.map` source maps (stack trace line numbers point to `.ts` source)

`tsconfig.json` compiler options worth noting:

| Option | Effect |
|---|---|
| `strict: true` | Enables all strict checks (strictNullChecks, strictFunctionTypes, etc.) |
| `noImplicitAny: true` | Every variable must have an explicit or inferrable type |
| `noUnusedLocals: true` | Unused variables are compile errors |
| `noUnusedParameters: true` | Unused function parameters are compile errors |
| `noImplicitReturns: true` | Every code path in a function must return a value |
| `resolveJsonModule: true` | Allows `require('../package.json')` for the version string |

### Native helper compilation

```bash
npm run build:helper
# Runs scripts/build-helper.js which detects the platform:
#
# macOS  → clang -framework Cocoa -framework CoreGraphics -framework AppKit
#                -framework ApplicationServices
#                src/native/helper/eyeswitch-helper.m -o bin/eyeswitch-helper
#
# Windows → gcc src/native/helper/eyeswitch-helper-win.c
#               -o bin/eyeswitch-helper.exe -luser32 -lgdi32
#           (or MSVC cl.exe as fallback)
```

macOS requires Xcode Command Line Tools (`xcode-select --install`). Windows requires MinGW/MSYS2 (`gcc`) or Visual Studio Build Tools (`cl`). The `postinstall` npm script runs this automatically on `npm install -g eyeswitch`, with a graceful fallback warning if it fails.

### Other scripts

| Script | Command |
|---|---|
| `npm run dev` | `ts-node src/index.ts` — run without compiling |
| `npm start` | `node dist/index.js` — run compiled build |
| `npm test` | `jest` |
| `npm run test:coverage` | `jest --coverage` |
| `npm run lint` | `eslint src --ext .ts` |
| `npm run typecheck` | `tsc --noEmit` — type check without writing files |
| `npm run clean` | Cross-platform dist directory removal |

---

## 17. Testing Architecture

### Framework

**Jest 29** with **ts-jest** preset. Tests are in `tests/` (excluded from `tsconfig.json` compilation). Jest's `moduleNameMapper` strips `.js` extensions from imports so ts-jest can resolve them back to `.ts` source files.

### Manual mocks

Heavy dependencies are mocked to keep tests fast and dependency-free:

| Mock | File | What it replaces |
|---|---|---|
| `@tensorflow/tfjs-node` | `tests/__mocks__/tfjs-node.ts` | Avoids loading TF native binary |
| `@tensorflow-models/face-landmarks-detection` | `tests/__mocks__/face-landmarks-detection.ts` | Returns synthetic landmarks |
| `canvas` | `tests/__mocks__/canvas.ts` | Stubs `createCanvas`, `loadImage` |
| `node-webcam` | `tests/__mocks__/node-webcam.ts` | Stubs `NodeWebcam.create()` |

### Coverage thresholds

```
branches:   75%
functions:  80%
lines:      80%
statements: 80%
```

`src/index.ts` is excluded from coverage collection (it's the CLI wiring file with complex async flows better tested at E2E level).

### Test organisation

#### Unit tests (`tests/unit/`)

Pure logic tests with no real I/O:

- **`config.test.ts`** — loadConfig with missing/malformed files, mergeConfig, validateConfig, sensitivity presets
- **`pose-estimator.test.ts`** — yaw/pitch geometry with specific landmark positions, EMA math, reset(), degenerate cases (zero face width)
- **`focus-switcher.test.ts`** — dry-run/noClick/helper-unavailable modes, error handling from native bridge
- **`sample-aggregator.test.ts`** — immutability of push(), median for odd/even counts, frozen output
- **`monitor-mapper.test.ts`** — nearest-monitor selection, hysteresis boundary cases

#### Integration tests (`tests/integration/`)

Use real filesystem and real timers:

- **`calibration-workflow.test.ts`** — full round-trip: `collectSamples` (with real setInterval), `buildData`, `save`, `load`, `reset`, `isCalibrated`, `targetMonitor`, version mismatch, single-monitor merge
- **`gaze-to-monitor.test.ts`** — gaze mapping across multiple monitor layouts

#### E2E tests (`tests/e2e/`)

- **`cli-startup.test.ts`** — spawns the CLI as a child process, checks that it starts/exits correctly, `--version`, `--help`

### Key testing patterns

**Frozen object assertions:**
```typescript
expect(Object.isFrozen(result)).toBe(true);
expect(Object.isFrozen(result.monitors)).toBe(true);
```

**Hysteresis boundary test:**
```typescript
// At yaw=0 (equidistant between -20 and +20), current monitor wins
expect(manager.targetMonitor(pose, cal, layout, 1)).toBe(1);
expect(manager.targetMonitor(pose, cal, layout, 2)).toBe(2);
```

**EMA verification:**
```typescript
const p2 = estimator.estimate(fl2);
expect(p2.yaw).toBeGreaterThan(p1.yaw);   // moved in right direction
expect(p2.yaw).toBeLessThan(estimator.estimateRaw(fl2).yaw + 0.1);  // blended, not fully there
```

---

## 18. Required Permissions

### Camera

eyeswitch accesses the webcam via `node-webcam` (which calls `imagesnap`). macOS requires explicit Camera permission for the Terminal application.

**Grant**: System Settings → Privacy & Security → Camera → enable your terminal

### Accessibility

macOS requires Accessibility permission for any process that:
- Moves the cursor programmatically (`CGWarpMouseCursorPosition`)
- Posts synthetic input events (`CGEventPost`)

**Grant**: System Settings → Privacy & Security → Accessibility → enable your terminal

Without Accessibility permission, the native helper's `--focus` and `--warp` commands will silently fail (the cursor will not move). `eyeswitch doctor` surfaces this via `AXIsProcessTrusted()`.

### No network permissions needed

TF.js downloads the FaceMesh model weights the first time, but after that they are cached locally. The model is loaded from npm package cache, not from a remote URL at runtime.

---

## 19. Known Constraints & Design Decisions

### imagesnap effective rate (~1 fps)

On macOS, `imagesnap` (the tool node-webcam calls) takes approximately 1 second per capture because it re-initialises the camera hardware on each invocation. This means `targetFps = 30` does not result in 30 fps — in practice the delivered rate is approximately 1 fps. The `CALIBRATION_DURATION_S` was increased from 2 to 8 specifically to collect enough samples at this rate.

This is a fundamental limitation of the node-webcam + imagesnap approach. A streaming approach (e.g., ffmpeg) could achieve higher frame rates but would add a heavy dependency.

### CPU TF.js backend (not tfjs-node)

`@tensorflow/tfjs-node` binds to a compiled TensorFlow C++ library and is much faster than the pure-JS CPU backend. However, it does not implement the `Transform` op that MediaPipe FaceMesh requires. Using it causes a runtime crash: `"Kernel 'Transform' not found"`. The forced `tf.setBackend('cpu')` is the only working option without patching the model.

### Platform support

eyeswitch supports macOS and Windows. The `"os": ["darwin", "win32"]` field in `package.json` restricts installation to these platforms. Linux is not yet supported — the build script exits cleanly with a warning on unsupported platforms.

### `__dirname` in compiled output

The helper binary path is computed relative to `__dirname` of the compiled `dist/native/native-bridge.js` file, with a platform-aware filename suffix:

```typescript
const HELPER_BINARY = process.platform === 'win32' ? 'eyeswitch-helper.exe' : 'eyeswitch-helper';
path.resolve(path.join(__dirname, '..', '..', 'bin', HELPER_BINARY))
```

This correctly resolves to `bin/eyeswitch-helper[.exe]` when running from `dist/`. When running via `ts-node` in dev mode, `__dirname` points to `src/native/`, which resolves the same way.

### Single process, single camera

eyeswitch runs as a single long-lived process. The camera loop, calibration sampling, and main tracking all share a single `FrameCapture` instance. Concurrency is managed with the `isCapturing` boolean (prevents parallel imagesnap processes) and the `isPaused` state flag.

### Vertical switching is implemented but not default

`verticalSwitching: false` in the default config. The pitch dimension is computed and stored in calibration data, and `targetMonitor()` already uses both yaw and pitch in its Euclidean distance calculation — so vertical switching works automatically for any monitor above or below another. It is off by default because most users have side-by-side monitors where pitch variation is noise rather than signal.
