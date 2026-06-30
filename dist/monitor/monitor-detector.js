"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonitorDetector = void 0;
const native_bridge_js_1 = require("../native/native-bridge.js");
// ---------------------------------------------------------------------------
// MonitorDetector
// ---------------------------------------------------------------------------
/**
 * Detects connected monitors via the native helper binary.
 * Falls back to a single-monitor stub if the helper is not available.
 */
class MonitorDetector {
    /**
     * Returns the current monitor layout.
     * Throws if fewer than `minMonitors` are detected.
     */
    detect(minMonitors = 1) {
        if (!(0, native_bridge_js_1.isHelperAvailable)()) {
            return this.fallbackLayout();
        }
        const layout = (0, native_bridge_js_1.listMonitors)();
        if (layout.monitors.length < minMonitors) {
            throw new Error(`eyeswitch requires at least ${minMonitors} monitor(s), but only ` +
                `${layout.monitors.length} detected.`);
        }
        return layout;
    }
    /**
     * Stub layout used when the native helper is unavailable.
     * Useful for --dry-run and tests.
     */
    fallbackLayout() {
        return Object.freeze({
            monitors: Object.freeze([
                Object.freeze({
                    id: 1,
                    x: 0,
                    y: 0,
                    width: 1440,
                    height: 900,
                    name: 'Built-in Display',
                    isPrimary: true,
                }),
            ]),
            primaryMonitorId: 1,
        });
    }
}
exports.MonitorDetector = MonitorDetector;
//# sourceMappingURL=monitor-detector.js.map