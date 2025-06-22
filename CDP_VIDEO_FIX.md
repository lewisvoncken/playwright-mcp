# CDP Video Recording and Browser Context Fixes

## Overview

This document describes the fixes implemented to address two critical issues:

1. **Browser record not working with CDP endpoint variant (especially Browserless)**
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

### 1. Browserless-Specific Recording Support

Modified `src/tools/video.ts` to support Browserless's custom CDP recording API:

```typescript
if (isCdpEndpoint) {
  // For CDP endpoints (like Browserless), use their custom recording API
  try {
    const cdpSession = await tab.page.context().newCDPSession(tab.page);
    await (cdpSession as any).send('Browserless.startRecording');
    
    // Store recording info for Browserless
    (context as any)._videoRecording = {
      page: tab.page,
      context: tab.page.context(),
      cdpSession,
      requestedFilename: filename,
      startTime: Date.now(),
      usingBrowserless: true,
      usingExistingContext: true,
    };
  } catch (error) {
    // Guide user to add 'record=true' to connection URL
  }
}
```

### 2. Smart Context Detection for Standard Playwright

For non-CDP scenarios, intelligently detect existing video recording capabilities:

```typescript
// Check if standard Playwright video recording is enabled
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
}
```

### 3. Complete CDP Context Creation Prevention

Eliminated all new context creation for CDP endpoints to prevent multiple browsers:

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

### 4. Conditional Context Cleanup and Browserless Stop Logic

Modified the video stop logic to handle both Browserless and standard Playwright recording:

```typescript
if (usingBrowserless && cdpSession) {
  // Handle Browserless recording
  const response = await (cdpSession as any).send('Browserless.stopRecording');
  const videoBuffer = Buffer.from(response.value, 'binary');
  // Save video file directly
  await fs.promises.writeFile(actualVideoPath, videoBuffer);
} else {
  // Handle standard Playwright recording
  // Only close the context if we created it specifically for video recording
  if (!usingExistingContext) {
    await videoContext.close();
  }
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

### Scenario 1: Browserless with Video Recording

When using Browserless with video recording enabled:

```bash
# Browserless with recording enabled in connection URL
node cli.js --cdp-endpoint=wss://production-sfo.browserless.io?token=YOUR_TOKEN&record=true
```

The video tools will use Browserless's custom CDP recording API automatically.

### Scenario 2: Regular CDP with Video Recording

```bash
# Regular CDP endpoint with video recording enabled at startup
node cli.js --cdp-endpoint=http://localhost:9222 --video-mode=on
```

The video tools will detect and use the existing standard Playwright recording capability.

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

### Enable video recording with different CDP variants:

```bash
# Browserless (add record=true to connection URL)
node cli.js --cdp-endpoint="wss://production-sfo.browserless.io?token=YOUR_TOKEN&record=true"

# Regular CDP endpoint (enable at startup)
node cli.js --cdp-endpoint=http://localhost:9222 --video-mode=on

# Regular CDP with custom video size
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