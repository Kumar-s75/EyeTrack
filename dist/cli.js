"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLI = void 0;
exports.printBanner = printBanner;
exports.createSpinner = createSpinner;
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
// ---------------------------------------------------------------------------
// Colour palette
// ---------------------------------------------------------------------------
const brand = chalk_1.default.cyan.bold;
const dim = chalk_1.default.dim;
const success = chalk_1.default.green.bold;
const error = chalk_1.default.red.bold;
const warn = chalk_1.default.yellow.bold;
const info = chalk_1.default.blue;
const highlight = chalk_1.default.magenta.bold;
// ---------------------------------------------------------------------------
// Launch animation / banner
// ---------------------------------------------------------------------------
async function printBanner(version) {
    // Non-TTY (piped, CI, tests): skip animation, print minimal header
    if (!process.stdout.isTTY) {
        console.log('');
        console.log(brand('  eyeswitch') + dim(`  v${version}`));
        console.log('');
        return;
    }
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    // ── eye frames (3 content lines each) ───────────────────────────────────
    const D = chalk_1.default.dim.cyan; // dim border / iris
    const C = chalk_1.default.cyan; // full border
    const W = chalk_1.default.white.bold; // pupil
    const H = chalk_1.default.cyan.bold; // dilated / focused pupil
    const eye = (top, mid, bot) => [top, mid, bot];
    const PAD = '     '; // 5-space side padding
    const B17 = '─────────────────'; // 17 dashes → 19-char border with ╭╮
    const frames = [
        // 0 — closed (just a horizontal line)
        eye('', PAD + ' ' + D(B17) + ' ' + PAD, ''),
        // 1 — cracking open (lids touching)
        eye(PAD + C('╭' + B17 + '╮') + PAD, PAD + C('╰' + B17 + '╯') + PAD, ''),
        // 2 — half-open, no iris
        eye(PAD + C('╭' + B17 + '╮') + PAD, PAD + C('│') + ' '.repeat(17) + C('│') + PAD, PAD + C('╰' + B17 + '╯') + PAD),
        // 3 — iris appears
        eye(PAD + C('╭' + B17 + '╮') + PAD, PAD + C('│') + '        ' + D('○') + '        ' + C('│') + PAD, PAD + C('╰' + B17 + '╯') + PAD),
        // 4 — pupil
        eye(PAD + C('╭' + B17 + '╮') + PAD, PAD + C('│') + '        ' + W('●') + '        ' + C('│') + PAD, PAD + C('╰' + B17 + '╯') + PAD),
        // 5 — focused / dilated
        eye(PAD + C('╭' + B17 + '╮') + PAD, PAD + C('│') + '        ' + H('◉') + '        ' + C('│') + PAD, PAD + C('╰' + B17 + '╯') + PAD),
    ];
    const delays = [240, 80, 70, 65, 65, 180];
    // Block = 1 blank top + 3 eye lines + 1 title line = 5 rows
    const HEIGHT = 5;
    const renderBlock = ([l0, l1, l2], title) => {
        process.stdout.write('\x1b[2K\r\n'); // blank top
        process.stdout.write('\x1b[2K\r' + l0 + '\n'); // eye row 1
        process.stdout.write('\x1b[2K\r' + l1 + '\n'); // eye row 2
        process.stdout.write('\x1b[2K\r' + l2 + '\n'); // eye row 3
        process.stdout.write('\x1b[2K\r' + title + '\n'); // title / blank
    };
    // ── animate ──────────────────────────────────────────────────────────────
    renderBlock(frames[0], '');
    await sleep(delays[0]);
    for (let i = 1; i < frames.length; i++) {
        process.stdout.write(`\x1b[${HEIGHT}A`); // rewind to top of block
        renderBlock(frames[i], '');
        await sleep(delays[i]);
    }
    // Type the title on the bottom line
    process.stdout.write('\x1b[1A\x1b[2K\r'); // go back to title line, clear it
    process.stdout.write('  ');
    for (const char of 'eyeswitch') {
        process.stdout.write(chalk_1.default.cyan.bold(char));
        await sleep(32);
    }
    process.stdout.write('  ' + dim(`v${version}`) + '\n\n');
    await sleep(160);
}
// ---------------------------------------------------------------------------
// Semantic output helpers
// ---------------------------------------------------------------------------
exports.CLI = {
    success: (msg) => console.log(success('✓ ') + msg),
    error: (msg) => console.error(error('✗ ') + msg),
    warn: (msg) => console.warn(warn('⚠ ') + msg),
    info: (msg) => console.log(info('ℹ ') + msg),
    debug: (msg) => {
        if (process.env.EYESWITCH_DEBUG)
            console.log(dim('[debug] ') + dim(msg));
    },
    brand: (msg) => console.log(brand(msg)),
    focusSwitch: (from, to) => {
        const fromStr = from ? chalk_1.default.dim(from) + ' → ' : '';
        console.log(highlight('⇄ ') + fromStr + chalk_1.default.cyan.bold(to));
    },
    calibrationPrompt: (monitorName, index, total) => {
        console.log('');
        console.log(chalk_1.default.bold(`  [${index}/${total}] `) +
            'Look at ' +
            chalk_1.default.cyan.bold(monitorName) +
            ' and press ' +
            chalk_1.default.bold('Enter') +
            ' to start sampling…');
    },
    calibrationProgress: (pct, spinner, confidence = null) => {
        const filled = Math.round(pct * 20);
        const bar = chalk_1.default.cyan('█').repeat(filled) + chalk_1.default.dim('░').repeat(20 - filled);
        const confStr = confidence !== null ? chalk_1.default.dim(` [face: ${Math.round(confidence * 100)}%]`) : '';
        spinner.text = `  Sampling… ${bar} ${Math.round(pct * 100)}%${confStr}`;
    },
    calibrationResult: (monitorName, yaw, pitch) => {
        console.log(success('  ✓ Captured ') +
            chalk_1.default.cyan.bold(monitorName) +
            dim(` (yaw: ${yaw.toFixed(1)}°, pitch: ${pitch.toFixed(1)}°)`));
    },
    trackingStatus: (monitorName, yaw, pitch) => {
        process.stdout.write(`\r  ${dim('gaze:')} yaw=${chalk_1.default.cyan(yaw.toFixed(1).padStart(6))}°` +
            ` pitch=${chalk_1.default.cyan(pitch.toFixed(1).padStart(6))}°` +
            `  ${dim('→')} ${chalk_1.default.bold(monitorName.padEnd(20))}`);
    },
    newline: () => console.log(''),
    doctorCheck: (label, ok, detail) => {
        const icon = ok ? success('  ✓') : error('  ✗');
        const detailStr = detail ? chalk_1.default.dim(`  ${detail}`) : '';
        console.log(`${icon}  ${label.padEnd(28)}${detailStr}`);
    },
};
// ---------------------------------------------------------------------------
// Spinner factory
// ---------------------------------------------------------------------------
function createSpinner(text) {
    return (0, ora_1.default)({ text, spinner: 'dots' });
}
//# sourceMappingURL=cli.js.map