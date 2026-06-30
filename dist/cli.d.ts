import { type Ora } from 'ora';
export declare function printBanner(version: string): Promise<void>;
export declare const CLI: {
    readonly success: (msg: string) => void;
    readonly error: (msg: string) => void;
    readonly warn: (msg: string) => void;
    readonly info: (msg: string) => void;
    readonly debug: (msg: string) => void;
    readonly brand: (msg: string) => void;
    readonly focusSwitch: (from: string | null, to: string) => void;
    readonly calibrationPrompt: (monitorName: string, index: number, total: number) => void;
    readonly calibrationProgress: (pct: number, spinner: Ora, confidence?: number | null) => void;
    readonly calibrationResult: (monitorName: string, yaw: number, pitch: number) => void;
    readonly trackingStatus: (monitorName: string, yaw: number, pitch: number) => void;
    readonly newline: () => void;
    readonly doctorCheck: (label: string, ok: boolean, detail?: string) => void;
};
export declare function createSpinner(text: string): Ora;
//# sourceMappingURL=cli.d.ts.map