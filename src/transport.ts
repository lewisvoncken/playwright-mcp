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

import http from 'node:http';
import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'fs';
import path from 'path';

import debug from 'debug';
import mime from 'mime';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import type { AddressInfo } from 'node:net';
import type { Server } from './server.js';

export async function startStdioTransport(server: Server) {
  await server.createConnection(new StdioServerTransport());
}

const testDebug = debug('pw:mcp:test');

async function handleSSE(server: Server, req: http.IncomingMessage, res: http.ServerResponse, url: URL, sessions: Map<string, SSEServerTransport>) {
  if (req.method === 'POST') {
    const sessionId = url.searchParams.get('sessionId');
    if (!sessionId) {
      res.statusCode = 400;
      return res.end('Missing sessionId');
    }

    const transport = sessions.get(sessionId);
    if (!transport) {
      res.statusCode = 404;
      return res.end('Session not found');
    }

    return await transport.handlePostMessage(req, res);
  } else if (req.method === 'GET') {
    const transport = new SSEServerTransport('/sse', res);
    sessions.set(transport.sessionId, transport);
    testDebug(`create SSE session: ${transport.sessionId}`);
    const connection = await server.createConnection(transport);
    res.on('close', () => {
      testDebug(`delete SSE session: ${transport.sessionId}`);
      sessions.delete(transport.sessionId);
      // eslint-disable-next-line no-console
      void connection.close().catch(e => console.error(e));
    });
    return;
  }

  res.statusCode = 405;
  res.end('Method not allowed');
}

async function handleStreamable(server: Server, req: http.IncomingMessage, res: http.ServerResponse, sessions: Map<string, StreamableHTTPServerTransport>) {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (sessionId) {
    const transport = sessions.get(sessionId);
    if (!transport) {
      res.statusCode = 404;
      res.end('Session not found');
      return;
    }
    return await transport.handleRequest(req, res);
  }

  if (req.method === 'POST') {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: sessionId => {
        sessions.set(sessionId, transport);
      }
    });
    transport.onclose = () => {
      if (transport.sessionId)
        sessions.delete(transport.sessionId);
    };
    await server.createConnection(transport);
    await transport.handleRequest(req, res);
    return;
  }

  res.statusCode = 400;
  res.end('Invalid request');
}

export async function startHttpServer(config: { host?: string, port?: number }): Promise<http.Server> {
  const { host, port } = config;
  const httpServer = http.createServer();
  await new Promise<void>((resolve, reject) => {
    httpServer.on('error', reject);
    httpServer.listen(port, host, () => {
      resolve();
      httpServer.removeListener('error', reject);
    });
  });
  return httpServer;
}

function serveVideoFile(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  try {
    // Extract video filename from URL path like /videos/my-video.webm
    const videoPath = url.pathname.replace('/videos/', '');
    if (!videoPath || videoPath.includes('..')) {
      res.statusCode = 400;
      res.end('Invalid video path');
      return;
    }

    // Look for the video file in test-results directories
    const testResultsDir = path.join(process.cwd(), 'test-results');
    let videoFilePath: string | undefined;

    if (fs.existsSync(testResultsDir)) {
      const entries = fs.readdirSync(testResultsDir, { withFileTypes: true });
      const videoDirs = entries
        .filter((entry: fs.Dirent) => entry.isDirectory() && entry.name.startsWith('videos-'))
        .sort((a: fs.Dirent, b: fs.Dirent) => b.name.localeCompare(a.name)); // Sort by newest first

      for (const videoDir of videoDirs) {
        const searchPath = path.join(testResultsDir, videoDir.name, videoPath);
        if (fs.existsSync(searchPath)) {
          videoFilePath = searchPath;
          break;
        }
      }
    }

    if (!videoFilePath || !fs.existsSync(videoFilePath)) {
      res.statusCode = 404;
      res.end('Video file not found');
      return;
    }

    // Serve the video file with proper headers
    const stat = fs.statSync(videoFilePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    // Set content type based on file extension
    const ext = path.extname(videoFilePath).toLowerCase();
    const contentType = ext === '.webm' ? 'video/webm' : 
                       ext === '.mp4' ? 'video/mp4' : 
                       (mime as any).getType?.(videoFilePath) || 'application/octet-stream';

    if (range) {
      // Handle range requests for video streaming
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      
      if (start >= fileSize || end >= fileSize) {
        res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
        res.end();
        return;
      }

      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(videoFilePath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      });

      file.pipe(res);
    } else {
      // Serve the entire file
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      });

      fs.createReadStream(videoFilePath).pipe(res);
    }
  } catch (error) {
    res.statusCode = 500;
    res.end('Internal server error');
  }
}

export function startHttpTransport(httpServer: http.Server, mcpServer: Server) {
  const sseSessions = new Map<string, SSEServerTransport>();
  const streamableSessions = new Map<string, StreamableHTTPServerTransport>();
  httpServer.on('request', async (req, res) => {
    const url = new URL(`http://localhost${req.url}`);
    
    // Handle video file requests
    if (url.pathname.startsWith('/videos/')) {
      serveVideoFile(req, res, url);
      return;
    }
    
    if (url.pathname.startsWith('/mcp'))
      await handleStreamable(mcpServer, req, res, streamableSessions);
    else
      await handleSSE(mcpServer, req, res, url, sseSessions);
  });
  const url = httpAddressToString(httpServer.address());
  
  // Store the server URL in the MCP server for video tools to access
  (mcpServer as any)._httpServerUrl = url;
  
  const message = [
    `Listening on ${url}`,
    'Put this in your client config:',
    JSON.stringify({
      'mcpServers': {
        'playwright': {
          'url': `${url}/sse`
        }
      }
    }, undefined, 2),
    'If your client supports streamable HTTP, you can use the /mcp endpoint instead.',
    '',
    `Video files will be served at: ${url}/videos/`,
  ].join('\n');
    // eslint-disable-next-line no-console
  console.error(message);
}

export function httpAddressToString(address: string | AddressInfo | null): string {
  assert(address, 'Could not bind server socket');
  if (typeof address === 'string')
    return address;
  const resolvedPort = address.port;
  let resolvedHost = address.family === 'IPv4' ? address.address : `[${address.address}]`;
  if (resolvedHost === '0.0.0.0' || resolvedHost === '[::]')
    resolvedHost = 'localhost';
  return `http://${resolvedHost}:${resolvedPort}`;
}
