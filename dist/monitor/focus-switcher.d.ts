/**
 * Switches focus to the given monitor via the native helper (macOS + Windows).
 * In dry-run mode all operations are logged but not executed.
 */
export declare class FocusSwitcher {
    private readonly dryRun;
    private readonly noClick;
    constructor(dryRun?: boolean, noClick?: boolean);
    /**
     * Move focus to the given monitor display ID.
     * Returns true on success, false if the helper is unavailable or dry-run.
     */
    focus(monitorId: number): boolean;
    /**
     * Return the currently focused monitor ID, or null if unavailable.
     */
    currentMonitorId(): number | null;
}
//# sourceMappingURL=focus-switcher.d.ts.map