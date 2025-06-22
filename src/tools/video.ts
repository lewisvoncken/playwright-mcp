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

      // Check if the current context already has video recording enabled
      const currentContext = tab.page.context();
      const existingVideoPath = await tab.page.video()?.path().catch(() => null);
      
      if (existingVideoPath) {
        // Video recording is already enabled on the current context (likely from config)
        // Store the existing recording info for consistency
        (context as any)._videoRecording = {
          page: tab.page,
          context: currentContext,
          videoDir: path.dirname(existingVideoPath),
          requestedFilename: filename,
          startTime: Date.now(),
          usingExistingContext: true,
        };

        return {
          content: [{
            type: 'text' as 'text',
            text: `Video recording started using existing context. Video will be saved as ${filename}`,
          }]
        };
      }

      // Check if we can enable video recording on a new context
      // For CDP endpoints, we should avoid creating new contexts unless isolated mode is enabled
      const browserConfig = (context as any).config?.browser;
      const isCdpEndpoint = !!browserConfig?.cdpEndpoint;
      const isIsolated = !!browserConfig?.isolated;

      if (isCdpEndpoint && !isIsolated) {
        // For non-isolated CDP connections, we can't create new contexts for video recording
        return {
          content: [{
            type: 'text' as 'text',
            text: `Video recording not available with CDP endpoint in non-isolated mode. Enable video recording at startup using --video-mode or use --isolated flag.`,
          }]
        };
      }

      // Create a unique video directory
      const videoDir = path.join(
        process.cwd(),
        'test-results',
        `videos-${Date.now()}`
      );

      // Create video directory
      await fs.promises.mkdir(videoDir, { recursive: true });

      // Create context options for video recording
      const contextOptions: playwright.BrowserContextOptions = {
        recordVideo: {
          dir: videoDir,
          size: { width, height },
        },
      };

      // Copy existing context options to maintain consistency
      const existingOptions = currentContext.pages()[0] ? {
        viewport: currentContext.pages()[0].viewportSize(),
        userAgent: await currentContext.pages()[0].evaluate(() => navigator.userAgent).catch(() => undefined),
      } : {};

      const newContext = await browser.newContext({
        ...existingOptions,
        ...contextOptions,
      });
      const newPage = await newContext.newPage();
      
      // Navigate to current URL if available
      if (tab.page.url() !== 'about:blank') {
        await newPage.goto(tab.page.url());
      }

      // Store video info for later retrieval
      (context as any)._videoRecording = {
        page: newPage,
        context: newContext,
        videoDir,
        requestedFilename: filename,
        startTime: Date.now(),
        usingExistingContext: false,
      };

      return {
        content: [{
          type: 'text' as 'text',
          text: `Started video recording in new context. Video will be saved in ${videoDir}`,
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

      const { page, context: videoContext, videoDir, requestedFilename, startTime, usingExistingContext } = videoInfo;
      const duration = Date.now() - startTime;

      try {
        // Get the video path before potentially closing the context
        const videoPath = await page.video()?.path();
        
        // Only close the context if we created it specifically for video recording
        if (!usingExistingContext) {
          await videoContext.close();
        }
        
        // Clean up the reference
        delete (context as any)._videoRecording;

        // Wait longer for video file to be written and finalized
        await new Promise(resolve => setTimeout(resolve, 3000));

        let actualVideoPath = videoPath;
        
        // If we don't have the video path from Playwright, look for files in the video directory
        if (!actualVideoPath || !fs.existsSync(actualVideoPath)) {
          const videoFiles = await fs.promises.readdir(videoDir).catch(() => []);
          const webmFiles = videoFiles.filter(f => f.endsWith('.webm'));
          if (webmFiles.length > 0) {
            actualVideoPath = path.join(videoDir, webmFiles[0]);
          }
        }

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