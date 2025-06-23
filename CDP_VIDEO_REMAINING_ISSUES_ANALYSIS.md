# 🔍 CDP Video Recording - Remaining Issues Analysis & Fixes

## 🚨 **Current Issues Identified**

Despite the extensive fixes implemented, the CDP endpoint + Browserless + video recording combination still has several issues that need to be addressed:

### **Issue 1: Browserless Endpoint Detection Is Too Broad**

**Problem**: The current code assumes ALL CDP endpoints support `Browserless.startRecording`, but this is only true for actual Browserless services.

```typescript
// Current problematic code in src/tools/video.ts
if (isCdpEndpoint) {
  // This assumes ALL CDP endpoints are Browserless - WRONG!
  await (cdpSession as any).send('Browserless.startRecording');
}
```

**Fix**: Need proper Browserless detection by checking the endpoint URL.

### **Issue 2: Missing Browserless URL Parameter Validation**

**Problem**: The code doesn't validate that `record=true` is actually in the Browserless URL, leading to silent failures.

**Current**: No validation of recording capability before attempting to start recording.
**Needed**: Check URL parameters and provide clear error messages.

### **Issue 3: Inconsistent Error Handling**

**Problem**: Different error scenarios aren't handled consistently, making debugging difficult.

**Current Issues**:
- Generic error messages that don't help users diagnose issues
- No distinction between "not Browserless" vs "Browserless without recording"
- No fallback mechanisms

### **Issue 4: Video Format and Encoding Issues**

**Problem**: Browserless may return different video formats or encoding that aren't handled properly.

**Current**: Assumes all video data from Browserless is in 'binary' format
**Issue**: Different Browserless configurations might return different formats

### **Issue 5: Missing Feature Detection**

**Problem**: No way to detect if Browserless actually supports video recording before attempting to use it.

**Current**: Blindly attempts to call recording commands
**Needed**: Feature detection and graceful fallback

## 🔧 **Specific Fixes Needed**

### **Fix 1: Proper Browserless Detection**

```typescript
function isBrowserlessEndpoint(cdpEndpoint: string): boolean {
  if (!cdpEndpoint) return false;
  
  try {
    const url = new URL(cdpEndpoint);
    // Check for common Browserless domains and patterns
    return url.hostname.includes('browserless') || 
           url.hostname.includes('chrome.browserless') ||
           url.pathname.includes('/browserless') ||
           url.searchParams.has('token'); // Browserless often uses tokens
  } catch {
    return false;
  }
}

function hasRecordingEnabled(cdpEndpoint: string): boolean {
  try {
    const url = new URL(cdpEndpoint);
    return url.searchParams.get('record') === 'true';
  } catch {
    return false;
  }
}
```

### **Fix 2: Enhanced Error Handling and User Guidance**

```typescript
if (isCdpEndpoint) {
  const isBrowserless = isBrowserlessEndpoint(browserConfig.cdpEndpoint);
  const hasRecording = hasRecordingEnabled(browserConfig.cdpEndpoint);
  
  if (!isBrowserless) {
    // Regular CDP endpoint - use standard Playwright recording
    return handleStandardCdpRecording(context, tab, filename);
  }
  
  if (!hasRecording) {
    return {
      content: [{
        type: 'text' as 'text',
        text: `Browserless endpoint detected but recording not enabled. Add 'record=true' to your CDP URL:\n\nExample: wss://production-sfo.browserless.io?token=YOUR_TOKEN&record=true`,
      }]
    };
  }
  
  // Proceed with Browserless recording...
}
```

### **Fix 3: Video Format Detection and Handling**

```typescript
// Enhanced video stop logic for Browserless
if (usingBrowserless && cdpSession) {
  try {
    const response = await (cdpSession as any).send('Browserless.stopRecording');
    
    // Handle different response formats
    let videoBuffer: Buffer;
    if (response.value) {
      if (typeof response.value === 'string') {
        // Try base64 first, then binary
        try {
          videoBuffer = Buffer.from(response.value, 'base64');
        } catch {
          videoBuffer = Buffer.from(response.value, 'binary');
        }
      } else if (Buffer.isBuffer(response.value)) {
        videoBuffer = response.value;
      } else {
        throw new Error(`Unsupported video data format: ${typeof response.value}`);
      }
    } else if (response.data) {
      videoBuffer = Buffer.from(response.data, 'base64');
    } else {
      throw new Error('No video data returned from Browserless');
    }
    
    // Validate video buffer
    if (videoBuffer.length === 0) {
      throw new Error('Empty video buffer returned from Browserless');
    }
    
    // Create video directory and save file
    const tempVideoDir = path.join(process.cwd(), 'test-results', `videos-${Date.now()}`);
    await fs.promises.mkdir(tempVideoDir, { recursive: true });
    actualVideoPath = path.join(tempVideoDir, requestedFilename);
    
    await fs.promises.writeFile(actualVideoPath, videoBuffer);
    
    // Verify file was written successfully
    const stats = await fs.promises.stat(actualVideoPath);
    if (stats.size === 0) {
      throw new Error('Video file was written but is empty');
    }
    
  } catch (error) {
    return {
      content: [{
        type: 'text' as 'text',
        text: `Browserless video recording failed: ${(error as Error).message}\n\nTroubleshooting:\n1. Ensure 'record=true' is in your CDP URL\n2. Check that your Browserless subscription supports video recording\n3. Verify the token has recording permissions`,
      }]
    };
  }
}
```

### **Fix 4: Feature Detection for Browserless**

```typescript
// Add capability detection
async function detectBrowserlessCapabilities(cdpSession: any): Promise<{
  supportsRecording: boolean;
  supportedCommands: string[];
}> {
  try {
    // Try to get Browserless capabilities
    const capabilities = await cdpSession.send('Browserless.getCapabilities').catch(() => null);
    
    if (capabilities) {
      return {
        supportsRecording: capabilities.recording === true,
        supportedCommands: capabilities.commands || []
      };
    }
    
    // Fallback: try the recording command to see if it exists
    try {
      await cdpSession.send('Browserless.startRecording');
      await cdpSession.send('Browserless.stopRecording');
      return { supportsRecording: true, supportedCommands: ['recording'] };
    } catch {
      return { supportsRecording: false, supportedCommands: [] };
    }
  } catch {
    return { supportsRecording: false, supportedCommands: [] };
  }
}
```

### **Fix 5: Improved CDP Session Management**

```typescript
// Better CDP session lifecycle management
let cdpSession: any;
try {
  cdpSession = await tab.page.context().newCDPSession(tab.page);
  
  // Detect capabilities first
  const capabilities = await detectBrowserlessCapabilities(cdpSession);
  
  if (!capabilities.supportsRecording) {
    throw new Error('Browserless endpoint does not support video recording');
  }
  
  // Start recording with timeout
  await Promise.race([
    cdpSession.send('Browserless.startRecording'),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Recording start timeout')), 10000)
    )
  ]);
  
  // Store enhanced recording info
  (context as any)._videoRecording = {
    page: tab.page,
    context: tab.page.context(),
    cdpSession,
    requestedFilename: filename,
    startTime: Date.now(),
    usingBrowserless: true,
    usingExistingContext: true,
    capabilities,
  };
  
} catch (error) {
  // Clean up CDP session on error
  if (cdpSession) {
    try {
      await cdpSession.detach();
    } catch {
      // Ignore cleanup errors
    }
  }
  throw error;
}
```

## 🚀 **Implementation Priority**

### **High Priority (Fix Immediately)**
1. **Browserless Detection**: Fix the overly broad CDP endpoint detection
2. **URL Parameter Validation**: Check for `record=true` parameter
3. **Error Handling**: Provide clear, actionable error messages

### **Medium Priority**
4. **Video Format Handling**: Handle different response formats from Browserless
5. **Feature Detection**: Detect recording capabilities before attempting to use them

### **Low Priority (Nice to Have)**
6. **Enhanced Debugging**: Add verbose logging options
7. **Graceful Fallback**: Fall back to standard recording when Browserless recording fails

## 🧪 **Testing Strategy**

### **Test Scenarios to Cover**
1. **Real Browserless with recording enabled**: `wss://chrome.browserless.io?token=TOKEN&record=true`
2. **Real Browserless without recording**: `wss://chrome.browserless.io?token=TOKEN`
3. **Regular CDP endpoint**: `http://localhost:9222`
4. **Invalid/unreachable endpoints**: `wss://invalid.endpoint.com`
5. **Browserless with invalid token**: Test authentication failures

### **Expected Behaviors**
- **Browserless + record=true**: Should use Browserless recording API
- **Browserless + no record**: Should provide clear guidance to add record=true
- **Regular CDP**: Should use standard Playwright recording if --video-mode enabled
- **Invalid endpoints**: Should provide clear error messages, not crash

## 📋 **Action Items**

1. **Update `src/tools/video.ts`** with proper Browserless detection
2. **Add URL parameter validation** for recording capability
3. **Enhance error handling** with specific, actionable messages
4. **Add capability detection** for Browserless endpoints
5. **Update documentation** with troubleshooting guide
6. **Add comprehensive tests** for all endpoint types

## 🔍 **Debugging Commands**

For users experiencing issues, provide these debugging commands:

```bash
# Test Browserless connection
node -e "console.log(new URL('YOUR_CDP_ENDPOINT').searchParams.get('record'))"

# Test CDP endpoint accessibility
curl -I YOUR_CDP_ENDPOINT

# Enable debug logging
DEBUG=pw:mcp:* node cli.js --cdp-endpoint=YOUR_ENDPOINT
```

---

**Next Steps**: Implement these fixes in order of priority, starting with proper Browserless detection and URL parameter validation. This should resolve the majority of remaining issues with CDP endpoint video recording.