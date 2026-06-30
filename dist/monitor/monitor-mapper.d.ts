import type { HeadPose, MonitorLayout, GazeTarget, CalibrationData } from '../types.js';
import type { CalibrationManager } from '../calibration/calibration-manager.js';
/**
 * Maps a smoothed head pose to a target monitor using calibration data.
 * Delegates to CalibrationManager.targetMonitor which implements hysteresis.
 */
export declare class MonitorMapper {
    private readonly calibrationManager;
    private readonly hysteresisFactor;
    constructor(calibrationManager: CalibrationManager, hysteresisFactor?: number);
    /**
     * Returns the best-matching monitor for the given pose.
     * Returns null if calibration data is missing.
     */
    map(pose: HeadPose, calibration: CalibrationData, layout: MonitorLayout, currentMonitorId: number | null): GazeTarget | null;
}
//# sourceMappingURL=monitor-mapper.d.ts.map