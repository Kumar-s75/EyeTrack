#!/usr/bin/env node
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
const commander_1 = require("commander");
const fs = __importStar(require("fs"));
const cli_js_1 = require("./cli.js");
const config_js_1 = require("./config.js");
const frame_capture_js_1 = require("./camera/frame-capture.js");
const face_detector_js_1 = require("./face/face-detector.js");
const pose_estimator_js_1 = require("./face/pose-estimator.js");
const calibration_manager_js_1 = require("./calibration/calibration-manager.js");
const monitor_detector_js_1 = require("./monitor/monitor-detector.js");
const monitor_mapper_js_1 = require("./monitor/monitor-mapper.js");
const focus_switcher_js_1 = require("./monitor/focus-switcher.js");
const native_bridge_js_1 = require("./native/native-bridge.js");
// ---------------------------------------------------------------------------
// Package version (injected at build time)
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version } = require('../package.json');
// ---------------------------------------------------------------------------
// CLI definition
// ---------------------------------------------------------------------------
const program = new commander_1.Command();
program
    .name('eyeswitch')
    .description('Head-tracking monitor focus switcher — look at a screen, it gets focus')
    .version(version)
    .option('--calibrate', 'Force recalibration even if data already exists')
    .option('--camera <index>', 'Camera index to use (default: 0)', '0')
    .option('--verbose', 'Log head pose on every frame')
    .option('--dry-run', 'Detect gaze but do not actually switch focus')
    .option('--no-click', 'Warp cursor only — do not simulate a click')
    .option('--sensitivity <level>', 'Sensitivity preset: low | medium | high')
    .option('--calibration-file <path>', 'Custom path to calibration JSON file');
// ---------------------------------------------------------------------------
// calibrate subcommand
// ---------------------------------------------------------------------------
program
    .command('calibrate')
    .description('Run calibration and save results (then exit)')
    .option('--monitor <index>', 'Only recalibrate this monitor (1-based index)')
    .action(async (opts) => {
    const cfg = (0, config_js_1.loadConfig)();
    const monitorIndex = opts['monitor'] != null ? parseInt(String(opts['monitor']), 10) - 1 : null;
    await runCalibration(cfg, true, monitorIndex);
    process.exit(0);
});
// ---------------------------------------------------------------------------
// status subcommand
// ---------------------------------------------------------------------------
program
    .command('status')
    .description('Show current calibration data and detected monitors')
    .action(() => {
    const cfg = (0, config_js_1.loadConfig)();
    const detector = new monitor_detector_js_1.MonitorDetector();
    const calManager = new calibration_manager_js_1.CalibrationManager(cfg.calibrationFilePath);
    const layout = detector.detect(1);
    const calData = calManager.load();
    cli_js_1.CLI.brand('\nDetected monitors:');
    for (const m of layout.monitors) {
        console.log(`  ${m.isPrimary ? '★' : '·'} [${m.id}] ${m.name}  ${m.width}×${m.height} @ (${m.x}, ${m.y})`);
    }
    cli_js_1.CLI.brand('\nCalibration:');
    if (!calData) {
        cli_js_1.CLI.warn('No calibration data found. Run "eyeswitch calibrate" first.');
    }
    else {
        for (const mc of calData.monitors) {
            const mon = layout.monitors.find((m) => m.id === mc.monitorId);
            const name = mon?.name ?? `Monitor ${mc.monitorId}`;
            console.log(`  · ${name}: yaw=${mc.yaw.toFixed(1)}°, pitch=${mc.pitch.toFixed(1)}°` +
                ` (${mc.sampleCount} samples)`);
        }
    }
    console.log('');
    process.exit(0);
});
// ---------------------------------------------------------------------------
// reset subcommand
// ---------------------------------------------------------------------------
program
    .command('reset')
    .description('Delete calibration data')
    .action(() => {
    const cfg = (0, config_js_1.loadConfig)();
    const calManager = new calibration_manager_js_1.CalibrationManager(cfg.calibrationFilePath);
    calManager.reset();
    cli_js_1.CLI.success('Calibration data cleared.');
    process.exit(0);
});
// ---------------------------------------------------------------------------
// config subcommand
// ---------------------------------------------------------------------------
const configCmd = program
    .command('config')
    .description('Read or write config values');
configCmd
    .command('get [key]')
    .description('Show current config (or a specific key)')
    .action((key) => {
    const cfg = (0, config_js_1.loadConfig)();
    if (key) {
        const val = cfg[key];
        if (val === undefined) {
            cli_js_1.CLI.error(`Unknown config key: ${key}`);
            process.exit(1);
        }
        console.log(`${key} = ${String(val)}`);
    }
    else {
        cli_js_1.CLI.brand('\neyeswitch config:');
        for (const [k, v] of Object.entries(cfg)) {
            console.log(`  ${k.padEnd(26)} ${String(v)}`);
        }
        console.log('');
    }
    process.exit(0);
});
configCmd
    .command('set <key> <value>')
    .description('Set a config value and save to disk')
    .action((key, rawValue) => {
    // Type-coerce the raw string value
    let coerced = rawValue;
    if (rawValue === 'true')
        coerced = true;
    else if (rawValue === 'false')
        coerced = false;
    else if (!isNaN(Number(rawValue)) && rawValue.trim() !== '')
        coerced = Number(rawValue);
    try {
        (0, config_js_1.validateConfig)({ [key]: coerced });
    }
    catch (err) {
        cli_js_1.CLI.error(`Invalid value for "${key}": ${String(err)}`);
        process.exit(1);
    }
    const cfg = (0, config_js_1.mergeConfig)((0, config_js_1.loadConfig)(), { [key]: coerced });
    (0, config_js_1.saveConfig)(cfg);
    cli_js_1.CLI.success(`${key} = ${String(coerced)}`);
    process.exit(0);
});
// ---------------------------------------------------------------------------
// doctor subcommand
// ---------------------------------------------------------------------------
program
    .command('doctor')
    .description('Check eyeswitch dependencies and permissions')
    .action(async () => {
    const cfg = (0, config_js_1.loadConfig)();
    const calManager = new calibration_manager_js_1.CalibrationManager(cfg.calibrationFilePath);
    let allOk = true;
    console.log('');
    cli_js_1.CLI.brand('  eyeswitch doctor\n');
    // 1. Native helper binary
    const helperOk = (0, native_bridge_js_1.isHelperAvailable)();
    cli_js_1.CLI.doctorCheck('Native helper binary', helperOk, helperOk ? 'bin/eyeswitch-helper exists' : 'Run "npm run build:helper" to compile');
    allOk = allOk && helperOk;
    // 2. Accessibility permission
    const axOk = (0, native_bridge_js_1.checkAccessibilityPermission)();
    cli_js_1.CLI.doctorCheck('Accessibility permission', axOk, axOk
        ? 'Permission granted'
        : process.platform === 'win32'
            ? 'Helper binary may be missing — run "npm run build:helper"'
            : 'System Settings → Privacy & Security → Accessibility → enable Terminal');
    allOk = allOk && axOk;
    // 3. Camera
    let cameraOk = false;
    try {
        const capture = new frame_capture_js_1.FrameCapture(cfg.cameraIndex, 2);
        // A quick probe: open and immediately stop
        await new Promise((resolve, reject) => {
            let opened = false;
            const timeout = setTimeout(() => {
                if (!opened)
                    reject(new Error('timeout'));
            }, 8000); // DirectShow init on Windows can take a few seconds
            capture.start(() => {
                if (!opened) {
                    opened = true;
                    clearTimeout(timeout);
                    capture.stop();
                    resolve();
                }
            });
        });
        cameraOk = true;
    }
    catch {
        cameraOk = false;
    }
    const cameraHint = cameraOk
        ? `Camera index ${cfg.cameraIndex} opened`
        : process.platform === 'win32'
            ? 'Settings → Privacy & Security → Camera → enable desktop app access'
            : 'System Settings → Privacy & Security → Camera → enable Terminal';
    cli_js_1.CLI.doctorCheck('Camera access', cameraOk, cameraHint);
    allOk = allOk && cameraOk;
    // 4. Calibration data
    const calData = calManager.load();
    const calOk = calData !== null;
    cli_js_1.CLI.doctorCheck('Calibration data', calOk, calOk
        ? `${calData.monitors.length} monitor(s) calibrated`
        : 'Run "eyeswitch calibrate" to set up');
    // Calibration missing is a warning, not a hard fail
    if (!calOk)
        allOk = false;
    // 5. TF.js model
    let modelOk = false;
    let modelDetail = '';
    try {
        const faceDetector = new face_detector_js_1.FaceDetector();
        await faceDetector.initialize();
        faceDetector.dispose();
        modelOk = true;
        modelDetail = 'FaceMesh model loaded';
    }
    catch (err) {
        modelDetail = String(err).split('\n')[0] ?? 'unknown error';
    }
    cli_js_1.CLI.doctorCheck('TF.js FaceMesh model', modelOk, modelDetail);
    allOk = allOk && modelOk;
    console.log('');
    if (allOk) {
        cli_js_1.CLI.success('All checks passed — eyeswitch is ready to run.');
    }
    else {
        cli_js_1.CLI.warn('Some checks failed. Fix the issues above before running eyeswitch.');
    }
    console.log('');
    process.exit(allOk ? 0 : 1);
});
// ---------------------------------------------------------------------------
// calibration subcommand (export / import)
// ---------------------------------------------------------------------------
const calCmd = program
    .command('calibration')
    .description('Manage calibration data');
calCmd
    .command('export')
    .description('Export calibration data as JSON (stdout or --output file)')
    .option('-o, --output <file>', 'Write to file instead of stdout')
    .action((opts) => {
    const cfg = (0, config_js_1.loadConfig)();
    const calManager = new calibration_manager_js_1.CalibrationManager(cfg.calibrationFilePath);
    const data = calManager.load();
    if (!data) {
        cli_js_1.CLI.error('No calibration data found. Run "eyeswitch calibrate" first.');
        process.exit(1);
    }
    const json = JSON.stringify(data, null, 2);
    if (opts['output']) {
        fs.writeFileSync(String(opts['output']), json, 'utf8');
        cli_js_1.CLI.success(`Exported to ${String(opts['output'])}`);
    }
    else {
        process.stdout.write(json + '\n');
    }
    process.exit(0);
});
calCmd
    .command('import <file>')
    .description('Import calibration data from a JSON file')
    .action((file) => {
    const cfg = (0, config_js_1.loadConfig)();
    const calManager = new calibration_manager_js_1.CalibrationManager(cfg.calibrationFilePath);
    let raw;
    try {
        raw = fs.readFileSync(file, 'utf8');
    }
    catch {
        cli_js_1.CLI.error(`Cannot read file: ${file}`);
        process.exit(1);
    }
    let json;
    try {
        json = JSON.parse(raw);
    }
    catch {
        cli_js_1.CLI.error(`File is not valid JSON: ${file}`);
        process.exit(1);
    }
    let data;
    try {
        const parsed = calibration_manager_js_1.CalibrationDataSchema.parse(json);
        data = Object.freeze({
            version: parsed.version,
            monitors: Object.freeze(parsed.monitors.map((m) => Object.freeze(m))),
            savedAt: parsed.savedAt,
        });
    }
    catch (err) {
        cli_js_1.CLI.error(`Invalid calibration data: ${String(err)}`);
        process.exit(1);
    }
    calManager.save(data);
    cli_js_1.CLI.success(`Imported ${data.monitors.length} monitor(s) from ${file}`);
    process.exit(0);
});
// ---------------------------------------------------------------------------
// Main tracking command
// ---------------------------------------------------------------------------
program.action(async (opts) => {
    const overrides = {
        cameraIndex: opts['camera'] ? parseInt(String(opts['camera']), 10) : undefined,
        calibrationFilePath: opts['calibrationFile'] ? String(opts['calibrationFile']) : undefined,
    };
    // Remove undefined keys
    const cleanOverrides = Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined));
    // Apply sensitivity preset if provided
    const sensitivityKey = opts['sensitivity'];
    const sensitivityOverrides = sensitivityKey && sensitivityKey in config_js_1.SENSITIVITY_PRESETS
        ? config_js_1.SENSITIVITY_PRESETS[sensitivityKey]
        : {};
    const cfg = (0, config_js_1.mergeConfig)((0, config_js_1.loadConfig)(), { ...cleanOverrides, ...sensitivityOverrides });
    const forceCalibrate = Boolean(opts['calibrate']);
    const dryRun = Boolean(opts['dryRun']);
    const noClick = Boolean(opts['noClick']);
    const verbose = Boolean(opts['verbose']);
    await (0, cli_js_1.printBanner)(version);
    await runMain(cfg, { forceCalibrate, dryRun, noClick, verbose });
});
program.parseAsync(process.argv).catch((err) => {
    cli_js_1.CLI.error(String(err));
    process.exit(1);
});
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Try to capture at least one frame within 8 seconds.
 * Used on Windows to detect camera permission issues before model loading.
 */
async function probeCameraAccess(cameraIndex) {
    return new Promise((resolve) => {
        const capture = new frame_capture_js_1.FrameCapture(cameraIndex, 2);
        let done = false;
        const timer = setTimeout(() => {
            if (!done) {
                done = true;
                capture.stop();
                resolve(false);
            }
        }, 8000);
        capture.start(() => {
            if (!done) {
                done = true;
                clearTimeout(timer);
                capture.stop();
                resolve(true);
            }
        });
    });
}
// ---------------------------------------------------------------------------
// Calibration flow
// ---------------------------------------------------------------------------
async function runCalibration(cfg, exitAfter, monitorIndex = null) {
    const detector = new monitor_detector_js_1.MonitorDetector();
    const layout = detector.detect(2);
    const calManager = new calibration_manager_js_1.CalibrationManager(cfg.calibrationFilePath);
    const faceDetector = new face_detector_js_1.FaceDetector();
    const poseEstimator = new pose_estimator_js_1.PoseEstimator(cfg.smoothingFactor);
    // Filter to single monitor if --monitor N was given
    const monitorsToCalibrate = monitorIndex !== null
        ? layout.monitors.filter((_, i) => i === monitorIndex)
        : [...layout.monitors];
    if (monitorsToCalibrate.length === 0) {
        cli_js_1.CLI.error(`Monitor index ${monitorIndex != null ? monitorIndex + 1 : '?'} not found ` +
            `(detected ${layout.monitors.length} monitor(s)).`);
        return null;
    }
    cli_js_1.CLI.info('Loading face detection model…');
    const initSpinner = (0, cli_js_1.createSpinner)('Initialising TF.js FaceMesh…').start();
    await faceDetector.initialize();
    initSpinner.succeed('Model ready');
    // Shared pose/confidence state updated by camera loop
    let latestPose = null;
    let latestConfidence = null;
    const capture = new frame_capture_js_1.FrameCapture(cfg.cameraIndex, cfg.targetFps);
    capture.start(async (frame) => {
        const landmarks = await faceDetector.detect(frame, cfg.minFaceConfidence);
        latestPose = landmarks ? poseEstimator.estimate(landmarks) : null;
        latestConfidence = landmarks?.score ?? null;
    });
    // Use direct stdin data events instead of readline to avoid conflicts with
    // the ora spinner (readline sets terminal modes that suppress spinner output).
    const waitForEnter = () => new Promise((resolve) => {
        process.stdin.setEncoding('utf8');
        process.stdin.resume();
        process.stdin.once('data', () => {
            process.stdin.pause();
            resolve();
        });
    });
    const newCalibrations = [];
    for (let i = 0; i < monitorsToCalibrate.length; i++) {
        const monitor = monitorsToCalibrate[i];
        cli_js_1.CLI.calibrationPrompt(monitor.name, i + 1, monitorsToCalibrate.length);
        await waitForEnter();
        poseEstimator.reset(); // clear EMA state between monitors
        const spinner = (0, cli_js_1.createSpinner)('Sampling…').start();
        const mc = await calManager.collectSamples(monitor.id, () => latestPose, (pct) => cli_js_1.CLI.calibrationProgress(pct, spinner, latestConfidence), cfg.targetFps);
        if (!mc) {
            spinner.fail(`Could not detect face for ${monitor.name} — please retry`);
            i--; // retry this monitor
            continue;
        }
        spinner.stop();
        cli_js_1.CLI.calibrationResult(monitor.name, mc.yaw, mc.pitch);
        newCalibrations.push(mc);
    }
    capture.stop();
    faceDetector.dispose();
    // If recalibrating a single monitor, merge into existing data
    const existingData = monitorIndex !== null ? calManager.load() : null;
    const existingMonitors = existingData
        ? existingData.monitors.filter((m) => !newCalibrations.some((nc) => nc.monitorId === m.monitorId))
        : [];
    const data = calManager.buildData([...existingMonitors, ...newCalibrations]);
    calManager.save(data);
    cli_js_1.CLI.success(`Calibration saved to ${cfg.calibrationFilePath}`);
    if (exitAfter)
        return data;
    return data;
}
// ---------------------------------------------------------------------------
// Main tracking loop
// ---------------------------------------------------------------------------
async function runMain(cfg, opts) {
    const monitorDetector = new monitor_detector_js_1.MonitorDetector();
    const calManager = new calibration_manager_js_1.CalibrationManager(cfg.calibrationFilePath);
    const focusSwitcher = new focus_switcher_js_1.FocusSwitcher(opts.dryRun, opts.noClick);
    // On Windows: verify camera access before spending time loading the model.
    // If the Privacy & Security → Camera toggle is off, ffmpeg exits immediately
    // and eyeswitch appears to "do nothing" — surfacing this upfront saves confusion.
    if (process.platform === 'win32') {
        const camSpinner = (0, cli_js_1.createSpinner)('Checking camera access…').start();
        const cameraOk = await probeCameraAccess(cfg.cameraIndex);
        if (cameraOk) {
            camSpinner.succeed('Camera accessible');
        }
        else {
            camSpinner.fail('Camera access denied');
            console.error('');
            cli_js_1.CLI.warn('eyeswitch needs camera access to track your gaze.\n\n' +
                '  1. Open  Windows Settings\n' +
                '  2. Go to  Privacy & Security → Camera\n' +
                '  3. Enable "Let desktop apps access your camera"\n' +
                '  4. Re-run eyeswitch\n');
            process.exit(1);
        }
    }
    // Check Accessibility permission and warn if missing
    if (!opts.dryRun && !(0, native_bridge_js_1.checkAccessibilityPermission)()) {
        cli_js_1.CLI.warn('Accessibility permission not granted.\n' +
            '  → System Settings → Privacy & Security → Accessibility → enable Terminal\n' +
            '  Focus switching will not work until this is granted.');
    }
    // Require at least 2 monitors for tracking to be meaningful
    const layout = monitorDetector.detect(opts.dryRun ? 1 : 2);
    // Calibration
    let calData = calManager.load();
    if (!calData || opts.forceCalibrate || !calManager.isCalibrated(calData, layout)) {
        if (calData && !opts.forceCalibrate) {
            cli_js_1.CLI.warn('Calibration data is incomplete — starting calibration…');
        }
        else if (!calData) {
            cli_js_1.CLI.info('No calibration data found — starting calibration…');
        }
        calData = await runCalibration(cfg, false);
        if (!calData) {
            cli_js_1.CLI.error('Calibration failed.');
            process.exit(1);
        }
    }
    const capturedCalibration = calData;
    // Model init
    cli_js_1.CLI.info('Loading face detection model…');
    const initSpinner = (0, cli_js_1.createSpinner)('Initialising TF.js FaceMesh…').start();
    const faceDetector = new face_detector_js_1.FaceDetector();
    await faceDetector.initialize();
    initSpinner.succeed('Model ready — tracking started');
    if (opts.dryRun)
        cli_js_1.CLI.warn('Dry-run mode: focus switches will be logged only');
    if (opts.noClick)
        cli_js_1.CLI.warn('No-click mode: cursor will warp but not click');
    const poseEstimator = new pose_estimator_js_1.PoseEstimator(cfg.smoothingFactor);
    const monitorMapper = new monitor_mapper_js_1.MonitorMapper(calManager, cfg.hysteresisFactor);
    let state = Object.freeze({
        currentMonitorId: focusSwitcher.currentMonitorId(),
        lastSwitchAt: 0,
        isPaused: false,
    });
    // Graceful shutdown — declared before capture so the reference is always safe
    let running = true;
    let capture = null;
    const shutdown = () => {
        // Hard-exit fallback: if cleanup hangs for >3 s, force-quit
        setTimeout(() => process.exit(1), 3000).unref();
        try {
            running = false;
            capture?.stop();
            faceDetector.dispose();
        }
        catch { /* ignore cleanup errors so process.exit always runs */ }
        cli_js_1.CLI.newline();
        cli_js_1.CLI.info('eyeswitch stopped');
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    // Keypress handler — placed after signal handlers so Ctrl+C always has a target
    if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
        process.stdin.resume(); // ensure the stream is flowing so data events fire
        process.stdin.on('data', (buf) => {
            if (buf.toString() === 'p') {
                state = Object.freeze({ ...state, isPaused: !state.isPaused });
                if (state.isPaused) {
                    cli_js_1.CLI.warn('\nTracking paused — press p to resume');
                }
                else {
                    cli_js_1.CLI.info('\nTracking resumed');
                }
            }
            // Ctrl+C in raw mode — Node does not auto-emit SIGINT, so we do it manually
            if (buf[0] === 3)
                process.emit('SIGINT');
        });
    }
    capture = new frame_capture_js_1.FrameCapture(cfg.cameraIndex, cfg.targetFps);
    capture.start(async (frame) => {
        if (!running || state.isPaused)
            return;
        const landmarks = await faceDetector.detect(frame, cfg.minFaceConfidence);
        if (!landmarks)
            return;
        const pose = poseEstimator.estimate(landmarks);
        const target = monitorMapper.map(pose, capturedCalibration, layout, state.currentMonitorId);
        if (!target)
            return;
        const monitorName = layout.monitors.find((m) => m.id === target.monitorId)?.name ??
            `Monitor ${target.monitorId}`;
        if (opts.verbose) {
            cli_js_1.CLI.trackingStatus(monitorName, pose.yaw, pose.pitch);
        }
        // Switch if target differs from current and cooldown elapsed
        const now = Date.now();
        const cooldownOk = now - state.lastSwitchAt >= cfg.switchCooldownMs;
        const monitorChanged = target.monitorId !== state.currentMonitorId;
        if (monitorChanged && cooldownOk) {
            const fromName = state.currentMonitorId !== null
                ? (layout.monitors.find((m) => m.id === state.currentMonitorId)?.name ?? null)
                : null;
            cli_js_1.CLI.focusSwitch(fromName, monitorName);
            focusSwitcher.focus(target.monitorId);
            state = Object.freeze({
                ...state,
                currentMonitorId: target.monitorId,
                lastSwitchAt: now,
            });
        }
    });
    // Keep process alive
    await new Promise((resolve) => {
        process.on('SIGINT', resolve);
        process.on('SIGTERM', resolve);
    });
}
//# sourceMappingURL=index.js.map