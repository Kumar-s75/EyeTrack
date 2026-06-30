/*
 * eyeswitch-helper-win.c
 *
 * Windows native helper for eyeswitch.
 * Implements the same CLI interface as the macOS Objective-C helper so that
 * the TypeScript bridge (native-bridge.ts) can call it identically on both
 * platforms.
 *
 * Build (MinGW / MSYS2 — recommended):
 *   gcc eyeswitch-helper-win.c -o bin/eyeswitch-helper.exe -luser32 -lgdi32
 *
 * Build (MSVC):
 *   cl eyeswitch-helper-win.c /Fe:bin\eyeswitch-helper.exe /link user32.lib gdi32.lib
 *
 * Supported commands:
 *   --list-monitors          Print JSON array of all active displays
 *   --focus <displayId>      Warp cursor to display centre and simulate a click
 *   --warp  <displayId>      Warp cursor to display centre (no click)
 *   --get-focused            Print the display ID under the current cursor
 *   --check-permissions      Always prints "true" (Windows needs no special perms)
 */

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* -------------------------------------------------------------------------
 * Monitor enumeration
 * ------------------------------------------------------------------------- */

#define MAX_MONITORS 32

typedef struct {
    HMONITOR handle;
    MONITORINFOEX info;
    int index; /* 0-based insertion order, used as the stable integer ID */
} MonitorEntry;

static MonitorEntry g_monitors[MAX_MONITORS];
static int          g_monitorCount = 0;

static BOOL CALLBACK enumMonitorProc(HMONITOR hMon, HDC hDC, LPRECT lpRect, LPARAM data) {
    (void)hDC; (void)lpRect; (void)data;
    if (g_monitorCount >= MAX_MONITORS) return TRUE;

    MonitorEntry *e = &g_monitors[g_monitorCount];
    e->handle = hMon;
    e->index  = g_monitorCount;

    memset(&e->info, 0, sizeof(e->info));
    e->info.cbSize = sizeof(MONITORINFOEX);
    GetMonitorInfo(hMon, (LPMONITORINFO)&e->info);

    g_monitorCount++;
    return TRUE;
}

static void collectMonitors(void) {
    g_monitorCount = 0;
    EnumDisplayMonitors(NULL, NULL, enumMonitorProc, 0);
}

/* -------------------------------------------------------------------------
 * JSON helpers
 * ------------------------------------------------------------------------- */

/* Escape a Windows device name (e.g. "\\.\DISPLAY1") for JSON output.
 * Backslashes are doubled; the result is written into buf. */
static void jsonEscapeString(const char *src, char *buf, int bufLen) {
    int i = 0, j = 0;
    while (src[i]) {
        int need = (src[i] == '\\' || src[i] == '"') ? 2 : 1;
        if (j + need >= bufLen - 1) break; /* leave room for null terminator */
        if (need == 2) buf[j++] = '\\';
        buf[j++] = src[i++];
    }
    buf[j] = '\0';
}

/* -------------------------------------------------------------------------
 * --list-monitors
 * ------------------------------------------------------------------------- */

static void cmdListMonitors(void) {
    collectMonitors();

    /* Determine primary monitor ID */
    int primaryId = 0;
    for (int i = 0; i < g_monitorCount; i++) {
        if (g_monitors[i].info.dwFlags & MONITORINFOF_PRIMARY) {
            primaryId = i;
            break;
        }
    }

    printf("[");
    for (int i = 0; i < g_monitorCount; i++) {
        MonitorEntry *e = &g_monitors[i];
        RECT *r = &e->info.rcMonitor;

        char escapedName[128];
        /* Convert wide device name to narrow for JSON output */
        char narrowName[64];
        WideCharToMultiByte(CP_UTF8, 0, e->info.szDevice, -1,
                            narrowName, sizeof(narrowName), NULL, NULL);
        jsonEscapeString(narrowName, escapedName, sizeof(escapedName));

        int width     = r->right  - r->left;
        int height    = r->bottom - r->top;
        int isPrimary = (e->info.dwFlags & MONITORINFOF_PRIMARY) ? 1 : 0;

        printf(
            "%s{\"id\":%d,\"x\":%ld,\"y\":%ld,\"width\":%d,\"height\":%d,"
            "\"name\":\"%s\",\"isPrimary\":%s}",
            (i > 0 ? "," : ""),
            e->index,
            r->left, r->top,
            width, height,
            escapedName,
            isPrimary ? "true" : "false"
        );
    }
    printf("]\n");
}

/* -------------------------------------------------------------------------
 * Helper: find a monitor entry by integer ID
 * ------------------------------------------------------------------------- */

static MonitorEntry *findMonitorById(int id) {
    for (int i = 0; i < g_monitorCount; i++) {
        if (g_monitors[i].index == id) return &g_monitors[i];
    }
    return NULL;
}

/* -------------------------------------------------------------------------
 * --warp <id>  — move cursor to monitor centre, no click
 * ------------------------------------------------------------------------- */

static int cmdWarp(int displayId) {
    collectMonitors();
    MonitorEntry *e = findMonitorById(displayId);
    if (!e) {
        fprintf(stderr, "eyeswitch-helper: unknown display id %d\n", displayId);
        return 1;
    }

    RECT *r = &e->info.rcMonitor;
    int cx = r->left + (r->right  - r->left) / 2;
    int cy = r->top  + (r->bottom - r->top)  / 2;

    SetCursorPos(cx, cy);
    return 0;
}

/* -------------------------------------------------------------------------
 * --focus <id>  — move cursor + simulate left-click
 * ------------------------------------------------------------------------- */

static int cmdFocus(int displayId) {
    int ret = cmdWarp(displayId);
    if (ret != 0) return ret;

    /* Simulate a left mouse button down + up at current position */
    INPUT inputs[2];
    memset(inputs, 0, sizeof(inputs));

    inputs[0].type           = INPUT_MOUSE;
    inputs[0].mi.dwFlags     = MOUSEEVENTF_LEFTDOWN;

    inputs[1].type           = INPUT_MOUSE;
    inputs[1].mi.dwFlags     = MOUSEEVENTF_LEFTUP;

    SendInput(2, inputs, sizeof(INPUT));
    return 0;
}

/* -------------------------------------------------------------------------
 * --get-focused  — print the display ID under the cursor
 * ------------------------------------------------------------------------- */

static int cmdGetFocused(void) {
    collectMonitors();

    POINT pt;
    GetCursorPos(&pt);

    HMONITOR hMon = MonitorFromPoint(pt, MONITOR_DEFAULTTONEAREST);

    for (int i = 0; i < g_monitorCount; i++) {
        if (g_monitors[i].handle == hMon) {
            printf("%d\n", g_monitors[i].index);
            return 0;
        }
    }

    /* Fallback: print 0 (primary) if not found */
    printf("0\n");
    return 0;
}

/* -------------------------------------------------------------------------
 * --check-permissions  — Windows needs no special accessibility permissions
 * ------------------------------------------------------------------------- */

static int cmdCheckPermissions(void) {
    printf("true\n");
    return 0;
}

/* -------------------------------------------------------------------------
 * Entry point
 * ------------------------------------------------------------------------- */

int main(int argc, char *argv[]) {
    if (argc < 2) {
        fprintf(stderr,
            "Usage: eyeswitch-helper <command> [args]\n"
            "Commands:\n"
            "  --list-monitors\n"
            "  --focus <displayId>\n"
            "  --warp  <displayId>\n"
            "  --get-focused\n"
            "  --check-permissions\n");
        return 1;
    }

    if (strcmp(argv[1], "--list-monitors") == 0) {
        cmdListMonitors();
        return 0;
    }

    if (strcmp(argv[1], "--focus") == 0) {
        if (argc < 3) { fprintf(stderr, "eyeswitch-helper: --focus requires a display id\n"); return 1; }
        return cmdFocus(atoi(argv[2]));
    }

    if (strcmp(argv[1], "--warp") == 0) {
        if (argc < 3) { fprintf(stderr, "eyeswitch-helper: --warp requires a display id\n"); return 1; }
        return cmdWarp(atoi(argv[2]));
    }

    if (strcmp(argv[1], "--get-focused") == 0) {
        return cmdGetFocused();
    }

    if (strcmp(argv[1], "--check-permissions") == 0) {
        return cmdCheckPermissions();
    }

    fprintf(stderr, "eyeswitch-helper: unknown command: %s\n", argv[1]);
    return 1;
}
