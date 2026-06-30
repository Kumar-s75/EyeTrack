import type { CalibrationSample } from '../types.js';
/**
 * Collects gaze samples during calibration and computes a robust median.
 * Immutable-friendly: samples are accumulated via functional-style push.
 */
export declare class SampleAggregator {
    private readonly samples;
    constructor(initial?: ReadonlyArray<CalibrationSample>);
    /** Return a new SampleAggregator with the sample appended. */
    push(sample: CalibrationSample): SampleAggregator;
    get count(): number;
    /**
     * Compute median yaw and pitch from collected samples.
     * Returns null if no samples have been collected.
     */
    median(): {
        readonly yaw: number;
        readonly pitch: number;
    } | null;
    toArray(): ReadonlyArray<CalibrationSample>;
}
/** Median of a pre-sorted numeric array. */
export declare function medianOfSorted(sorted: number[]): number;
//# sourceMappingURL=sample-aggregator.d.ts.map