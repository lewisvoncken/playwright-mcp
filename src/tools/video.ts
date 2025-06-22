/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import fs from 'fs';
import path from 'path';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { z } from 'zod';
import { defineTool } from './tool.js';
import { outputFile } from '../config.js';

import type * as playwright from 'playwright';

const videoStartSchema = z.object({
  filename: z.string().optional().describe('File name to save the video to. Defaults to `video-{timestamp}.webm` if not specified.'),
  width: z.number().optional().describe('Video width in pixels. Default is 1280.'),
  height: z.number().optional().describe('Video height in pixels. Default is 720.'),
});

const videoStopSchema = z.object({
  returnVideo: z.boolean().optional().describe('Whether to return the video content in the response. Default is true.'),
});

const videoStart = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_video_start',
    title: 'Start video recording',
    description: 'Start recording a video of browser interactions. The video will capture all page activities until stopped.',
    inputSchema: videoStartSchema,
    type: 'readOnly',
  },

  handle: async (context, params) => {
    const tab = context.currentTabOrDie();
    const width = params.width || 1280;
    const height = params.height || 720;
    const filename = params.filename ?? `video-${Date.now()}.webm`;
    
    const code = [
      `// Start video recording and save to ${filename}`,
      `await page.video?.path(); // Get video path if recording is already active`,
    ];

    const action = async () => {
      // Check if video recording is already active
      const existingVideoInfo = (context as any)._videoRecording;
      if (existingVideoInfo) {
        return {
          content: [{
            type: 'text' as 'text',
            text: `Video recording is already active. Stop the current recording first.`,
          }]
        };
      }

      const browser = tab.page.context().browser();
      if (!browser) {
        throw new Error('Browser not available for video recording');
      }

      // Check browser configuration first
      const browserConfig = (context as any).config?.browser;
      const isCdpEndpoint = !!browserConfig?.cdpEndpoint;
      
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

          return {
            content: [{
              type: 'text' as 'text',
              text: `Started Browserless video recording. Video will be saved as ${filename}`,
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text' as 'text',
              text: `Browserless recording failed: ${(error as Error).message}. Make sure to add 'record=true' to your CDP connection URL.`,
            }]
          };
        }
      }

      // For non-CDP endpoints, check if video recording is available on current context
      const currentContext = tab.page.context();
      const contextOptions = (context as any).config?.browser?.contextOptions;
      
      // Simple check: if --video-mode was enabled, video recording should be available
      if (contextOptions?.recordVideo) {
        // Video recording is enabled - use the existing context
        (context as any)._videoRecording = {
          page: tab.page,
          context: currentContext,
          videoDir: null, // Will be determined when we stop recording
          requestedFilename: filename,
          startTime: Date.now(),
          usingExistingContext: true,
          hasVideoRecording: true,
        };

        return {
          content: [{
            type: 'text' as 'text',
            text: `Video recording started using existing context. Video will be saved as ${filename}`,
          }]
        };
      }

      // Video recording was not enabled at startup
      return {
        content: [{
          type: 'text' as 'text',
          text: `Video recording not available. Please restart with --video-mode flag:\n\nExample: node cli.js --video-mode=on\n\nThis enables video recording on the browser context from startup.`,
        }]
      };
    };

    return {
      code,
      action,
      captureSnapshot: false,
      waitForNetwork: false,
    };
  },
});

const videoStop = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_video_stop',
    title: 'Stop video recording',
    description: 'Stop the current video recording and optionally return the video content.',
    inputSchema: videoStopSchema,
    type: 'readOnly',
  },

  handle: async (context, params) => {
    const videoInfo = (context as any)._videoRecording;
    const returnVideo = params.returnVideo !== false; // Default to true
    
    const code = [
      `// Stop video recording and ${returnVideo ? 'return video content' : 'save to file'}`,
    ];

    const action = async () => {
      if (!videoInfo) {
        return {
          content: [{
            type: 'text' as 'text',
            text: `No active video recording found. Start recording first with browser_video_start.`,
          }]
        };
      }

      const { page, context: videoContext, videoDir, requestedFilename, startTime, usingExistingContext, usingBrowserless, cdpSession } = videoInfo;
      const duration = Date.now() - startTime;

      try {
        let actualVideoPath: string | undefined;
        
        if (usingBrowserless && cdpSession) {
          // Handle Browserless recording
          const response = await (cdpSession as any).send('Browserless.stopRecording');
          const videoBuffer = Buffer.from(response.value, 'binary');
          
          // Create a temporary directory for the video
          const tempVideoDir = path.join(
            process.cwd(),
            'test-results',
            `videos-${Date.now()}`
          );
          await fs.promises.mkdir(tempVideoDir, { recursive: true });
          actualVideoPath = path.join(tempVideoDir, requestedFilename);
          
          // Save the video file
          await fs.promises.writeFile(actualVideoPath, videoBuffer);
          
          // Clean up CDP session
          await cdpSession.detach();
        } else {
          // Handle standard Playwright recording
          // NOTE: We never close contexts anymore since we only use existing contexts
          // This prevents the "browser started twice" issue
          
          try {
            // Get the video path from the page
            const videoObj = page.video();
            if (videoObj) {
              actualVideoPath = await videoObj.path();
            }
          } catch (e) {
            // Video might not be available yet
          }
          
          // Wait for video file to be finalized
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Try to get video path again if we didn't get it before
          if (!actualVideoPath) {
            try {
              const videoObj = page.video();
              if (videoObj) {
                actualVideoPath = await videoObj.path();
              }
            } catch (e) {
              // Still no video available
            }
          }
          
          // If we still don't have a video path, check if file exists at the path we got
          if (actualVideoPath && !fs.existsSync(actualVideoPath)) {
            // Wait a bit more for the file to be written
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
        
        // Clean up the reference
        delete (context as any)._videoRecording;

        // Store the actual video path for later retrieval
        if (actualVideoPath && fs.existsSync(actualVideoPath)) {
          // Store the video info globally for retrieval
          if (!(context as any)._storedVideos) {
            (context as any)._storedVideos = new Map();
          }
          (context as any)._storedVideos.set(requestedFilename, actualVideoPath);
        }

        const content: any[] = [{
          type: 'text' as 'text',
          text: `Video recording stopped. Duration: ${Math.round(duration / 1000)}s. ${actualVideoPath ? `Saved to ${actualVideoPath}` : 'Video file not found'}`,
        }];

        // Return video content if requested and file exists
        if (returnVideo && actualVideoPath && fs.existsSync(actualVideoPath)) {
          // Check if client supports video content
          const includeVideoContent = context.clientSupportsVideos?.() ?? true;
          
          if (includeVideoContent) {
            try {
              const videoBuffer = await fs.promises.readFile(actualVideoPath);
              const videoBase64 = videoBuffer.toString('base64');
              
              content.push({
                type: 'resource' as any,
                data: videoBase64,
                mimeType: 'video/webm',
                uri: `file://${actualVideoPath}`,
              });
            } catch (error) {
              content.push({
                type: 'text' as 'text',
                text: `Video file saved to ${actualVideoPath}, but couldn't encode for return: ${(error as Error).message}`,
              });
            }
          } else {
            content.push({
              type: 'text' as 'text',
              text: `Video file saved to ${actualVideoPath}. Client doesn't support video content in responses.`,
            });
          }
        }

        return { content };
      } catch (error) {
        return {
          content: [{
            type: 'text' as 'text',
            text: `Error stopping video recording: ${(error as Error).message}`,
          }]
        };
      }
    };

    return {
      code,
      action,
      captureSnapshot: false,
      waitForNetwork: false,
    };
  },
});

const videoStatus = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_video_status',
    title: 'Get video recording status',
    description: 'Check if video recording is currently active and get recording details.',
    inputSchema: z.object({}),
    type: 'readOnly',
  },

  handle: async (context) => {
    const videoInfo = (context as any)._videoRecording;
    
    const code = [
      `// Check video recording status`,
    ];

    const action = async () => {
      if (!videoInfo) {
        return {
          content: [{
            type: 'text' as 'text',
            text: `No active video recording.`,
          }]
        };
      }

      const { requestedFilename, startTime, videoDir } = videoInfo;
      const duration = Date.now() - startTime;

      return {
        content: [{
          type: 'text' as 'text',
          text: `Video recording active. Duration: ${Math.round(duration / 1000)}s. Output: ${requestedFilename} in ${videoDir}`,
        }]
      };
    };

    return {
      code,
      action,
      captureSnapshot: false,
      waitForNetwork: false,
    };
  },
});

const videoGet = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_video_get',
    title: 'Get recorded video',
    description: 'Retrieve a previously recorded video file and return its content.',
    inputSchema: z.object({
      filename: z.string().describe('Name of the video file to retrieve.'),
      returnContent: z.boolean().optional().describe('Whether to return video content in response. Default is true.'),
    }),
    type: 'readOnly',
  },

  handle: async (context, params) => {
    const { filename, returnContent = true } = params;
    
    const code = [
      `// Retrieve video file ${filename}`,
    ];

    const action = async () => {
      // First check if we have the video path stored from a previous recording
      const storedVideos = (context as any)._storedVideos;
      let filePath: string | undefined;
      
      if (storedVideos && storedVideos.has(filename)) {
        filePath = storedVideos.get(filename);
      }
      
      // If not found in stored videos, try the fallback approach
      if (!filePath || !fs.existsSync(filePath)) {
        filePath = await outputFile(context.config, filename);
        
        // If still not found, search in video directories
        if (!fs.existsSync(filePath)) {
          const testResultsDir = path.join(process.cwd(), 'test-results');
          if (fs.existsSync(testResultsDir)) {
            const entries = await fs.promises.readdir(testResultsDir, { withFileTypes: true });
            const videoDirs = entries
              .filter(entry => entry.isDirectory() && entry.name.startsWith('videos-'))
              .sort((a, b) => b.name.localeCompare(a.name)); // Sort by newest first
            
            for (const videoDir of videoDirs) {
              const searchPath = path.join(testResultsDir, videoDir.name, filename);
              if (fs.existsSync(searchPath)) {
                filePath = searchPath;
                break;
              }
              
              // Also check for any .webm files in the directory if exact filename not found
              try {
                const files = await fs.promises.readdir(path.join(testResultsDir, videoDir.name));
                const webmFiles = files.filter(f => f.endsWith('.webm'));
                if (webmFiles.length > 0 && filename.endsWith('.webm')) {
                  const possibleMatch = path.join(testResultsDir, videoDir.name, webmFiles[0]);
                  if (fs.existsSync(possibleMatch)) {
                    filePath = possibleMatch;
                    break;
                  }
                }
              } catch (e) {
                // Continue searching
              }
            }
          }
        }
      }

      if (!filePath || !fs.existsSync(filePath)) {
        // Provide helpful debugging information
        const debugInfo = [];
        debugInfo.push(`Video file ${filename} not found.`);
        
        if (storedVideos) {
          const storedFiles = Array.from(storedVideos.keys());
          debugInfo.push(`Available stored videos: ${storedFiles.join(', ') || 'none'}`);
        }
        
        // List video directories
        const testResultsDir = path.join(process.cwd(), 'test-results');
        if (fs.existsSync(testResultsDir)) {
          try {
            const entries = await fs.promises.readdir(testResultsDir, { withFileTypes: true });
            const videoDirs = entries.filter(entry => entry.isDirectory() && entry.name.startsWith('videos-'));
            debugInfo.push(`Video directories found: ${videoDirs.map(d => d.name).join(', ') || 'none'}`);
          } catch (e) {
            debugInfo.push(`Error reading test-results directory: ${(e as Error).message}`);
          }
        }

        return {
          content: [{
            type: 'text' as 'text',
            text: debugInfo.join('\n'),
          }]
        };
      }

      const stats = await fs.promises.stat(filePath);
      const content: any[] = [{
        type: 'text' as 'text',
        text: `Video file found: ${filename} at ${filePath} (${Math.round(stats.size / 1024)} KB)`,
      }];

      if (returnContent) {
        const includeVideoContent = context.clientSupportsVideos?.() ?? true;
        
        if (includeVideoContent) {
          try {
            const videoBuffer = await fs.promises.readFile(filePath);
            const videoBase64 = videoBuffer.toString('base64');
            
            content.push({
              type: 'resource' as any,
              data: videoBase64,
              mimeType: 'video/webm',
              uri: `file://${filePath}`,
            });
          } catch (error) {
            content.push({
              type: 'text' as 'text',
              text: `Error reading video file: ${(error as Error).message}`,
            });
          }
        } else {
          content.push({
            type: 'text' as 'text',
            text: `Video file available at: ${filePath}. Client doesn't support video content in responses.`,
          });
        }
      }

      return { content };
    };

    return {
      code,
      action,
      captureSnapshot: false,
      waitForNetwork: false,
    };
  },
});

export default [
  videoStart,
  videoStop,
  videoStatus,
  videoGet,
];