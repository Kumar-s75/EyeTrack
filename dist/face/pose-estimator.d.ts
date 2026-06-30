import type { FaceLandmarks, HeadPose, SmoothedPose, Point3D } from '../types.js';
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
export declare class PoseEstimator {
    private readonly smoothingFactor;
    private lastYaw;
    private lastPitch;
    constructor(smoothingFactor?: number);
    /**
     * Estimate yaw and pitch from face landmarks.
     * Returns a frozen SmoothedPose (EMA applied).
     */
    estimate(landmarks: FaceLandmarks): SmoothedPose;
    /** Estimate raw yaw without updating internal EMA state. */
    estimateRaw(landmarks: FaceLandmarks): HeadPose;
    /** Reset the EMA state (call when face is lost and re-acquired). */
    reset(): void;
    private computeYaw;
    private computePitch;
    /**
     * Exponential Moving Average.
     * If prev is null (first sample), return current unmodified.
     */
    private ema;
}
export declare function averagePoints(keypoints: ReadonlyArray<Point3D>, indices: Readonly<readonly number[]>): Point3D;
export declare function euclidean2D(a: Point3D, b: Point3D): number;
export declare function radToDeg(rad: number): number;
//# sourceMappingURL=pose-estimator.d.ts.map