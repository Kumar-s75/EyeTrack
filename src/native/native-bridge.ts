import { execFileSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { z } from 'zod';
import type { Monitor, MonitorLayout } from '../types.js';

// ---------------------------------------------------------------------------
// Schema for JSON output from the helper binary
// ---------------------------------------------------------------------------

const MonitorSchema = z.object({
  id: z.number(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  name: z.string(),
  isPrimary: z.boolean(),
});

const MonitorListSchema = z.array(MonitorSchema);

// ---------------------------------------------------------------------------
// Helper binary location — platform-aware
// ---------------------------------------------------------------------------

const HELPER_BINARY = process.platform === 'win32'
  ? 'eyeswitch-helper.exe'
  : 'eyeswitch-helper';

const HELPER_PATH = path.resolve(
  path.join(__dirname, '..', '..', 'bin', HELPER_BINARY),
);

function assertHelperExists(): void {
  if (!fs.existsSync(HELPER_PATH)) {
    const buildCmd = process.platform === 'win32'
      ? '"npm run build:helper" (requires MinGW/MSYS2 with gcc, or MSVC)'
      : '"npm run build:helper" (requires Xcode Command Line Tools)';
    throw new Error(
      `eyeswitch-helper binary not found at ${HELPER_PATH}.\n` +
        `Run ${buildCmd} to compile it.`,
    );
  }
}

function runHelper(args: string[]): string {
  assertHelperExists();
  const output = execFileSync(HELPER_PATH, args, {
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
export function listMonitors(): MonitorLayout {
  const raw = runHelper(['--list-monitors']);
  const parsed = MonitorListSchema.parse(JSON.parse(raw));

  const monitors: ReadonlyArray<Monitor> = Object.freeze(
    parsed.map((m) =>
      Object.freeze({
        id: m.id,
        x: m.x,
        y: m.y,
        width: m.width,
        height: m.height,
        name: m.name,
        isPrimary: m.isPrimary,
      }),
    ),
  );

  const primary = monitors.find((m) => m.isPrimary) ?? monitors[0];

  return Object.freeze({
    monitors,
    primaryMonitorId: primary?.id ?? 0,
  });
}

/**
 * Move cursor to the centre of the target display and simulate a click.
 */
export function focusMonitor(displayId: number): void {
  runHelper(['--focus', String(displayId)]);
}

/**
 * Return the display ID of the display currently under the cursor.
 */
export function getFocusedMonitorId(): number {
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
export function isHelperAvailable(): boolean {
  return fs.existsSync(HELPER_PATH);
}

/**
 * Move cursor to the centre of the target display WITHOUT simulating a click.
 */
export function warpMonitor(displayId: number): void {
  runHelper(['--warp', String(displayId)]);
}

/**
 * Returns true if the required system permissions are granted.
 * On macOS this checks Accessibility (AX) permission via the helper.
 * On Windows this always returns true — no special permissions needed.
 */
export function checkAccessibilityPermission(): boolean {
  try {
    const raw = runHelper(['--check-permissions']);
    return raw === 'true';
  } catch {
    return false;
  }
}
