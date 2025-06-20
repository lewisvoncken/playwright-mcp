# Video Recording Configuration

This project now supports video recording for both Playwright tests and MCP server operations. Videos are automatically recorded during browser interactions and can help with debugging test failures and MCP tool usage.

## MCP Server Video Recording

### Command Line Options

The MCP server now supports video recording through command line options:

```bash
# Enable video recording (always record)
node cli.js --video-mode=on

# Record only when needed for debugging (default behavior when enabled)
node cli.js --video-mode=retain-on-failure

# Disable video recording
node cli.js --video-mode=off

# Custom video resolution
node cli.js --video-mode=on --video-size=1920,1080

# Example: Run MCP server with video recording
node cli.js --browser=chrome --video-mode=on --output-dir=./my-videos
```

### Video Modes for MCP Server

- **`off`**: No video recording (default)
- **`on`**: Record all browser interactions
- **`retain-on-failure`**: Record all interactions (useful for debugging MCP operations)

### Video Storage Location

Videos are stored in timestamped directories within `test-results/`:
```
test-results/
├── videos-1234567890/
│   ├── video-page-1.webm
│   └── video-page-2.webm
```

## Video Recording Tools

The MCP server now includes dedicated video recording tools that allow fine-grained control over video capture:

### `browser_video_start`
Start recording a video of browser interactions.

**Parameters:**
- `filename` (optional): Custom filename for the video
- `width` (optional): Video width in pixels (default: 1280)
- `height` (optional): Video height in pixels (default: 720)

**Example:**
```json
{
  "name": "browser_video_start",
  "arguments": {
    "filename": "my-recording.webm",
    "width": 1920,
    "height": 1080
  }
}
```

### `browser_video_stop`
Stop the current video recording and optionally return the video content.

**Parameters:**
- `returnVideo` (optional): Whether to include video content in response (default: true)

**Example:**
```json
{
  "name": "browser_video_stop",
  "arguments": {
    "returnVideo": true
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

### `browser_video_get`
Retrieve a previously recorded video file.

**Parameters:**
- `filename`: Name of the video file to retrieve
- `returnContent` (optional): Whether to include video content in response (default: true)

**Example:**
```json
{
  "name": "browser_video_get",
  "arguments": {
    "filename": "my-recording.webm",
    "returnContent": true
  }
}
```

## Video Content in MCP Responses

### Direct Video Return

Videos can be returned directly in MCP responses as base64-encoded content:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Video recording stopped. Duration: 30s. Saved to video-2024-01-01.webm"
    },
    {
      "type": "resource",
      "data": "base64-encoded-video-content...",
      "mimeType": "video/webm",
      "uri": "file:///path/to/video-2024-01-01.webm"
    }
  ]
}
```

### Client Support Detection

The server automatically detects client support for video content:
- **Supported clients**: Will receive video content directly in responses
- **Unsupported clients**: Will receive file path information only

### Streaming Considerations

**Advantages of Direct Return:**
- ✅ Immediate access to video content
- ✅ No additional file serving infrastructure needed
- ✅ Works with any MCP transport (stdio, SSE, HTTP)

**Considerations:**
- ⚠️ Large videos may impact response size
- ⚠️ Base64 encoding increases payload by ~33%
- ⚠️ Memory usage during encoding

## Playwright Test Configuration

The video recording is also configured in `playwright.config.ts` for running tests with `npm test`:

### Global Configuration

```typescript
use: {
  video: 'retain-on-failure',
  // videoSize: { width: 1280, height: 720 },
  // videoQuality: 'low',
}
```

### Project-Specific Configuration

Each browser project has individual video settings:

```typescript
{
  name: 'chrome',
  use: {
    video: {
      mode: 'retain-on-failure',
      size: { width: 1280, height: 720 }
    }
  }
}
```

## Video Recording Modes

### `retain-on-failure` (Recommended)
- Records videos for all operations
- Only keeps videos for failed tests/operations
- Deletes videos for successful operations automatically
- Recommended for CI/CD environments

### `on`
- Records videos for all operations
- Keeps all videos regardless of result
- Useful for debugging or demo purposes
- Requires more storage space

### `off`
- Disables video recording completely
- Use when video recording is not needed

## Video Options

### Video Size
Configure the video resolution:
```bash
# 720p HD (default)
node cli.js --video-mode=on --video-size=1280,720

# 1080p Full HD
node cli.js --video-mode=on --video-size=1920,1080

# Custom resolution
node cli.js --video-mode=on --video-size=1024,768
```

Common resolutions:
- `1920,1080` - 1080p Full HD
- `1280,720` - 720p HD (default)
- `1024,768` - Standard resolution

### Video Quality (Test configuration only)
```typescript
use: {
  video: 'retain-on-failure',
  videoQuality: 'low'  // 'low' or 'high'
}
```

- `low`: Smaller file size, lower quality
- `high`: Larger file size, better quality

## Usage Examples

### MCP Server with Video Recording

```bash
# Basic video recording
node cli.js --video-mode=on

# High quality recording
node cli.js --video-mode=on --video-size=1920,1080

# Record only when debugging needed
node cli.js --video-mode=retain-on-failure

# With custom output directory
node cli.js --video-mode=on --output-dir=./debug-videos

# Headless mode with video recording
node cli.js --headless --video-mode=on

# Specific browser with video recording
node cli.js --browser=firefox --video-mode=on
```

### Using Video Tools Programmatically

```javascript
// Start recording
await client.callTool({
  name: 'browser_video_start',
  arguments: {
    filename: 'user-session.webm',
    width: 1920,
    height: 1080
  }
});

// Perform browser interactions...
await client.callTool({
  name: 'browser_navigate',
  arguments: { url: 'https://example.com' }
});

// Stop recording and get video
const result = await client.callTool({
  name: 'browser_video_stop',
  arguments: { returnVideo: true }
});

// The result.content will include the video as base64
```

### Running Tests with Video Recording

```bash
# Run tests (uses playwright.config.ts settings)
npm run test

# Run specific browser tests
npm run ctest  # Chrome with video recording
npm run ftest  # Firefox with video recording
```

## Environment-Specific Settings

### CI/CD Environments
- Videos are automatically configured for CI environments
- Only failed operation videos are retained to save storage
- Videos help with debugging issues in headless environments

### Local Development
- You can use `--video-mode=on` for comprehensive recording
- Videos help understand MCP tool behavior and failures
- Great for debugging browser automation issues

## Integration with MCP Clients

When using with MCP clients (like Claude Desktop), add video recording options:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "node", 
      "args": [
        "/path/to/playwright-mcp/cli.js",
        "--video-mode=retain-on-failure",
        "--video-size=1280,720"
      ]
    }
  }
}
```

## Viewing Videos

1. **After MCP operations**, check the `test-results/videos-*` directory
2. **Navigate to the timestamped folder**
3. **Open `.webm` files** in any modern browser or video player
4. **Videos show exact browser interactions** during MCP tool execution
5. **If returned in MCP response**, decode the base64 content and save as `.webm`

## Troubleshooting

### Large Video Files
- Use smaller video dimensions: `--video-size=1024,768`
- Consider using `retain-on-failure` mode
- Monitor disk space usage
- For MCP responses, consider using `returnVideo: false` for large recordings

### Missing Videos
- Ensure video recording is enabled with `--video-mode=on` or `--video-mode=retain-on-failure`
- Check that the browser context is actually created
- Verify sufficient disk space is available
- Check the `test-results/` directory for timestamped video folders

### Video Content Not Returned
- Check if client supports video content (some clients may not)
- Verify video file exists and is readable
- Check file size (very large videos may timeout)

### Performance Impact
- Video recording adds minimal overhead to MCP operations
- File I/O occurs during browser interactions
- Consider disabling for performance-critical automations
- Base64 encoding happens only when returning content

### Permission Issues
- Ensure write permissions for the output directory
- Check that `test-results/` can be created in the current working directory

## Configuration Examples

### Development Setup
```bash
# Full recording for debugging
node cli.js --video-mode=on --video-size=1920,1080 --browser=chrome
```

### Production Setup
```bash
# Minimal recording for issue diagnosis
node cli.js --video-mode=retain-on-failure --video-size=1280,720 --headless
```

### Testing Setup
```bash
# Disable recording for performance
node cli.js --video-mode=off
```

## Advanced Features

### Programmatic Video Control
- Start/stop recording on demand via MCP tools
- Retrieve specific video files by name
- Control video quality and resolution per recording
- Check recording status and duration

### Multiple Recording Sessions
- Each `browser_video_start` creates a new context
- Multiple videos can be recorded sequentially
- Automatic cleanup of video contexts on stop

### Video Format Support
- Primary format: WebM (`.webm`)
- Compatible with all major browsers and players
- Optimal compression for web delivery

The video recording is now fully integrated into both the MCP server operations and the test suite, providing comprehensive debugging capabilities for browser automation workflows!