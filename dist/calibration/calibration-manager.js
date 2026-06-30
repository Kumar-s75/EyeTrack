"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CalibrationManager = exports.CalibrationDataSchema = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const zod_1 = require("zod");
const sample_aggregator_js_1 = require("./sample-aggregator.js");
const config_js_1 = require("../config.js");
// ---------------------------------------------------------------------------
// Persistence schema
// ---------------------------------------------------------------------------
const MonitorCalibrationSchema = zod_1.z.object({
    monitorId: zod_1.z.number(),
    yaw: zod_1.z.number(),
    pitch: zod_1.z.number(),
    sampleCount: zod_1.z.number(),
    capturedAt: zod_1.z.number(),
});
exports.CalibrationDataSchema = zod_1.z.object({
    version: zod_1.z.number(),
    monitors: zod_1.z.array(MonitorCalibrationSchema),
    savedAt: zod_1.z.number(),
});
// ---------------------------------------------------------------------------
// CalibrationManager
// ---------------------------------------------------------------------------
/**
 * Manages the calibration lifecycle:
 *  - Interactive sampling (2 seconds per monitor)
 *  - Persistence (read/write JSON)
 *  - Target-monitor lookup
 */
class CalibrationManager {
    filePath;
    constructor(filePath) {
        this.filePath = filePath;
    }
    // ---------------------------------------------------------------------------
    // Calibration workflow
    // ---------------------------------------------------------------------------
    /**
     * Collect gaze samples for a single monitor over CALIBRATION_DURATION_S seconds.
     * Calls `onProgress(pct)` with 0–1 as sampling progresses.
     * Returns a MonitorCalibration or null if not enough face data was captured.
     */
    async collectSamples(monitorId, getPose, onProgress = () => { }, targetFps = 30) {
        const durationMs = config_js_1.CALIBRATION_DURATION_S * 1000;
        const intervalMs = Math.round(1000 / targetFps);
        const startTime = Date.now();
        let aggregator = new sample_aggregator_js_1.SampleAggregator();
        await new Promise((resolve) => {
            const timer = setInterval(() => {
                const elapsed = Date.now() - startTime;
                const pct = Math.min(elapsed / durationMs, 1);
                onProgress(pct);
                const pose = getPose();
                if (pose !== null) {
                    const sample = {
                        yaw: pose.yaw,
                        pitch: pose.pitch,
                        timestamp: pose.timestamp,
                    };
                    aggregator = aggregator.push(sample);
                }
                if (elapsed >= durationMs) {
                    clearInterval(timer);
                    resolve();
                }
            }, intervalMs);
        });
        const result = aggregator.median();
        if (result === null || aggregator.count < 2)
            return null;
        return Object.freeze({
            monitorId,
            yaw: result.yaw,
            pitch: result.pitch,
            sampleCount: aggregator.count,
            capturedAt: Date.now(),
        });
    }
    // ---------------------------------------------------------------------------
    // Persistence
    // ---------------------------------------------------------------------------
    /** Load calibration data from disk. Returns null if none exists or is invalid. */
    load() {
        if (!fs.existsSync(this.filePath))
            return null;
        try {
            const raw = fs.readFileSync(this.filePath, 'utf8');
            const parsed = exports.CalibrationDataSchema.parse(JSON.parse(raw));
            if (parsed.version !== config_js_1.CALIBRATION_FORMAT_VERSION)
                return null;
            return Object.freeze({
                version: parsed.version,
                monitors: Object.freeze(parsed.monitors.map((m) => Object.freeze(m))),
                savedAt: parsed.savedAt,
            });
        }
        catch {
            return null;
        }
    }
    /** Save calibration data to disk, creating directories as needed. */
    save(data) {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf8');
    }
    /** Build a CalibrationData object from per-monitor results. */
    buildData(monitorCalibrations) {
        return Object.freeze({
            version: config_js_1.CALIBRATION_FORMAT_VERSION,
            monitors: Object.freeze([...monitorCalibrations]),
            savedAt: Date.now(),
        });
    }
    /** Delete the calibration file. */
    reset() {
        if (fs.existsSync(this.filePath)) {
            fs.unlinkSync(this.filePath);
        }
    }
    // ---------------------------------------------------------------------------
    // Gaze → target monitor
    // ---------------------------------------------------------------------------
    /**
     * Determine which monitor the user is looking at using Euclidean distance
     * in yaw/pitch space, with hysteresis to prevent flickering.
     *
     * @param pose          Current smoothed head pose
     * @param data          Loaded calibration data
     * @param layout        Current monitor layout (for validation)
     * @param currentId     Currently focused monitor ID (for hysteresis)
     * @param hysteresis    Fraction by which current monitor distance is reduced (default 0.25)
     */
    targetMonitor(pose, data, layout, currentId, hysteresis = 0.25) {
        // Only consider monitors that exist in both layout and calibration data
        const validIds = new Set(layout.monitors.map((m) => m.id));
        const calibrated = data.monitors.filter((m) => validIds.has(m.monitorId));
        if (calibrated.length === 0)
            return null;
        let bestId = null;
        let bestDist = Infinity;
        for (const mc of calibrated) {
            let dist = Math.sqrt((pose.yaw - mc.yaw) ** 2 + (pose.pitch - mc.pitch) ** 2);
            // Hysteresis: reduce effective distance for the current monitor
            if (mc.monitorId === currentId) {
                dist *= 1 - hysteresis;
            }
            if (dist < bestDist) {
                bestDist = dist;
                bestId = mc.monitorId;
            }
        }
        return bestId;
    }
    /**
     * Whether calibration data is present for all monitors in the layout.
     */
    isCalibrated(data, layout) {
        if (!data)
            return false;
        const calibratedIds = new Set(data.monitors.map((m) => m.monitorId));
        return layout.monitors.every((m) => calibratedIds.has(m.id));
    }
}
exports.CalibrationManager = CalibrationManager;
//# sourceMappingURL=calibration-manager.js.map