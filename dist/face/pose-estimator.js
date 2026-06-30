"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PoseEstimator = void 0;
exports.averagePoints = averagePoints;
exports.euclidean2D = euclidean2D;
exports.radToDeg = radToDeg;
const config_js_1 = require("../config.js");
// ---------------------------------------------------------------------------
// PoseEstimator
// ---------------------------------------------------------------------------
/**
 * Computes head yaw and pitch from MediaPipe 468-point face landmarks.
 *
 * Algorithm:
 *  1. Locate nose tip, chin, and jaw-outline reference points (234/454).
 *  2. Normalise by face width (jaw-to-jaw) for scale invariance.
 *  3. Estimate yaw from horizontal nose offset relative to jaw midpoint.
 *  4. Estimate pitch from vertical nose offset relative to nose–chin midpoint.
 *     Using jaw outline + chin avoids interference from glasses frames.
 *
 * Also maintains an EMA (exponential moving average) for smoothing.
 */
class PoseEstimator {
    smoothingFactor;
    lastYaw = null;
    lastPitch = null;
    constructor(smoothingFactor = 0.3) {
        this.smoothingFactor = smoothingFactor;
    }
    /**
     * Estimate yaw and pitch from face landmarks.
     * Returns a frozen SmoothedPose (EMA applied).
     */
    estimate(landmarks) {
        const rawYaw = this.computeYaw(landmarks.keypoints);
        const rawPitch = this.computePitch(landmarks.keypoints);
        const smoothedYaw = this.ema(rawYaw, this.lastYaw);
        const smoothedPitch = this.ema(rawPitch, this.lastPitch);
        this.lastYaw = smoothedYaw;
        this.lastPitch = smoothedPitch;
        return Object.freeze({
            yaw: smoothedYaw,
            pitch: smoothedPitch,
            timestamp: landmarks.frameTimestamp,
            isSmoothed: true,
        });
    }
    /** Estimate raw yaw without updating internal EMA state. */
    estimateRaw(landmarks) {
        return Object.freeze({
            yaw: this.computeYaw(landmarks.keypoints),
            pitch: this.computePitch(landmarks.keypoints),
            timestamp: landmarks.frameTimestamp,
        });
    }
    /** Reset the EMA state (call when face is lost and re-acquired). */
    reset() {
        this.lastYaw = null;
        this.lastPitch = null;
    }
    // ---------------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------------
    computeYaw(keypoints) {
        const noseTip = keypoints[config_js_1.NOSE_TIP_INDEX];
        const leftEye = averagePoints(keypoints, config_js_1.LEFT_EYE_INDICES);
        const rightEye = averagePoints(keypoints, config_js_1.RIGHT_EYE_INDICES);
        const ipd = euclidean2D(leftEye, rightEye);
        if (ipd < 1e-6)
            return 0;
        const eyeMidX = (leftEye.x + rightEye.x) / 2;
        const offsetX = (noseTip.x - eyeMidX) / ipd;
        return radToDeg(Math.atan(offsetX * config_js_1.POSE_SCALING_FACTOR));
    }
    computePitch(keypoints) {
        const noseTip = keypoints[config_js_1.NOSE_TIP_INDEX];
        const chin = keypoints[config_js_1.CHIN_INDEX];
        const leftRef = averagePoints(keypoints, config_js_1.LEFT_EYE_INDICES);
        const rightRef = averagePoints(keypoints, config_js_1.RIGHT_EYE_INDICES);
        // Use face width (jaw outline to jaw outline) as normalisation factor
        const faceWidth = euclidean2D(leftRef, rightRef);
        if (faceWidth < 1e-6)
            return 0;
        // Vertical axis: midpoint between chin and nose tip is the face centre.
        // Offset nose tip above chin midpoint → positive pitch (looking up).
        // Canvas Y grows downward, so chin.y > noseTip.y when looking straight.
        const faceMidY = (noseTip.y + chin.y) / 2;
        const offsetY = (faceMidY - noseTip.y) / faceWidth;
        return radToDeg(Math.atan(offsetY * config_js_1.POSE_SCALING_FACTOR));
    }
    /**
     * Exponential Moving Average.
     * If prev is null (first sample), return current unmodified.
     */
    ema(current, prev) {
        if (prev === null)
            return current;
        return prev + this.smoothingFactor * (current - prev);
    }
}
exports.PoseEstimator = PoseEstimator;
// ---------------------------------------------------------------------------
// Pure utility functions (exported for testing)
// ---------------------------------------------------------------------------
function averagePoints(keypoints, indices) {
    const sum = indices.reduce((acc, idx) => ({
        x: acc.x + (keypoints[idx]?.x ?? 0),
        y: acc.y + (keypoints[idx]?.y ?? 0),
        z: acc.z + (keypoints[idx]?.z ?? 0),
    }), { x: 0, y: 0, z: 0 });
    const n = indices.length || 1;
    return Object.freeze({ x: sum.x / n, y: sum.y / n, z: sum.z / n });
}
function euclidean2D(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}
function radToDeg(rad) {
    return (rad * 180) / Math.PI;
}
//# sourceMappingURL=pose-estimator.js.map