# 🎬 Browserless & Chrome DevTools Screencast Guide

## 🎯 **Overview**

This guide covers two distinct approaches to video recording with CDP endpoints:

1. **Browserless Custom Recording** - Complete WebM video files using `Browserless.startRecording`
2. **Chrome DevTools Screencast** - Individual frame capture using `Page.startScreencast`

## 🔧 **Browserless Custom Recording (Recommended)**

Browserless provides a custom CDP API that generates complete WebM video files with audio support.

### **✅ Setup Requirements**
- Browserless endpoint (e.g., `wss://chrome.browserless.io`)
- `record=true` parameter in connection URL
- Valid Browserless token

### **📡 How It Works**
Browserless uses custom CDP commands:
- `Browserless.startRecording` - Start video recording
- `Browserless.stopRecording` - Stop and return complete WebM file

### **🚀 Usage Example**

```bash
# Start with Browserless recording enabled
node cli.js --cdp-endpoint="wss://chrome.browserless.io?token=YOUR_TOKEN&record=true"
```

```javascript
// Start recording
await client.callTool({
  name: 'browser_video_start',
  arguments: {
    filename: 'browserless-session.webm',
    width: 1920,
    height: 1080
  }
});

// Perform browser actions
await client.callTool({
  name: 'browser_navigate',
  arguments: { url: 'https://example.com' }
});

// Stop and get complete video
const result = await client.callTool({
  name: 'browser_video_stop',
  arguments: { 
    returnVideo: true 
  }
});

// Video available as base64 WebM in result.content[1].data
```

### **📋 What You Get**
- ✅ Complete WebM video file
- ✅ Audio recording included
- ✅ High frame rate and quality
- ✅ Automatic video encoding
- ✅ Ready to use/share

## 🔧 **Chrome DevTools Screencast (Advanced)**

Standard Chrome DevTools Protocol screencasting captures individual frames that you can process yourself.

### **✅ Setup Requirements**
- Any CDP endpoint (not necessarily Browserless)
- No special URL parameters needed
- Compatible with local Chrome instances

### **📡 How It Works**
Uses standard CDP commands:
- `Page.startScreencast` - Start frame capture
- `Page.stopScreencast` - Stop frame capture
- `Page.screencastFrame` events - Individual frame data

### **🚀 Usage Example**

```bash
# Any CDP endpoint works
node cli.js --cdp-endpoint="http://localhost:9222"
```

```javascript
// Start screencast recording
await client.callTool({
  name: 'browser_video_start',
  arguments: {
    filename: 'screencast-frames',
    width: 1280,
    height: 720,
    useScreencast: true,
    format: 'jpeg',
    quality: 80
  }
});

// Perform browser actions
await client.callTool({
  name: 'browser_navigate',
  arguments: { url: 'https://example.com' }
});

// Stop and get frame data
const result = await client.callTool({
  name: 'browser_video_stop',
  arguments: { 
    returnVideo: true 
  }
});

// Individual frames saved to directory + sample frame returned
```

### **📋 What You Get**
- ✅ Individual JPEG/PNG frames
- ✅ Frame metadata (timestamps, indices)
- ✅ `frames.json` index file
- ✅ Sample frame returned as base64 image
- ⚠️ **No audio** (frames only)
- ⚠️ **Manual video compilation required**

## 🎛️ **API Parameters**

### **Common Parameters**
```typescript
{
  filename?: string;        // Default: 'video-{timestamp}.webm'
  width?: number;          // Default: 1280
  height?: number;         // Default: 720
}
```

### **Screencast-Specific Parameters**
```typescript
{
  useScreencast?: boolean; // Enable screencast mode (default: false)
  format?: 'jpeg' | 'png'; // Frame format (default: 'jpeg')
  quality?: number;        // 1-100 quality (default: 80)
}
```

## 🎯 **Decision Guide: Which Method to Use?**

### **Use Browserless Custom Recording When:**
- ✅ You have a Browserless subscription
- ✅ You want complete video files immediately
- ✅ You need audio recording
- ✅ You want high-quality, ready-to-use videos
- ✅ You prefer minimal setup

### **Use Chrome DevTools Screencast When:**
- ✅ You're using a regular CDP endpoint (not Browserless)
- ✅ You need fine control over frame capture
- ✅ You want to process frames individually
- ✅ You're building custom video processing workflows
- ✅ Audio is not required

## 🔄 **Complete Workflow Examples**

### **Browserless Workflow**

```javascript
// 1. Connect with recording enabled
const client = await connectToBrowser({
  endpoint: 'wss://chrome.browserless.io?token=TOKEN&record=true'
});

// 2. Start recording
await client.callTool({
  name: 'browser_video_start',
  arguments: { filename: 'demo.webm' }
});

// 3. Automate browser
await client.callTool({
  name: 'browser_navigate',
  arguments: { url: 'https://example.com' }
});

await client.callTool({
  name: 'browser_click',
  arguments: { selector: 'button#submit' }
});

// 4. Stop and get video
const video = await client.callTool({
  name: 'browser_video_stop',
  arguments: { returnVideo: true }
});

// 5. Save complete WebM file
if (video.content[1]?.type === 'resource') {
  const videoData = video.content[1].data;
  fs.writeFileSync('demo.webm', Buffer.from(videoData, 'base64'));
}
```

### **Screencast Workflow**

```javascript
// 1. Connect to any CDP endpoint
const client = await connectToBrowser({
  endpoint: 'http://localhost:9222'
});

// 2. Start screencast
await client.callTool({
  name: 'browser_video_start',
  arguments: { 
    filename: 'frames',
    useScreencast: true,
    format: 'jpeg',
    quality: 90
  }
});

// 3. Automate browser
await client.callTool({
  name: 'browser_navigate',
  arguments: { url: 'https://example.com' }
});

// 4. Stop and get frames
const result = await client.callTool({
  name: 'browser_video_stop',
  arguments: { returnVideo: true }
});

// 5. Process individual frames
// Frames are saved to test-results/screencast-{timestamp}/
// Use frames.json to get frame metadata
// Sample frame returned as base64 image

// 6. Optional: Compile frames into video using ffmpeg
// ffmpeg -framerate 10 -i frame-%06d.jpeg -c:v libx264 output.mp4
```

## 🚨 **Error Handling & Troubleshooting**

### **Browserless Issues**

#### **"Recording not enabled"**
```
Browserless endpoint detected but recording not enabled. 
Add 'record=true' to your CDP URL
```
**Solution:** Add `record=true` to your connection URL

#### **"Browserless recording failed"**
**Check:**
1. Valid Browserless token
2. Subscription supports video recording
3. Network connectivity to Browserless
4. Token has recording permissions

### **Screencast Issues**

#### **"No frames were captured"**
**Check:**
1. CDP session is properly established
2. Page has content to capture
3. Browser window is visible (not minimized)
4. Sufficient recording duration

#### **"Screencast recording failed"**
**Try:**
1. Use standard video recording instead
2. Check CDP endpoint accessibility
3. Verify browser supports screencast API

## 🎬 **Video Compilation (Screencast Mode)**

When using screencast mode, you get individual frames. To create a video:

### **Using FFmpeg**
```bash
# Navigate to frames directory
cd test-results/screencast-1234567890/

# Create video from frames (adjust framerate as needed)
ffmpeg -framerate 10 -i frame-%06d.jpeg -c:v libx264 -pix_fmt yuv420p output.mp4

# With higher quality
ffmpeg -framerate 15 -i frame-%06d.jpeg -c:v libx264 -crf 18 -pix_fmt yuv420p output.mp4
```

### **Frame Index File**
Each screencast generates a `frames.json` file:
```json
{
  "frameCount": 42,
  "duration": 5000,
  "format": "jpeg",
  "frames": [
    {
      "filename": "frame-000000.jpeg",
      "timestamp": 1703123456789,
      "index": 0
    }
  ]
}
```

## 📊 **Performance Comparison**

| Aspect | Browserless Recording | Chrome Screencast |
|--------|----------------------|-------------------|
| **Setup Complexity** | ⭐ Simple | ⭐⭐⭐ Advanced |
| **Output Quality** | ⭐⭐⭐⭐⭐ Excellent | ⭐⭐⭐⭐ Good |
| **Audio Support** | ✅ Yes | ❌ No |
| **Immediate Playback** | ✅ Yes | ❌ No (compilation needed) |
| **File Size** | ⭐⭐⭐ Optimized | ⭐⭐ Large (individual frames) |
| **Processing Required** | ✅ None | ⭐⭐⭐ Manual compilation |
| **Endpoint Compatibility** | 🎯 Browserless only | 🌐 Any CDP endpoint |

## 🎉 **Summary**

- **For most use cases**: Use **Browserless Custom Recording** for complete, ready-to-use video files
- **For advanced control**: Use **Chrome DevTools Screencast** when you need individual frame processing
- **Both methods** work seamlessly with the same API - just set `useScreencast: true` for screencast mode
- **Error messages** provide clear guidance for setup and troubleshooting

The updated implementation gives you the flexibility to choose the approach that best fits your needs! 🚀