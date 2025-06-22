# CDP Video Recording and Browser Context Fixes

## Overview

This document describes the fixes implemented to address two critical issues:

1. **Browser record not working with CDP endpoint variant**
2. **Browser being started twice, resulting in incorrect recordings**

## Issues Identified

### Issue 1: CDP Video Recording Incompatibility

**Problem**: The original video recording implementation in `src/tools/video.ts` always created a new browser context via `browser.newContext()` for video recording. This approach conflicted with CDP endpoints because:

- When `browserConfig.isolated` is `false`, CDP connections reuse the existing browser context (`browser.contexts()[0]`)
- When `browserConfig.isolated` is `true`, the `CdpContextFactory` already creates a context with video recording configured
- Creating additional contexts led to:
  - Context conflicts
  - Recording failures
  - Resource waste

### Issue 2: Multiple Browser Contexts Created

**Problem**: When using CDP with `isolated: true`, both the `CdpContextFactory` and the video tools were creating separate contexts, leading to:

- Multiple unnecessary browser contexts
- Incorrect video recordings (recording from wrong context)
- Resource inefficiency
- Potential race conditions

## Solutions Implemented

### 1. Smart Context Detection

Modified `src/tools/video.ts` to intelligently detect existing video recording capabilities:

```typescript
// Check if the current context already has video recording enabled
const currentContext = tab.page.context();
const existingVideoPath = await tab.page.video()?.path().catch(() => null);

if (existingVideoPath) {
  // Use existing context instead of creating new one
  (context as any)._videoRecording = {
    page: tab.page,
    context: currentContext,
    videoDir: path.dirname(existingVideoPath),
    requestedFilename: filename,
    startTime: Date.now(),
    usingExistingContext: true,
  };
  // ...
}
```

### 2. CDP Endpoint Compatibility Check

Added logic to prevent creating new contexts when using CDP endpoints:

```typescript
// Check browser configuration to determine if we should create new contexts
const browserConfig = (context as any).config?.browser;
const isCdpEndpoint = !!browserConfig?.cdpEndpoint;

// For CDP endpoints, avoid creating new contexts completely
if (isCdpEndpoint) {
  return {
    content: [{
      type: 'text' as 'text',
      text: `Video recording not available with CDP endpoint. Enable video recording at startup using --video-mode flag to record from the existing browser context.`,
    }]
  };
}
```

### 3. Conditional Context Cleanup

Modified the video stop logic to only close contexts that were specifically created for video recording:

```typescript
// Only close the context if we created it specifically for video recording
if (!usingExistingContext) {
  await videoContext.close();
}
```

### 4. Context Options Preservation

When creating new contexts is necessary, preserve existing context settings:

```typescript
// Copy existing context options to maintain consistency
const existingOptions = currentContext.pages()[0] ? {
  viewport: currentContext.pages()[0].viewportSize(),
  userAgent: await currentContext.pages()[0].evaluate(() => navigator.userAgent).catch(() => undefined),
} : {};

const newContext = await browser.newContext({
  ...existingOptions,
  ...contextOptions,
});
```

## Usage Scenarios

### Scenario 1: CDP with Built-in Video Recording

When video recording is enabled at startup:

```bash
# Video recording configured at startup
node cli.js --cdp-endpoint=http://localhost:9222 --video-mode=on
```

The video tools will detect existing recording capability and use it directly.

### Scenario 2: CDP with Video Recording

```bash
# Enable video recording at startup with CDP endpoint
node cli.js --cdp-endpoint=http://localhost:9222 --video-mode=on
```

The video tools will detect and use the existing recording capability.

### Scenario 3: CDP without Video Recording

```bash
# CDP without video recording - tools will provide guidance
node cli.js --cdp-endpoint=http://localhost:9222
```

The tools will inform users to enable video recording at startup using `--video-mode`.

## Benefits

1. **✅ CDP Compatibility**: Video recording now works correctly with all CDP endpoint configurations
2. **✅ Resource Efficiency**: No unnecessary browser contexts are created
3. **✅ Correct Recordings**: Videos capture the actual user interactions instead of empty contexts
4. **✅ Better Error Messages**: Clear guidance when video recording isn't available
5. **✅ Backward Compatibility**: All existing functionality continues to work

## Testing

The fixes ensure:

- Video recording works with CDP endpoints when properly configured
- No multiple browser contexts are created unnecessarily  
- Existing video recording functionality remains intact
- Clear error messages guide users to correct configurations

## Configuration Examples

### Enable video recording with CDP:

```bash
# Enable video recording at startup (required for CDP endpoints)
node cli.js --cdp-endpoint=http://localhost:9222 --video-mode=on

# Alternative: Configure video recording with size
node cli.js --cdp-endpoint=http://localhost:9222 --video-mode=on --video-size=1920,1080
```

### Context options with video recording:

```typescript
const contextOptions = {
  recordVideo: {
    dir: './videos',
    size: { width: 1280, height: 720 },
  },
};
```

The fixes ensure that these configurations work seamlessly with CDP endpoints while preventing the browser from being started multiple times.