import { z } from 'zod';
import type { CalibrationData, MonitorCalibration, MonitorLayout, HeadPose } from '../types.js';
export declare const CalibrationDataSchema: z.ZodObject<{
    version: z.ZodNumber;
    monitors: z.ZodArray<z.ZodObject<{
        monitorId: z.ZodNumber;
        yaw: z.ZodNumber;
        pitch: z.ZodNumber;
        sampleCount: z.ZodNumber;
        capturedAt: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        yaw: number;
        pitch: number;
        monitorId: number;
        sampleCount: number;
        capturedAt: number;
    }, {
        yaw: number;
        pitch: number;
        monitorId: number;
        sampleCount: number;
        capturedAt: number;
    }>, "many">;
    savedAt: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    version: number;
    monitors: {
        yaw: number;
        pitch: number;
        monitorId: number;
        sampleCount: number;
        capturedAt: number;
    }[];
    savedAt: number;
}, {
    version: number;
    monitors: {
        yaw: number;
        pitch: number;
        monitorId: number;
        sampleCount: number;
        capturedAt: number;
    }[];
    savedAt: number;
}>;
/**
 * Manages the calibration lifecycle:
 *  - Interactive sampling (2 seconds per monitor)
 *  - Persistence (read/write JSON)
 *  - Target-monitor lookup
 */
export declare class CalibrationManager {
    private readonly filePath;
    constructor(filePath: string);
    /**
     * Collect gaze samples for a single monitor over CALIBRATION_DURATION_S seconds.
     * Calls `onProgress(pct)` with 0–1 as sampling progresses.
     * Returns a MonitorCalibration or null if not enough face data was captured.
     */
    collectSamples(monitorId: number, getPose: () => HeadPose | null, onProgress?: (pct: number) => void, targetFps?: number): Promise<MonitorCalibration | null>;
    /** Load calibration data from disk. Returns null if none exists or is invalid. */
    load(): CalibrationData | null;
    /** Save calibration data to disk, creating directories as needed. */
    save(data: CalibrationData): void;
    /** Build a CalibrationData object from per-monitor results. */
    buildData(monitorCalibrations: ReadonlyArray<MonitorCalibration>): CalibrationData;
    /** Delete the calibration file. */
    reset(): void;
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
    targetMonitor(pose: HeadPose, data: CalibrationData, layout: MonitorLayout, currentId: number | null, hysteresis?: number): number | null;
    /**
     * Whether calibration data is present for all monitors in the layout.
     */
    isCalibrated(data: CalibrationData | null, layout: MonitorLayout): boolean;
}
//# sourceMappingURL=calibration-manager.d.ts.map