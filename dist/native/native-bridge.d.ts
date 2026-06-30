import type { MonitorLayout } from '../types.js';
/**
 * List all active displays.
 * Returns an immutable MonitorLayout.
 */
export declare function listMonitors(): MonitorLayout;
/**
 * Move cursor to the centre of the target display and simulate a click.
 */
export declare function focusMonitor(displayId: number): void;
/**
 * Return the display ID of the display currently under the cursor.
 */
export declare function getFocusedMonitorId(): number;
/**
 * Returns true if the native helper binary exists and is executable.
 */
export declare function isHelperAvailable(): boolean;
/**
 * Move cursor to the centre of the target display WITHOUT simulating a click.
 */
export declare function warpMonitor(displayId: number): void;
/**
 * Returns true if the required system permissions are granted.
 * On macOS this checks Accessibility (AX) permission via the helper.
 * On Windows this always returns true — no special permissions needed.
 */
export declare function checkAccessibilityPermission(): boolean;
//# sourceMappingURL=native-bridge.d.ts.map