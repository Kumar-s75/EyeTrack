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
exports.FaceDetector = void 0;
const faceLandmarksDetection = __importStar(require("@tensorflow-models/face-landmarks-detection"));
require("@tensorflow/tfjs-backend-wasm");
require("@tensorflow/tfjs-backend-cpu");
const tfjs_backend_wasm_1 = require("@tensorflow/tfjs-backend-wasm");
const tf = __importStar(require("@tensorflow/tfjs-core"));
const path = __importStar(require("path"));
const canvas_1 = require("@napi-rs/canvas");
// ---------------------------------------------------------------------------
// FaceDetector
// ---------------------------------------------------------------------------
/**
 * Wraps the TensorFlow.js MediaPipe FaceMesh model.
 * Extracts 468 3D facial landmarks from a raw FrameBuffer.
 */
class FaceDetector {
    detector = null;
    /**
     * Load and warm up the TF.js model.
     * Must be called before any call to detect().
     */
    async initialize() {
        // Point TF.js at the bundled WASM binaries (dist/ inside the package)
        const wasmDir = path.dirname(require.resolve('@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm.wasm'));
        (0, tfjs_backend_wasm_1.setWasmPaths)(`${wasmDir}/`);
        // Prefer WASM (5–8× faster than pure JS, no native compilation needed).
        // Fall back to CPU if WASM is unavailable in this environment.
        try {
            await tf.setBackend('wasm');
        }
        catch {
            await tf.setBackend('cpu');
        }
        await tf.ready();
        const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
        this.detector = await faceLandmarksDetection.createDetector(model, {
            runtime: 'tfjs',
            refineLandmarks: false,
            maxFaces: 1,
        });
        // Warm up with a blank frame to avoid cold-start latency
        await this.warmUp();
    }
    /**
     * Detect face landmarks in a single frame.
     * Returns null if no face is found or confidence is below threshold.
     */
    async detect(frame, minConfidence = 0.7) {
        if (!this.detector) {
            throw new Error('FaceDetector not initialised — call initialize() first');
        }
        const canvas = this.frameToCanvas(frame);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const faces = await this.detector.estimateFaces(canvas);
        if (faces.length === 0)
            return null;
        const face = faces[0];
        // The tfjs runtime sets face.score to a probability; check it
        const score = face.score ?? 1.0;
        if (score < minConfidence)
            return null;
        const keypoints = Object.freeze(face.keypoints.map((kp) => Object.freeze({
            x: kp.x,
            y: kp.y,
            z: kp.z ?? 0,
        })));
        return Object.freeze({
            keypoints,
            score,
            frameTimestamp: frame.timestamp,
        });
    }
    dispose() {
        if (this.detector) {
            this.detector.dispose();
            this.detector = null;
        }
    }
    // ---------------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------------
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    frameToCanvas(frame) {
        const canvas = (0, canvas_1.createCanvas)(frame.width, frame.height);
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(frame.width, frame.height);
        imageData.data.set(frame.data);
        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }
    async warmUp() {
        const dummyFrame = {
            data: new Uint8ClampedArray(640 * 480 * 4).fill(128),
            width: 640,
            height: 480,
            timestamp: 0,
        };
        await this.detect(dummyFrame);
    }
}
exports.FaceDetector = FaceDetector;
//# sourceMappingURL=face-detector.js.map