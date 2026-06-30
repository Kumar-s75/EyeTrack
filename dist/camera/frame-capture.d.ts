import type { FrameBuffer } from '../types.js';
export type FrameCallback = (frame: FrameBuffer) => void;
export declare class FrameCapture {
    private readonly cameraIndex;
    private readonly targetFps;
    private ffmpegProc;
    private decoding;
    private intentionalStop;
    constructor(cameraIndex?: number, targetFps?: number);
    /**
     * Start streaming frames from the camera.
     * Calls `onFrame` for each decoded FrameBuffer.
     */
    start(onFrame: FrameCallback): void;
    /** Stop the ffmpeg process and clean up. */
    stop(): void;
    get isRunning(): boolean;
    /**
     * Scan `buf` for complete JPEG frames (SOI…EOI).
     * Dispatches each complete frame for decoding (dropping if still busy).
     * Returns leftover bytes that belong to the next (incomplete) frame.
     */
    private extractFrames;
    private decodeAndDispatch;
}
//# sourceMappingURL=frame-capture.d.ts.map