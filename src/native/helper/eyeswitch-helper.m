/**
 * eyeswitch-helper.m
 *
 * Compiled at install time via:
 *   clang -framework Cocoa -framework CoreGraphics -framework AppKit \
 *         -framework ApplicationServices \
 *         src/native/helper/eyeswitch-helper.m -o bin/eyeswitch-helper
 *
 * Commands:
 *   eyeswitch-helper --list-monitors
 *       Prints a JSON array of monitor objects to stdout.
 *
 *   eyeswitch-helper --focus <displayId>
 *       Moves the cursor to the centre of the given display and simulates a click.
 *
 *   eyeswitch-helper --warp <displayId>
 *       Moves the cursor to the centre of the given display WITHOUT a click.
 *
 *   eyeswitch-helper --get-focused
 *       Prints the CGDirectDisplayID of the display currently under the cursor.
 *
 *   eyeswitch-helper --check-permissions
 *       Exits 0 and prints "true" if Accessibility is granted, else exits 1 and prints "false".
 */

#import <Cocoa/Cocoa.h>
#import <ApplicationServices/ApplicationServices.h>
#include <string.h>
#include <stdio.h>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

static NSString *displayName(CGDirectDisplayID displayID) {
    // Use screen name from NSScreen
    for (NSScreen *screen in [NSScreen screens]) {
        NSDictionary *desc = [screen deviceDescription];
        NSNumber *screenID = desc[@"NSScreenNumber"];
        if (screenID && (CGDirectDisplayID)[screenID unsignedIntValue] == displayID) {
            // Use localised name on macOS 10.15+
            if ([screen respondsToSelector:@selector(localizedName)]) {
                return [screen performSelector:@selector(localizedName)];
            }
            return [NSString stringWithFormat:@"Display %u", displayID];
        }
    }
    return [NSString stringWithFormat:@"Display %u", displayID];
}

static BOOL isPrimaryDisplay(CGDirectDisplayID displayID) {
    return CGDisplayIsMain(displayID);
}

// ---------------------------------------------------------------------------
// --list-monitors
// ---------------------------------------------------------------------------

static void listMonitors(void) {
    const uint32_t kMaxDisplays = 16;
    CGDirectDisplayID displays[kMaxDisplays];
    uint32_t displayCount = 0;

    CGGetActiveDisplayList(kMaxDisplays, displays, &displayCount);

    NSMutableArray *result = [NSMutableArray array];
    for (uint32_t i = 0; i < displayCount; i++) {
        CGDirectDisplayID did = displays[i];
        CGRect bounds = CGDisplayBounds(did);

        NSDictionary *entry = @{
            @"id":        @(did),
            @"x":         @((int)bounds.origin.x),
            @"y":         @((int)bounds.origin.y),
            @"width":     @((int)bounds.size.width),
            @"height":    @((int)bounds.size.height),
            @"name":      displayName(did),
            @"isPrimary": @(isPrimaryDisplay(did)),
        };
        [result addObject:entry];
    }

    NSError *err = nil;
    NSData *json = [NSJSONSerialization dataWithJSONObject:result
                                                   options:NSJSONWritingPrettyPrinted
                                                     error:&err];
    if (err || !json) {
        fprintf(stderr, "Failed to serialise monitor list: %s\n",
                err ? [[err localizedDescription] UTF8String] : "unknown error");
        exit(1);
    }

    NSString *str = [[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding];
    printf("%s\n", [str UTF8String]);
}

// ---------------------------------------------------------------------------
// --focus <displayId>
// ---------------------------------------------------------------------------

static void focusDisplay(uint32_t targetId) {
    const uint32_t kMaxDisplays = 16;
    CGDirectDisplayID displays[kMaxDisplays];
    uint32_t displayCount = 0;
    CGGetActiveDisplayList(kMaxDisplays, displays, &displayCount);

    BOOL found = NO;
    for (uint32_t i = 0; i < displayCount; i++) {
        if (displays[i] == (CGDirectDisplayID)targetId) {
            found = YES;
            break;
        }
    }

    if (!found) {
        fprintf(stderr, "Display %u not found\n", targetId);
        exit(1);
    }

    CGRect bounds = CGDisplayBounds((CGDirectDisplayID)targetId);
    CGFloat cx = bounds.origin.x + bounds.size.width / 2.0;
    CGFloat cy = bounds.origin.y + bounds.size.height / 2.0;

    // Warp cursor to centre of target display
    CGWarpMouseCursorPosition(CGPointMake(cx, cy));
    CGAssociateMouseAndMouseCursorPosition(true);

    // Simulate a left-click to transfer focus
    CGEventRef mouseDown = CGEventCreateMouseEvent(
        NULL, kCGEventLeftMouseDown, CGPointMake(cx, cy), kCGMouseButtonLeft);
    CGEventRef mouseUp = CGEventCreateMouseEvent(
        NULL, kCGEventLeftMouseUp, CGPointMake(cx, cy), kCGMouseButtonLeft);

    if (mouseDown) { CGEventPost(kCGHIDEventTap, mouseDown); CFRelease(mouseDown); }
    if (mouseUp)   { CGEventPost(kCGHIDEventTap, mouseUp);   CFRelease(mouseUp);   }
}

// ---------------------------------------------------------------------------
// --warp <displayId>  (cursor warp only — no click)
// ---------------------------------------------------------------------------

static void warpDisplay(uint32_t targetId) {
    const uint32_t kMaxDisplays = 16;
    CGDirectDisplayID displays[kMaxDisplays];
    uint32_t displayCount = 0;
    CGGetActiveDisplayList(kMaxDisplays, displays, &displayCount);

    BOOL found = NO;
    for (uint32_t i = 0; i < displayCount; i++) {
        if (displays[i] == (CGDirectDisplayID)targetId) {
            found = YES;
            break;
        }
    }

    if (!found) {
        fprintf(stderr, "Display %u not found\n", targetId);
        exit(1);
    }

    CGRect bounds = CGDisplayBounds((CGDirectDisplayID)targetId);
    CGFloat cx = bounds.origin.x + bounds.size.width / 2.0;
    CGFloat cy = bounds.origin.y + bounds.size.height / 2.0;

    CGWarpMouseCursorPosition(CGPointMake(cx, cy));
    CGAssociateMouseAndMouseCursorPosition(true);
}

// ---------------------------------------------------------------------------
// --get-focused
// ---------------------------------------------------------------------------

static void getFocused(void) {
    CGPoint location = CGEventGetLocation(
        CGEventCreate(NULL));

    const uint32_t kMaxDisplays = 16;
    CGDirectDisplayID displays[kMaxDisplays];
    uint32_t displayCount = 0;
    CGGetDisplaysWithPoint(location, kMaxDisplays, displays, &displayCount);

    if (displayCount > 0) {
        printf("%u\n", displays[0]);
    } else {
        // Fall back to main display
        printf("%u\n", CGMainDisplayID());
    }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc < 2) {
            fprintf(stderr,
                "Usage:\n"
                "  eyeswitch-helper --list-monitors\n"
                "  eyeswitch-helper --focus <displayId>\n"
                "  eyeswitch-helper --get-focused\n");
            return 1;
        }

        const char *cmd = argv[1];

        if (strcmp(cmd, "--list-monitors") == 0) {
            listMonitors();
        } else if (strcmp(cmd, "--focus") == 0) {
            if (argc < 3) {
                fprintf(stderr, "--focus requires a display ID argument\n");
                return 1;
            }
            char *endptr = NULL;
            unsigned long parsed = strtoul(argv[2], &endptr, 10);
            if (endptr == argv[2] || *endptr != '\0') {
                fprintf(stderr, "--focus: invalid display ID '%s'\n", argv[2]);
                return 1;
            }
            focusDisplay((uint32_t)parsed);
        } else if (strcmp(cmd, "--warp") == 0) {
            if (argc < 3) {
                fprintf(stderr, "--warp requires a display ID argument\n");
                return 1;
            }
            char *endptr = NULL;
            unsigned long parsed = strtoul(argv[2], &endptr, 10);
            if (endptr == argv[2] || *endptr != '\0') {
                fprintf(stderr, "--warp: invalid display ID '%s'\n", argv[2]);
                return 1;
            }
            warpDisplay((uint32_t)parsed);
        } else if (strcmp(cmd, "--get-focused") == 0) {
            getFocused();
        } else if (strcmp(cmd, "--check-permissions") == 0) {
            BOOL trusted = AXIsProcessTrusted();
            printf("%s\n", trusted ? "true" : "false");
            return trusted ? 0 : 1;
        } else {
            fprintf(stderr, "Unknown command: %s\n", cmd);
            return 1;
        }
    }
    return 0;
}
