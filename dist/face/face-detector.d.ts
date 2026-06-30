import '@tensorflow/tfjs-backend-wasm';
import '@tensorflow/tfjs-backend-cpu';
import type { FrameBuffer, FaceLandmarks } from '../types.js';
/**
 * Wraps the TensorFlow.js MediaPipe FaceMesh model.
 * Extracts 468 3D facial landmarks from a raw FrameBuffer.
 */
export declare class FaceDetector {
    private detector;
    /**
     * Load and warm up the TF.js model.
     * Must be called before any call to detect().
     */
    initialize(): Promise<void>;
    /**
     * Detect face landmarks in a single frame.
     * Returns null if no face is found or confidence is below threshold.
     */
    detect(frame: FrameBuffer, minConfidence?: number): Promise<FaceLandmarks | null>;
    dispose(): void;
    private frameToCanvas;
    private warmUp;
}
//# sourceMappingURL=face-detector.d.ts.map