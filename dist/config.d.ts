import type { EyeSwitchConfig, PartialConfig } from './types.js';
export declare const DEFAULT_CONFIG: EyeSwitchConfig;
export declare const CONFIG_FILE: string;
/**
 * Load config from disk, merging with defaults.
 * Returns a frozen (immutable) config object.
 */
export declare function loadConfig(overrides?: PartialConfig): EyeSwitchConfig;
/**
 * Persist config to disk. Creates the config directory if needed.
 */
export declare function saveConfig(config: EyeSwitchConfig): void;
/**
 * Validate a partial config object. Throws a ZodError if invalid.
 */
export declare function validateConfig(partial: PartialConfig): PartialConfig;
/**
 * Merge partial overrides onto a base config, returning a new frozen object.
 */
export declare function mergeConfig(base: EyeSwitchConfig, overrides: PartialConfig): EyeSwitchConfig;
import type { SensitivityLevel } from './types.js';
export declare const SENSITIVITY_PRESETS: Record<SensitivityLevel, PartialConfig>;
/** Version of the calibration file format. */
export declare const CALIBRATION_FORMAT_VERSION = 2;
/** Number of seconds to sample gaze per monitor during calibration. */
export declare const CALIBRATION_DURATION_S = 5;
/** Landmark index for nose tip in MediaPipe 468-point model. */
export declare const NOSE_TIP_INDEX = 1;
/** Landmark index for chin tip. */
export declare const CHIN_INDEX = 152;
/**
 * Lateral face outline landmarks used as horizontal reference for yaw/pitch.
 * Using cheekbone/jaw-outline points (234 = left outline, 454 = right outline)
 * instead of eye corners so glasses frames and lens reflections don't interfere.
 */
export declare const LEFT_EYE_INDICES: readonly [234];
export declare const RIGHT_EYE_INDICES: readonly [454];
/** Empirical yaw/pitch scaling factor from 2D offset ratio. */
export declare const POSE_SCALING_FACTOR = 1.5;
//# sourceMappingURL=config.d.ts.map