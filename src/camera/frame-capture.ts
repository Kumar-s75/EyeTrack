import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { loadImage, createCanvas } from '@napi-rs/canvas';
import type { FrameBuffer } from '../types.js';

// ---------------------------------------------------------------------------
// FrameCapture — ffmpeg-based, cross-platform
// ---------------------------------------------------------------------------
//
// Streams MJPEG frames from the webcam via ffmpeg's stdout pipe.
// Eliminates imagesnap and all disk I/O that was heating up the system.
//
// Perf notes:
//   • 320×240 capture — 4× fewer pixels than 640×480; sufficient for FaceMesh
//   • `decoding` flag drops incoming frames while TF.js is still inferring
//   • Default 30 fps for smoother head tracking

export type FrameCallback = (frame: FrameBuffer) => void;

const CAPTURE_WIDTH  = 320;
const CAPTURE_HEIGHT = 240;

// JPEG SOI / EOI byte sequences used to delimit frames in the MJPEG pipe
const SOI = Buffer.from([0xff, 0xd8]);
const EOI = Buffer.from([0xff, 0xd9]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFfmpegPath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('ffmpeg-static') as string;
  } catch {
    return 'ffmpeg'; // fall back to system PATH
  }
}

/**
 * List DirectShow video device names on Windows.
 * Returns an ordered array; index 0 is the first camera.
 */
function listWindowsVideoDevices(): string[] {
  try {
    const result = spawnSync(
      getFfmpegPath(),
      ['-f', 'dshow', '-list_devices', 'true', '-i', 'dummy'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const output = result.stderr ?? '';
    const devices: string[] = [];
    let inVideoSection = false;

    for (const line of output.split(/\r?\n/)) {
      if (line.includes('DirectShow video devices')) {
        inVideoSection = true;
        continue;
      }
      if (inVideoSection && line.includes('DirectShow audio devices')) break;
      if (!inVideoSection) continue;

      // Lines look like:  [dshow @ 0xaddr]  "Camera Name"
      // Alternative name lines start with "@device_" — skip those
      const m = line.match(/"([^"]+)"/);
      if (m && !m[1].startsWith('@')) {
        devices.push(m[1].trim());
      }
    }
    return devices;
  } catch {
    return [];
  }
}

function buildInputArgs(cameraIndex: number): string[] {
  if (process.platform === 'darwin') {
    // '<video>:none' selects video device N with no audio
    return ['-f', 'avfoundation', '-i', `${cameraIndex}:none`];
  }

  if (process.platform === 'win32') {
    const devices = listWindowsVideoDevices();
    const deviceName = devices[cameraIndex] ?? devices[0];
    if (!deviceName) {
      throw new Error(
        'No camera found.\n' +
        '  Make sure your webcam is connected and not in use by another application.\n' +
        '  Then: Windows Settings → Privacy & Security → Camera\n' +
        '        → enable "Let desktop apps access your camera"',
      );
    }
    return ['-f', 'dshow', '-i', `video=${deviceName}`];
  }

  // Linux / other
  return ['-f', 'v4l2', '-i', `/dev/video${cameraIndex}`];
}

// ---------------------------------------------------------------------------
// FrameCapture
// ---------------------------------------------------------------------------

export class FrameCapture {
  private ffmpegProc: ChildProcess | null = null;
  private decoding = false;  // true while a JPEG frame is being decoded by @napi-rs/canvas
  private intentionalStop = false;

  constructor(
    private readonly cameraIndex: number = 0,
    private readonly targetFps: number = 30,
  ) {}

  /**
   * Start streaming frames from the camera.
   * Calls `onFrame` for each decoded FrameBuffer.
   */
  start(onFrame: FrameCallback): void {
    if (this.ffmpegProc !== null) {
      throw new Error('FrameCapture is already running');
    }
    this.intentionalStop = false;

    let inputArgs: string[];
    try {
      inputArgs = buildInputArgs(this.cameraIndex);
    } catch (err) {
      console.error('\n[FrameCapture]', String(err));
      return;
    }

    const ffmpeg = getFfmpegPath();
    const args = [
      '-loglevel', 'error',
      ...inputArgs,
      // Scale down + limit fps in the video filter — reduces encoder workload
      '-vf', `fps=${this.targetFps},scale=${CAPTURE_WIDTH}:${CAPTURE_HEIGHT}`,
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      '-q:v', '5',   // JPEG quality (2=best quality/large, 31=worst/small); 5 is a good balance
      'pipe:1',
    ];

    this.ffmpegProc = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    // Collect stderr to surface helpful messages on failure
    let stderrBuf = '';
    this.ffmpegProc.stderr?.on('data', (d: Buffer) => {
      const msg = d.toString();
      stderrBuf += msg;
      if (process.env.EYESWITCH_DEBUG) {
        process.stderr.write('[ffmpeg] ' + msg);
      }
    });

    this.ffmpegProc.on('error', (err) => {
      console.error('[FrameCapture] Failed to launch ffmpeg:', err.message);
    });

    this.ffmpegProc.on('close', (code) => {
      if (!this.intentionalStop && code !== 0 && stderrBuf.trim().length > 0) {
        console.error('\n[FrameCapture] Camera error:\n  ' + stderrBuf.trim().replace(/\n/g, '\n  '));
        if (process.platform === 'win32') {
          console.error(
            '\n  Fix: Windows Settings → Privacy & Security → Camera\n' +
            '       → enable "Let desktop apps access your camera"\n' +
            '       → then restart eyeswitch',
          );
        } else if (process.platform === 'darwin') {
          console.error(
            '\n  Fix: System Settings → Privacy & Security → Camera\n' +
            '       → enable access for Terminal (or your terminal app)',
          );
        }
      }
      this.ffmpegProc = null;
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pending: any = Buffer.alloc(0);
    this.ffmpegProc.stdout?.on('data', (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk]);
      pending = this.extractFrames(pending, onFrame);
    });
  }

  /** Stop the ffmpeg process and clean up. */
  stop(): void {
    this.intentionalStop = true;
    if (this.ffmpegProc) {
      try { this.ffmpegProc.kill('SIGKILL'); } catch { /* ignore */ }
      this.ffmpegProc = null;
    }
  }

  get isRunning(): boolean {
    return this.ffmpegProc !== null;
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  /**
   * Scan `buf` for complete JPEG frames (SOI…EOI).
   * Dispatches each complete frame for decoding (dropping if still busy).
   * Returns leftover bytes that belong to the next (incomplete) frame.
   */
  private extractFrames(buf: Buffer, onFrame: FrameCallback): Buffer {
    let pos = 0;

    while (pos < buf.length) {
      const soiIdx = buf.indexOf(SOI, pos);
      if (soiIdx < 0) break; // no start-of-image found — discard leading bytes

      const eoiIdx = buf.indexOf(EOI, soiIdx + 2);
      if (eoiIdx < 0) {
        // Incomplete frame — keep everything from SOI onward for the next chunk
        return buf.slice(soiIdx);
      }

      const frameEnd = eoiIdx + 2;
      const jpeg = buf.slice(soiIdx, frameEnd);
      pos = frameEnd;

      if (!this.decoding) {
        this.decoding = true;
        this.decodeAndDispatch(jpeg, onFrame).finally(() => {
          this.decoding = false;
        });
      }
      // else: TF.js is still busy with the previous frame — drop this one
    }

    return buf.slice(pos); // bytes after the last consumed frame
  }

  private async decodeAndDispatch(jpeg: Buffer, onFrame: FrameCallback): Promise<void> {
    // Cast to any — loadImage accepts Buffer but @napi-rs/canvas types expect ArrayBuffer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const img = await loadImage(jpeg as any);
    const canvas = createCanvas(CAPTURE_WIDTH, CAPTURE_HEIGHT);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, CAPTURE_WIDTH, CAPTURE_HEIGHT);
    const imageData = ctx.getImageData(0, 0, CAPTURE_WIDTH, CAPTURE_HEIGHT);

    onFrame(
      Object.freeze({
        data: new Uint8ClampedArray(imageData.data),
        width:  CAPTURE_WIDTH,
        height: CAPTURE_HEIGHT,
        timestamp: Date.now(),
      }),
    );
  }
}
