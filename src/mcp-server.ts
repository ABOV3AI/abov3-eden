/**
 * ABOV3 Eden - MCP Protocol Handler
 * Implements JSON-RPC 2.0 for Model Context Protocol
 */

import fs from 'fs';
import path from 'path';
import { logger } from './utils/logger.js';
import { toolRegistry, type ToolContext } from './tools/index.js';
import { createSecurityContext, type SecurityConfig } from './utils/security.js';

/**
 * MCP Server Information
 */
const SERVER_INFO = {
  name: 'abov3-eden',
  version: '1.0.0',
};

/**
 * MCP Protocol Version
 */
const PROTOCOL_VERSION = '2024-11-05';

/**
 * JSON-RPC 2.0 Request
 */
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * JSON-RPC 2.0 Response
 */
interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * JSON-RPC Error Codes
 */
const ErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
} as const;

/**
 * Create error response
 */
function errorResponse(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message, data },
  };
}

/**
 * Create success response
 */
function successResponse(id: string | number | null, result: unknown): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}

/**
 * MCP Server Handler
 */
export class MCPServer {
  private securityConfig: SecurityConfig;
  private workspaceRoots: string[];

  constructor(securityConfig: SecurityConfig, workspaceRoots: string[]) {
    this.securityConfig = securityConfig;
    this.workspaceRoots = workspaceRoots;
  }

  /**
   * Handle incoming JSON-RPC request
   */
  async handleRequest(body: unknown): Promise<JsonRpcResponse> {
    // Validate JSON-RPC format
    if (!body || typeof body !== 'object') {
      return errorResponse(null, ErrorCode.ParseError, 'Invalid JSON');
    }

    const request = body as JsonRpcRequest;

    // Validate required fields
    if (request.jsonrpc !== '2.0') {
      return errorResponse(
        request.id ?? null,
        ErrorCode.InvalidRequest,
        'Invalid JSON-RPC version'
      );
    }

    if (!request.method || typeof request.method !== 'string') {
      return errorResponse(
        request.id ?? null,
        ErrorCode.InvalidRequest,
        'Missing or invalid method'
      );
    }

    const requestId = request.id ?? null;
    logger.mcp('in', request.method, requestId ?? undefined);

    try {
      const result = await this.dispatchMethod(request.method, request.params || {});
      const response = successResponse(requestId, result);
      logger.mcp('out', request.method, requestId ?? undefined);
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`MCP method error: ${request.method}`, message);
      return errorResponse(
        requestId,
        ErrorCode.InternalError,
        message
      );
    }
  }

  /**
   * Dispatch method to appropriate handler
   */
  private async dispatchMethod(
    method: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    switch (method) {
      case 'initialize':
        return this.handleInitialize(params);

      case 'initialized':
        return this.handleInitialized();

      case 'capabilities':
        return this.handleCapabilities();

      case 'tools/list':
        return this.handleToolsList();

      case 'tools/call':
        return this.handleToolsCall(params);

      case 'ping':
        return this.handlePing();

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown method: ${method}`);
    }
  }

  /**
   * Handle initialize request
   */
  private handleInitialize(params: Record<string, unknown>): unknown {
    const clientInfo = params.clientInfo as { name?: string; version?: string } | undefined;

    logger.info(
      `MCP client connected: ${clientInfo?.name || 'unknown'} v${clientInfo?.version || 'unknown'}`
    );

    return {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {
        tools: {},
      },
      serverInfo: SERVER_INFO,
    };
  }

  /**
   * Handle initialized notification
   */
  private handleInitialized(): unknown {
    logger.info('MCP session initialized');
    return {};
  }

  /**
   * Handle capabilities request (used for connectivity testing)
   */
  private handleCapabilities(): unknown {
    logger.info('Capabilities requested');
    return {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {
        tools: {
          listChanged: false,
        },
      },
      serverInfo: SERVER_INFO,
    };
  }

  /**
   * Handle tools/list request
   */
  private handleToolsList(): unknown {
    const tools = toolRegistry.getDefinitions();

    logger.debug(`Returning ${tools.length} tools`);

    return {
      tools: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    };
  }

  /**
   * Handle tools/call request
   */
  private async handleToolsCall(params: Record<string, unknown>): Promise<unknown> {
    const name = params.name as string;
    const args = (params.arguments || {}) as Record<string, unknown>;
    let workspacePath = params.workspacePath as string | undefined;

    if (!name) {
      throw new McpError(ErrorCode.InvalidParams, 'Missing tool name');
    }

    if (!toolRegistry.has(name)) {
      throw new McpError(ErrorCode.InvalidParams, `Unknown tool: ${name}`);
    }

    // Resolve workspace path
    // If it's just a folder name (no path separators), search for it in workspace roots
    if (workspacePath && !workspacePath.includes('/') && !workspacePath.includes('\\')) {
      const folderName = workspacePath;
      logger.debug(`Searching for folder "${folderName}" in workspace roots...`);

      // Search in configured workspace roots
      for (const root of this.workspaceRoots) {
        const candidatePath = path.join(root, folderName);
        if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isDirectory()) {
          workspacePath = candidatePath;
          logger.info(`Found workspace folder: ${workspacePath}`);
          break;
        }
      }

      // If not found in roots, search in common locations
      if (workspacePath === folderName) {
        const commonLocations = [
          process.cwd(),
          path.join(process.env.HOME || process.env.USERPROFILE || '', 'Documents'),
          path.join(process.env.HOME || process.env.USERPROFILE || '', 'Projects'),
          path.join(process.env.HOME || process.env.USERPROFILE || ''),
        ];

        for (const location of commonLocations) {
          const candidatePath = path.join(location, folderName);
          if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isDirectory()) {
            workspacePath = candidatePath;
            logger.info(`Found workspace folder in common location: ${workspacePath}`);
            break;
          }
        }
      }

      // If still just a folder name, we couldn't find it
      if (workspacePath === folderName) {
        logger.warn(`Could not find folder "${folderName}" in workspace roots or common locations. Using current directory.`);
        workspacePath = undefined;
      }
    }

    // Create execution context
    // If Exodus provides a workspace path, use it as the primary working directory
    // Otherwise fall back to workspace roots from config
    const context: ToolContext = {
      security: createSecurityContext(this.securityConfig),
      workspaceRoots: workspacePath ? [workspacePath, ...this.workspaceRoots] : this.workspaceRoots,
      workingDirectory: workspacePath || process.cwd(),
    };

    if (workspacePath) {
      logger.debug(`Using workspace path: ${workspacePath}`);
    }

    const result = await toolRegistry.execute(name, args, context);

    return result;
  }

  /**
   * Handle ping request
   */
  private handlePing(): unknown {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}

/**
 * Custom MCP Error
 */
class McpError extends Error {
  code: number;

  constructor(code: number, message: string) {
    super(message);
    this.code = code;
    this.name = 'McpError';
  }
}
