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

import { test, expect } from './fixtures.js';

test.describe('CDP Video Recording', () => {
  test('should detect Browserless endpoint correctly', async ({ startClient, server }) => {
    // Test with a mock Browserless endpoint (without actual connection)
    const { client } = await startClient({ 
      args: [`--cdp-endpoint=wss://chrome.browserless.io?token=test&record=true`] 
    });

    // This should fail gracefully with proper error message about connection
    const result = await client.callTool({
      name: 'browser_video_start',
      arguments: { filename: 'test-video.webm' }
    });

    // Should get a connection error, not a generic error
    expect(result.content?.[0]?.text).toContain('recording');
  });

  test('should provide clear guidance for Browserless without recording', async ({ startClient, server }) => {
    // Test with mock Browserless endpoint without record=true
    const { client } = await startClient({ 
      args: [`--cdp-endpoint=wss://chrome.browserless.io?token=test`] 
    });

    const result = await client.callTool({
      name: 'browser_video_start',
      arguments: { filename: 'test-video.webm' }
    });

    // Should get specific guidance about adding record=true
    expect(result.content?.[0]?.text).toContain('record=true');
    expect(result.content?.[0]?.text).toContain('Browserless endpoint detected');
  });

  test('should handle regular CDP endpoint correctly', async ({ cdpServer, startClient, server }) => {
    await cdpServer.start();
    
    // Test with regular CDP endpoint without video mode
    const { client } = await startClient({ 
      args: [`--cdp-endpoint=${cdpServer.endpoint}`] 
    });

    const result = await client.callTool({
      name: 'browser_video_start',
      arguments: { filename: 'test-video.webm' }
    });

    // Should get guidance about using --video-mode
    expect(result.content?.[0]?.text).toContain('--video-mode');
    expect(result.content?.[0]?.text).toContain('Regular CDP endpoint detected');
  });

  test('should work with regular CDP endpoint when video mode enabled', async ({ cdpServer, startClient, server }) => {
    await cdpServer.start();
    
    // Test with regular CDP endpoint WITH video mode
    const { client } = await startClient({ 
      args: [`--cdp-endpoint=${cdpServer.endpoint}`, `--video-mode=on`] 
    });

    // Navigate to ensure we have a page
    await client.callTool({
      name: 'browser_navigate',
      arguments: { url: server.HELLO_WORLD }
    });

    const startResult = await client.callTool({
      name: 'browser_video_start',
      arguments: { filename: 'test-video.webm' }
    });

    // Should successfully start recording
    expect(startResult.content?.[0]?.text).toContain('Video recording started');
    expect(startResult.content?.[0]?.text).toContain('CDP context');

    const stopResult = await client.callTool({
      name: 'browser_video_stop',
      arguments: { returnVideo: false }
    });

    // Should successfully stop recording
    expect(stopResult.content?.[0]?.text).toContain('Video recording stopped');
  });

  test('should prevent double recording', async ({ cdpServer, startClient, server }) => {
    await cdpServer.start();
    
    const { client } = await startClient({ 
      args: [`--cdp-endpoint=${cdpServer.endpoint}`, `--video-mode=on`] 
    });

    // Navigate to ensure we have a page
    await client.callTool({
      name: 'browser_navigate',
      arguments: { url: server.HELLO_WORLD }
    });

    // Start first recording
    await client.callTool({
      name: 'browser_video_start',
      arguments: { filename: 'test-video1.webm' }
    });

    // Try to start second recording
    const result = await client.callTool({
      name: 'browser_video_start',
      arguments: { filename: 'test-video2.webm' }
    });

    // Should prevent double recording
    expect(result.content?.[0]?.text).toContain('already active');
  });
});