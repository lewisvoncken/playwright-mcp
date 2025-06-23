# Video Recording Configuration

This project now supports video recording for both Playwright tests and MCP server operations. Videos are automatically recorded during browser interactions and can help with debugging test failures and MCP tool usage.

## 🎥 **MCP Video Recording Tools**

### Key Improvements ✨

- **Fixed timing issues**: Extended wait time for video file finalization
- **Improved file tracking**: Videos are now reliably stored and retrievable
- **Better debugging**: Enhanced error messages show exactly where videos are stored
- **Multiple search locations**: `browser_video_get` searches all video directories

### `browser_video_start`
Start recording a video of browser interactions.

**Parameters:**
- `filename` (optional): Custom filename for the video (default: `video-{timestamp}.webm`)
- `width` (optional): Video width in pixels (default: 1280)
- `height` (optional): Video height in pixels (default: 720)

**Example:**
```json
{
  "name": "browser_video_start",
  "arguments": {
    "filename": "my-test-session.webm",
    "width": 1920,
    "height": 1080
  }
}
```

### `browser_video_stop`
Stop the current video recording and optionally return the video information.

**Parameters:**
- `returnVideo` (optional): Whether to return video URL/path in response (default: true)
- `returnBase64` (optional): Whether to return base64 content directly (can be large, default: false)
- `forceBase64` (optional): Force base64 encoding with extended validation (default: false)
- `maxWaitSeconds` (optional): Maximum seconds to wait for video finalization (default: 30)

**Example (Default - Returns URL):**
```json
{
  "name": "browser_video_stop",
  "arguments": {
    "returnVideo": true
  }
}
```

**Example (Request Base64):**
```json
{
  "name": "browser_video_stop",
  "arguments": {
    "returnVideo": true,
    "returnBase64": true,
    "maxWaitSeconds": 45
  }
}
```

### `browser_video_status`
Check if video recording is currently active and get recording details.

**Example:**
```json
{
  "name": "browser_video_status"
}
```

### `browser_video_get` (Enhanced! ⚡)
Retrieve a previously recorded video file efficiently via URL or base64.

**Parameters:**
- `filename`: Name of the video file to retrieve
- `returnContent` (optional): Whether to return video URL/path in response (default: true)
- `returnBase64` (optional): Whether to return base64 content directly (can be large, default: false)
- `forceBase64` (optional): Force base64 encoding even for problematic files (default: false)
- `maxWaitSeconds` (optional): Maximum seconds to wait for file readiness (default: 10)

**Example (Default - Returns URL):**
```json
{
  "name": "browser_video_get",
  "arguments": {
    "filename": "my-test-session.webm",
    "returnContent": true
  }
}
```

**Example (Request Base64):**
```json
{
  "name": "browser_video_get",
  "arguments": {
    "filename": "my-test-session.webm",
    "returnContent": true,
    "returnBase64": true
  }
}
```

## 🔄 **Typical Usage Workflow**

```javascript
// 1. Start recording
await client.callTool({
  name: 'browser_video_start',
  arguments: {
    filename: 'user-interaction.webm',
    width: 1280,
    height: 720
  }
});

// 2. Perform browser interactions
await client.callTool({
  name: 'browser_navigate',
  arguments: { url: 'https://example.com' }
});

await client.callTool({
  name: 'browser_click',
  arguments: { selector: 'button[type="submit"]' }
});

// 3. Stop recording and get video URL (fast, efficient)
const result = await client.callTool({
  name: 'browser_video_stop',
  arguments: { returnVideo: true }
});

// Video URL is now available in result.content[1].uri
const videoUrl = result.content[1].uri; // http://localhost:3000/videos/user-interaction.webm

// 4. Or retrieve video URL later by filename
const video = await client.callTool({
  name: 'browser_video_get',
  arguments: { filename: 'user-interaction.webm' }
});

// 5. If you need base64 data (optional, larger response)
const videoWithBase64 = await client.callTool({
  name: 'browser_video_stop',
  arguments: { 
    returnVideo: true, 
    returnBase64: true 
  }
});
// Base64 data available in videoWithBase64.content[1].data
```

## 🎬 **Video Content in MCP Responses**

### Default Response: HTTP Video URLs (Fast & Accessible)

By default, videos are returned as HTTP URLs for universal access:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Video recording stopped. Duration: 30s. Saved to /path/to/video.webm"
    },
    {
      "type": "text", 
      "text": "Video available at: http://localhost:3000/videos/video.webm (2,347 KB)"
    },
    {
      "type": "resource",
      "uri": "http://localhost:3000/videos/video.webm",
      "mimeType": "video/webm",
      "text": "Video file: video.webm"
    }
  ]
}
```

### Base64 Response (When Explicitly Requested)

Base64-encoded content is returned only when `returnBase64: true`:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Video recording stopped. Duration: 30s. Saved to /path/to/video.webm"
    },
    {
      "type": "resource",
      "data": "base64-encoded-video-content...",
      "mimeType": "video/webm",
      "uri": "file:///path/to/video.webm"
    }
  ]
}
```

### File Storage Structure

Videos are stored in timestamped directories:
```
test-results/
├── videos-1703123456789/
│   ├── my-test-session.webm
│   └── playwright-generated-name.webm
├── videos-1703123567890/
│   └── another-video.webm
```

## 🐛 **Troubleshooting**

### "Video file not found" Issues ✅ **FIXED**

The updated `browser_video_get` tool now:
- **Searches multiple locations** for your video file
- **Provides detailed debugging info** showing available videos and directories
- **Handles Playwright-generated filenames** automatically

If you still get "not found" errors, the tool will show:
- Available stored videos
- Video directories found
- Exact search paths attempted

### Best Practices

1. **Wait for completion**: Always call `browser_video_stop` before `browser_video_get`
2. **Use descriptive filenames**: Makes videos easier to find later
3. **Check status**: Use `browser_video_status` to verify recording is active
4. **Handle large videos**: Consider `returnContent: false` for very long recordings

### Performance Considerations

- **3-second wait**: Videos now wait 3 seconds after stopping for file finalization
- **Memory usage**: Base64 encoding increases response size by ~33%
- **File sizes**: 1080p videos can be large; consider 720p for better performance

## 🚀 **MCP Server Command Line Options**

### Command Line Options

```bash
# Enable video recording (always record)
node cli.js --video-mode=on

# Record only when needed for debugging (default when enabled)
node cli.js --video-mode=retain-on-failure

# Disable video recording
node cli.js --video-mode=off

# Custom video resolution
node cli.js --video-mode=on --video-size=1920,1080

# Example: Full setup with video recording
node cli.js --browser=chrome --video-mode=on --output-dir=./my-videos --port=3000
```

### Video Modes for MCP Server

- **`off`**: No video recording (default)
- **`on`**: Record all browser interactions
- **`retain-on-failure`**: Record all interactions (useful for debugging)

## 🔧 **Integration Examples**

### Claude Desktop Configuration

```json
{
  "mcpServers": {
    "playwright": {
      "command": "node", 
      "args": [
        "/path/to/playwright-mcp/cli.js",
        "--video-mode=on",
        "--video-size=1280,720"
      ]
    }
  }
}
```

### Using with Custom MCP Clients

```javascript
// Initialize with video recording
const client = await startMCPClient({
  command: 'node',
  args: ['./cli.js', '--video-mode=on', '--browser=chrome']
});

// Start a recording session
await client.callTool({
  name: 'browser_video_start',
  arguments: { filename: 'debug-session.webm' }
});

// Your browser automation here...

// Stop and retrieve video
const videoResult = await client.callTool({
  name: 'browser_video_stop',
  arguments: { returnVideo: true }
});

// Save video to file if needed
if (videoResult.content?.[1]?.type === 'resource') {
  const videoData = videoResult.content[1].data;
  fs.writeFileSync('debug-session.webm', Buffer.from(videoData, 'base64'));
}
```

## 📋 **Playwright Test Configuration**

The video recording is also configured in `playwright.config.ts` for running tests:

### Global Configuration

```typescript
use: {
  video: 'retain-on-failure',
  // videoSize: { width: 1280, height: 720 },
  // videoQuality: 'low',
}
```

### Running Tests with Video Recording

```bash
# Run tests (uses playwright.config.ts settings)
npm run test

# Run specific browser tests
npm run ctest  # Chrome with video recording
npm run ftest  # Firefox with video recording
```

## 🎯 **Common Use Cases**

### 1. **Debugging Failed Automations**
```bash
# Start MCP server with video recording
node cli.js --video-mode=retain-on-failure

# Videos will be saved automatically for any failed operations
```

### 2. **Creating Demo Videos**
```bash
# High-quality recording for demos
node cli.js --video-mode=on --video-size=1920,1080

# Use the video tools to control recording timing
```

### 3. **CI/CD Integration**
```bash
# Headless with video recording for debugging CI failures
node cli.js --headless --video-mode=retain-on-failure --video-size=1280,720
```

## ✅ **What's Fixed**

- **🔧 Timing Issues**: Videos now wait 3 seconds for proper file finalization
- **🔧 File Path Tracking**: Actual video paths are stored and tracked reliably  
- **🔧 Search Algorithm**: `browser_video_get` searches multiple locations
- **🔧 Error Messages**: Detailed debugging info when videos aren't found
- **🔧 Context Management**: Proper cleanup and video file detection

The video recording system is now robust and reliable for all MCP operations! 🎉