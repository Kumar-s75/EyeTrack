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
exports.POSE_SCALING_FACTOR = exports.RIGHT_EYE_INDICES = exports.LEFT_EYE_INDICES = exports.CHIN_INDEX = exports.NOSE_TIP_INDEX = exports.CALIBRATION_DURATION_S = exports.CALIBRATION_FORMAT_VERSION = exports.SENSITIVITY_PRESETS = exports.CONFIG_FILE = exports.DEFAULT_CONFIG = void 0;
exports.loadConfig = loadConfig;
exports.saveConfig = saveConfig;
exports.validateConfig = validateConfig;
exports.mergeConfig = mergeConfig;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const zod_1 = require("zod");
// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
// Platform-aware config directory:
//   macOS/Linux → ~/.config/eyeswitch
//   Windows     → %APPDATA%\eyeswitch  (e.g. C:\Users\<user>\AppData\Roaming\eyeswitch)
const DEFAULT_CONFIG_DIR = process.platform === 'win32'
    ? path.join(process.env['APPDATA'] ?? os.homedir(), 'eyeswitch')
    : path.join(os.homedir(), '.config', 'eyeswitch');
const ConfigSchema = zod_1.z.object({
    smoothingFactor: zod_1.z.number().min(0).max(0.99).default(0.3),
    switchCooldownMs: zod_1.z.number().min(100).max(5000).default(500),
    hysteresisFactor: zod_1.z.number().min(0).max(0.99).default(0.25),
    minFaceConfidence: zod_1.z.number().min(0.1).max(1).default(0.4),
    cameraIndex: zod_1.z.number().int().min(0).default(0),
    calibrationFilePath: zod_1.z
        .string()
        .default(path.join(DEFAULT_CONFIG_DIR, 'calibration.json')),
    targetFps: zod_1.z.number().int().min(1).max(30).default(5),
    verticalSwitching: zod_1.z.boolean().default(false),
});
// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------
exports.DEFAULT_CONFIG = Object.freeze(ConfigSchema.parse({}));
const CONFIG_DIR = DEFAULT_CONFIG_DIR;
exports.CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
// ---------------------------------------------------------------------------
// Load / Save
// ---------------------------------------------------------------------------
/**
 * Load config from disk, merging with defaults.
 * Returns a frozen (immutable) config object.
 */
function loadConfig(overrides = {}) {
    let fileData = {};
    if (fs.existsSync(exports.CONFIG_FILE)) {
        try {
            const raw = fs.readFileSync(exports.CONFIG_FILE, 'utf8');
            fileData = JSON.parse(raw);
        }
        catch {
            // Malformed config — fall back to defaults
        }
    }
    const merged = { ...fileData, ...overrides };
    const parsed = ConfigSchema.parse(merged);
    return Object.freeze(parsed);
}
/**
 * Persist config to disk. Creates the config directory if needed.
 */
function saveConfig(config) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(exports.CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}
/**
 * Validate a partial config object. Throws a ZodError if invalid.
 */
function validateConfig(partial) {
    return ConfigSchema.partial().parse(partial);
}
/**
 * Merge partial overrides onto a base config, returning a new frozen object.
 */
function mergeConfig(base, overrides) {
    const merged = ConfigSchema.parse({ ...base, ...overrides });
    return Object.freeze(merged);
}
exports.SENSITIVITY_PRESETS = Object.freeze({
    low: Object.freeze({ smoothingFactor: 0.5, hysteresisFactor: 0.4, switchCooldownMs: 800 }),
    medium: Object.freeze({ smoothingFactor: 0.3, hysteresisFactor: 0.25, switchCooldownMs: 500 }),
    high: Object.freeze({ smoothingFactor: 0.1, hysteresisFactor: 0.1, switchCooldownMs: 200 }),
});
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** Version of the calibration file format. */
exports.CALIBRATION_FORMAT_VERSION = 2;
/** Number of seconds to sample gaze per monitor during calibration. */
exports.CALIBRATION_DURATION_S = 5;
/** Landmark index for nose tip in MediaPipe 468-point model. */
exports.NOSE_TIP_INDEX = 1;
/** Landmark index for chin tip. */
exports.CHIN_INDEX = 152;
/**
 * Lateral face outline landmarks used as horizontal reference for yaw/pitch.
 * Using cheekbone/jaw-outline points (234 = left outline, 454 = right outline)
 * instead of eye corners so glasses frames and lens reflections don't interfere.
 */
exports.LEFT_EYE_INDICES = [234];
exports.RIGHT_EYE_INDICES = [454];
/** Empirical yaw/pitch scaling factor from 2D offset ratio. */
exports.POSE_SCALING_FACTOR = 1.5;
//# sourceMappingURL=config.js.map