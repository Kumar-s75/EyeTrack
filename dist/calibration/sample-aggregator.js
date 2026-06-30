"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SampleAggregator = void 0;
exports.medianOfSorted = medianOfSorted;
// ---------------------------------------------------------------------------
// SampleAggregator
// ---------------------------------------------------------------------------
/**
 * Collects gaze samples during calibration and computes a robust median.
 * Immutable-friendly: samples are accumulated via functional-style push.
 */
class SampleAggregator {
    samples;
    constructor(initial = []) {
        // Copy to keep internal state from leaking
        this.samples = [...initial];
    }
    /** Return a new SampleAggregator with the sample appended. */
    push(sample) {
        return new SampleAggregator([...this.samples, sample]);
    }
    get count() {
        return this.samples.length;
    }
    /**
     * Compute median yaw and pitch from collected samples.
     * Returns null if no samples have been collected.
     */
    median() {
        if (this.samples.length === 0)
            return null;
        const yaws = this.samples.map((s) => s.yaw).sort((a, b) => a - b);
        const pitches = this.samples.map((s) => s.pitch).sort((a, b) => a - b);
        return Object.freeze({
            yaw: medianOfSorted(yaws),
            pitch: medianOfSorted(pitches),
        });
    }
    toArray() {
        return Object.freeze([...this.samples]);
    }
}
exports.SampleAggregator = SampleAggregator;
// ---------------------------------------------------------------------------
// Pure utility
// ---------------------------------------------------------------------------
/** Median of a pre-sorted numeric array. */
function medianOfSorted(sorted) {
    const n = sorted.length;
    if (n === 0)
        return 0;
    const mid = Math.floor(n / 2);
    return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
//# sourceMappingURL=sample-aggregator.js.map