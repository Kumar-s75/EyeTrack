"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonitorMapper = void 0;
// ---------------------------------------------------------------------------
// MonitorMapper
// ---------------------------------------------------------------------------
/**
 * Maps a smoothed head pose to a target monitor using calibration data.
 * Delegates to CalibrationManager.targetMonitor which implements hysteresis.
 */
class MonitorMapper {
    calibrationManager;
    hysteresisFactor;
    constructor(calibrationManager, hysteresisFactor = 0.25) {
        this.calibrationManager = calibrationManager;
        this.hysteresisFactor = hysteresisFactor;
    }
    /**
     * Returns the best-matching monitor for the given pose.
     * Returns null if calibration data is missing.
     */
    map(pose, calibration, layout, currentMonitorId) {
        const monitorId = this.calibrationManager.targetMonitor(pose, calibration, layout, currentMonitorId, this.hysteresisFactor);
        if (monitorId === null)
            return null;
        // Compute actual distance (without hysteresis) for informational purposes
        const mc = calibration.monitors.find((m) => m.monitorId === monitorId);
        const distance = mc
            ? Math.sqrt((pose.yaw - mc.yaw) ** 2 + (pose.pitch - mc.pitch) ** 2)
            : 0;
        return Object.freeze({ monitorId, distance });
    }
}
exports.MonitorMapper = MonitorMapper;
//# sourceMappingURL=monitor-mapper.js.map