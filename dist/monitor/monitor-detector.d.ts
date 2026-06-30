import type { MonitorLayout } from '../types.js';
/**
 * Detects connected monitors via the native helper binary.
 * Falls back to a single-monitor stub if the helper is not available.
 */
export declare class MonitorDetector {
    /**
     * Returns the current monitor layout.
     * Throws if fewer than `minMonitors` are detected.
     */
    detect(minMonitors?: number): MonitorLayout;
    /**
     * Stub layout used when the native helper is unavailable.
     * Useful for --dry-run and tests.
     */
    fallbackLayout(): MonitorLayout;
}
//# sourceMappingURL=monitor-detector.d.ts.map