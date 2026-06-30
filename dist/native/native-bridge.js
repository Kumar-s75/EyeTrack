"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.listMonitors = listMonitors;
exports.focusMonitor = focusMonitor;
exports.getFocusedMonitorId = getFocusedMonitorId;
exports.isHelperAvailable = isHelperAvailable;
exports.warpMonitor = warpMonitor;
exports.checkAccessibilityPermission = checkAccessibilityPermission;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const zod_1 = require("zod");
// ---------------------------------------------------------------------------
// Schema for JSON output from the helper binary
// ---------------------------------------------------------------------------
const MonitorSchema = zod_1.z.object({
    id: zod_1.z.number(),
    x: zod_1.z.number(),
    y: zod_1.z.number(),
    width: zod_1.z.number(),
    height: zod_1.z.number(),
    name: zod_1.z.string(),
    isPrimary: zod_1.z.boolean(),
});
const MonitorListSchema = zod_1.z.array(MonitorSchema);
// ---------------------------------------------------------------------------
// Helper binary location — platform-aware
// ---------------------------------------------------------------------------
const HELPER_BINARY = process.platform === 'win32'
    ? 'eyeswitch-helper.exe'
    : 'eyeswitch-helper';
const HELPER_PATH = path.resolve(path.join(__dirname, '..', '..', 'bin', HELPER_BINARY));
function assertHelperExists() {
    if (!fs.existsSync(HELPER_PATH)) {
        const buildCmd = process.platform === 'win32'
            ? '"npm run build:helper" (requires MinGW/MSYS2 with gcc, or MSVC)'
            : '"npm run build:helper" (requires Xcode Command Line Tools)';
        throw new Error(`eyeswitch-helper binary not found at ${HELPER_PATH}.\n` +
            `Run ${buildCmd} to compile it.`);
    }
}
function runHelper(args) {
    assertHelperExists();
    const output = (0, child_process_1.execFileSync)(HELPER_PATH, args, {
        encoding: 'utf8',
        timeout: 5000,
    });
    return output.trim();
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * List all active displays.
 * Returns an immutable MonitorLayout.
 */
function listMonitors() {
    const raw = runHelper(['--list-monitors']);
    const parsed = MonitorListSchema.parse(JSON.parse(raw));
    const monitors = Object.freeze(parsed.map((m) => Object.freeze({
        id: m.id,
        x: m.x,
        y: m.y,
        width: m.width,
        height: m.height,
        name: m.name,
        isPrimary: m.isPrimary,
    })));
    const primary = monitors.find((m) => m.isPrimary) ?? monitors[0];
    return Object.freeze({
        monitors,
        primaryMonitorId: primary?.id ?? 0,
    });
}
/**
 * Move cursor to the centre of the target display and simulate a click.
 */
function focusMonitor(displayId) {
    runHelper(['--focus', String(displayId)]);
}
/**
 * Return the display ID of the display currently under the cursor.
 */
function getFocusedMonitorId() {
    const raw = runHelper(['--get-focused']);
    const id = parseInt(raw, 10);
    if (isNaN(id)) {
        throw new Error(`Unexpected response from helper: "${raw}"`);
    }
    return id;
}
/**
 * Returns true if the native helper binary exists and is executable.
 */
function isHelperAvailable() {
    return fs.existsSync(HELPER_PATH);
}
/**
 * Move cursor to the centre of the target display WITHOUT simulating a click.
 */
function warpMonitor(displayId) {
    runHelper(['--warp', String(displayId)]);
}
/**
 * Returns true if the required system permissions are granted.
 * On macOS this checks Accessibility (AX) permission via the helper.
 * On Windows this always returns true — no special permissions needed.
 */
function checkAccessibilityPermission() {
    try {
        const raw = runHelper(['--check-permissions']);
        return raw === 'true';
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=native-bridge.js.map