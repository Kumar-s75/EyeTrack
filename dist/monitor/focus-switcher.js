"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FocusSwitcher = void 0;
const native_bridge_js_1 = require("../native/native-bridge.js");
// ---------------------------------------------------------------------------
// FocusSwitcher
// ---------------------------------------------------------------------------
/**
 * Switches focus to the given monitor via the native helper (macOS + Windows).
 * In dry-run mode all operations are logged but not executed.
 */
class FocusSwitcher {
    dryRun;
    noClick;
    constructor(dryRun = false, noClick = false) {
        this.dryRun = dryRun;
        this.noClick = noClick;
    }
    /**
     * Move focus to the given monitor display ID.
     * Returns true on success, false if the helper is unavailable or dry-run.
     */
    focus(monitorId) {
        if (this.dryRun) {
            console.log(`[dry-run] Would focus monitor ${monitorId}`);
            return false;
        }
        if (!(0, native_bridge_js_1.isHelperAvailable)()) {
            console.warn('Native helper not available — cannot switch focus. ' +
                'Run "npm run build:helper" to compile it.');
            return false;
        }
        try {
            if (this.noClick) {
                (0, native_bridge_js_1.warpMonitor)(monitorId);
            }
            else {
                (0, native_bridge_js_1.focusMonitor)(monitorId);
            }
            return true;
        }
        catch (err) {
            console.error(`[FocusSwitcher] Failed to focus monitor ${monitorId}:`, err);
            return false;
        }
    }
    /**
     * Return the currently focused monitor ID, or null if unavailable.
     */
    currentMonitorId() {
        if (!(0, native_bridge_js_1.isHelperAvailable)())
            return null;
        try {
            return (0, native_bridge_js_1.getFocusedMonitorId)();
        }
        catch {
            return null;
        }
    }
}
exports.FocusSwitcher = FocusSwitcher;
//# sourceMappingURL=focus-switcher.js.map