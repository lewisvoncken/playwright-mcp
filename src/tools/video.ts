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
    const fileName = await outputFile(context.config, params.filename ?? `video-${new Date().toISOString()}.webm`);
    
    const code = [
      `// Start video recording and save to ${fileName}`,
      `await page.video?.path(); // Get video path if recording is already active`,
    ];

    const action = async () => {
      // Check if video recording is already active
      if (tab.page.video()) {
        return {
          content: [{
            type: 'text' as 'text',
            text: `Video recording is already active. Stop the current recording first.`,
          }]
        };
      }

      // Create a new context with video recording enabled
      const browser = tab.page.context().browser();
      if (!browser) {
        throw new Error('Browser not available for video recording');
      }

      // Create context options for video recording
      const contextOptions: playwright.BrowserContextOptions = {
        recordVideo: {
          dir: path.dirname(fileName),
          size: { width, height },
        },
      };

      const newContext = await browser.newContext(contextOptions);
      const newPage = await newContext.newPage();
      
      // Navigate to current URL if available
      if (tab.page.url() !== 'about:blank') {
        await newPage.goto(tab.page.url());
      }

      // Store video info for later retrieval
      (context as any)._videoRecording = {
        page: newPage,
        fileName,
        startTime: Date.now(),
      };

      return {
        content: [{
          type: 'text' as 'text',
          text: `Started video recording. Video will be saved to ${fileName}`,
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

      const { page, fileName, startTime } = videoInfo;
      const duration = Date.now() - startTime;

      try {
        // Close the context to finalize the video
        await page.context().close();
        
        // Clean up the reference
        delete (context as any)._videoRecording;

        // Wait a moment for video file to be written
        await new Promise(resolve => setTimeout(resolve, 1000));

        const content: any[] = [{
          type: 'text' as 'text',
          text: `Video recording stopped. Duration: ${Math.round(duration / 1000)}s. Saved to ${fileName}`,
        }];

        // Return video content if requested and file exists
        if (returnVideo && fs.existsSync(fileName)) {
          // Check if client supports video content
          const includeVideoContent = context.clientSupportsVideos?.() ?? true;
          
          if (includeVideoContent) {
            try {
              const videoBuffer = await fs.promises.readFile(fileName);
              const videoBase64 = videoBuffer.toString('base64');
              
              content.push({
                type: 'resource' as any, // Using 'resource' type for video content
                data: videoBase64,
                mimeType: 'video/webm',
                uri: `file://${fileName}`,
              });
            } catch (error) {
              content.push({
                type: 'text' as 'text',
                text: `Video file saved to ${fileName}, but couldn't encode for return: ${(error as Error).message}`,
              });
            }
          } else {
            content.push({
              type: 'text' as 'text',
              text: `Video file saved to ${fileName}. Client doesn't support video content in responses.`,
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

      const { fileName, startTime } = videoInfo;
      const duration = Date.now() - startTime;

      return {
        content: [{
          type: 'text' as 'text',
          text: `Video recording active. Duration: ${Math.round(duration / 1000)}s. Output: ${fileName}`,
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
    const filePath = await outputFile(context.config, filename);
    
    const code = [
      `// Retrieve video file ${filename}`,
    ];

    const action = async () => {
      if (!fs.existsSync(filePath)) {
        return {
          content: [{
            type: 'text' as 'text',
            text: `Video file ${filename} not found.`,
          }]
        };
      }

      const stats = await fs.promises.stat(filePath);
      const content: any[] = [{
        type: 'text' as 'text',
        text: `Video file found: ${filename} (${Math.round(stats.size / 1024)} KB)`,
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