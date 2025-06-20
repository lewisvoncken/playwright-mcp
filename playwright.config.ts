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

import { defineConfig } from '@playwright/test';

import type { TestOptions } from './tests/fixtures.js';

export default defineConfig<TestOptions>({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  // Global video configuration
  use: {
    // Record video for failed tests only by default
    video: 'retain-on-failure',
    // Alternatively, you can use:
    // video: 'on' to record all tests
    // video: 'off' to disable video recording
    // video: 'retain-on-failure' to keep videos only for failed tests
    
    // Optional: Configure video size and quality
    // videoSize: { width: 1280, height: 720 },
    // videoQuality: 'low', // 'low', 'high' - affects file size and quality
  },
  projects: [
    { 
      name: 'chrome',
      use: {
        // Project-specific video settings can override global settings
        video: {
          mode: 'retain-on-failure',
          size: { width: 1280, height: 720 }
        }
      }
    },
    { 
      name: 'msedge', 
      use: { 
        mcpBrowser: 'msedge',
        video: {
          mode: 'retain-on-failure',
          size: { width: 1280, height: 720 }
        }
      } 
    },
    { 
      name: 'chromium', 
      use: { 
        mcpBrowser: 'chromium',
        video: {
          mode: 'retain-on-failure',
          size: { width: 1280, height: 720 }
        }
      } 
    },
    ...process.env.MCP_IN_DOCKER ? [{
      name: 'chromium-docker',
      grep: /browser_navigate|browser_click/,
      use: {
        mcpBrowser: 'chromium',
        mcpMode: 'docker' as const,
        video: {
          mode: 'retain-on-failure',
          size: { width: 1280, height: 720 }
        }
      }
    }] : [],
    { 
      name: 'firefox', 
      use: { 
        mcpBrowser: 'firefox',
        video: {
          mode: 'retain-on-failure',
          size: { width: 1280, height: 720 }
        }
      } 
    },
    { 
      name: 'webkit', 
      use: { 
        mcpBrowser: 'webkit',
        video: {
          mode: 'retain-on-failure',
          size: { width: 1280, height: 720 }
        }
      } 
    },
    { 
      name: 'chromium-extension', 
      use: { 
        mcpBrowser: 'chromium', 
        mcpMode: 'extension',
        video: {
          mode: 'retain-on-failure',
          size: { width: 1280, height: 720 }
        }
      } 
    },
  ],
});
