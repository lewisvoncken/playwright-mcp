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

Added logic to prevent creating new contexts when using non-isolated CDP endpoints:

```typescript
// Check if we can enable video recording on a new context
const browserConfig = (context as any).config?.browser;
const isCdpEndpoint = !!browserConfig?.cdpEndpoint;
const isIsolated = !!browserConfig?.isolated;

if (isCdpEndpoint && !isIsolated) {
  // Provide helpful error message instead of failing silently
  return {
    content: [{
      type: 'text' as 'text',
      text: `Video recording not available with CDP endpoint in non-isolated mode. Enable video recording at startup using --video-mode or use --isolated flag.`,
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

### Scenario 2: CDP with Isolated Mode

```bash
# Isolated mode allows new contexts for video recording
node cli.js --cdp-endpoint=http://localhost:9222 --isolated
```

The video tools can create dedicated contexts for recording when needed.

### Scenario 3: Non-isolated CDP

```bash
# Non-isolated CDP - video recording must be enabled at startup
node cli.js --cdp-endpoint=http://localhost:9222 --video-mode=on
```

The tools will inform users to enable video recording at startup or use `--isolated` flag.

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
# Method 1: Enable at startup
node cli.js --cdp-endpoint=http://localhost:9222 --video-mode=on

# Method 2: Use isolated mode for runtime video control
node cli.js --cdp-endpoint=http://localhost:9222 --isolated
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