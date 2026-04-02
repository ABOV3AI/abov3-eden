/**
 * ABOV3 Eden - Tool Registry
 * Central registry for MCP tool definitions and execution
 */

import { logger } from '../utils/logger.js';
import type { SecurityContext } from '../utils/security.js';

/**
 * JSON Schema type for tool input validation
 */
export interface JSONSchema {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array';
  properties?: Record<string, JSONSchema & { description?: string; additionalProperties?: JSONSchema | boolean }>;
  required?: string[];
  items?: JSONSchema;
  description?: string;
  enum?: (string | number | boolean)[];
  default?: unknown;
  additionalProperties?: JSONSchema | boolean;
}

/**
 * Simplified Tool interface for easier tool definition
 * Used by new tool categories (documents, images, etc.)
 */
export interface Tool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  handler: (args: Record<string, any>) => Promise<any>;
}

/**
 * MCP Tool Definition
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  execute: (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
}

/**
 * Tool execution context
 */
export interface ToolContext {
  security: SecurityContext;
  workspaceRoots: string[]; // List of directories to search for project folders
  workingDirectory: string; // Current working directory for tool execution
}

/**
 * Tool execution result
 */
export interface ToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

/**
 * Create a successful text result
 */
export function textResult(text: string): ToolResult {
  return {
    content: [{ type: 'text', text }],
  };
}

/**
 * Create an error result
 */
export function errorResult(message: string): ToolResult {
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  };
}

/**
 * Create a JSON result
 */
export function jsonResult(data: unknown): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Create an image result (for vision LLM analysis)
 * @param base64Data - Base64 encoded image data (without data URL prefix)
 * @param mimeType - MIME type of the image (e.g., 'image/png', 'image/jpeg')
 * @param caption - Optional text caption to include with the image
 */
export function imageResult(base64Data: string, mimeType: string, caption?: string): ToolResult {
  const content: ToolResult['content'] = [];
  if (caption) {
    content.push({ type: 'text', text: caption });
  }
  content.push({ type: 'image', data: base64Data, mimeType });
  return { content };
}

/**
 * Create a mixed result with multiple images and text
 * Useful for video frame analysis where multiple images are returned
 * @param items - Array of text or image items
 */
export function mixedResult(items: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>): ToolResult {
  return {
    content: items.map(item => {
      if (item.type === 'text') {
        return { type: 'text' as const, text: item.text };
      } else {
        return { type: 'image' as const, data: item.data, mimeType: item.mimeType };
      }
    }),
  };
}

/**
 * Convert simplified Tool array to MCPTool array
 * This bridges the simpler Tool interface to the full MCPTool interface
 */
export function createMCPTools(tools: Tool[]): MCPTool[] {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
      try {
        const result = await tool.handler(args as Record<string, any>);

        // If result has 'error' property, return as error
        if (result && typeof result === 'object' && 'error' in result) {
          return errorResult(result.error);
        }

        // Return as JSON result
        return jsonResult(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return errorResult(message);
      }
    },
  }));
}

/**
 * Custom tool definition (user-created)
 */
export interface CustomTool {
  name: string;
  description: string;
  type: 'command' | 'http' | 'script';
  command?: string;
  url?: string;
  method?: string;
  script?: string;
  parameters: Array<{
    name: string;
    type: string;
    description: string;
    required: boolean;
  }>;
}

/**
 * Tool Registry class
 */
class ToolRegistry {
  private tools: Map<string, MCPTool> = new Map();
  private disabledTools: Set<string> = new Set();
  private customTools: Map<string, CustomTool> = new Map();

  /**
   * Register a tool
   */
  register(tool: MCPTool): void {
    if (this.tools.has(tool.name)) {
      logger.warn(`Tool already registered: ${tool.name}, overwriting`);
    }
    this.tools.set(tool.name, tool);
    logger.debug(`Registered tool: ${tool.name}`);
  }

  /**
   * Register multiple tools
   */
  registerAll(tools: MCPTool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * Get a tool by name (returns undefined if disabled)
   */
  get(name: string): MCPTool | undefined {
    if (this.disabledTools.has(name)) {
      return undefined;
    }
    return this.tools.get(name);
  }

  /**
   * Get a tool by name regardless of enabled/disabled state
   */
  getAny(name: string): MCPTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools (only enabled ones)
   */
  getAll(): MCPTool[] {
    return Array.from(this.tools.values()).filter(
      tool => !this.disabledTools.has(tool.name)
    );
  }

  /**
   * Get ALL tools including disabled (for management UI)
   */
  getAllIncludingDisabled(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tool definitions for MCP tools/list response (only enabled tools)
   */
  getDefinitions(): Array<{
    name: string;
    description: string;
    inputSchema: JSONSchema;
  }> {
    return this.getAll().map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  /**
   * Get all tool definitions including disabled (for management UI)
   */
  getAllDefinitions(): Array<{
    name: string;
    description: string;
    inputSchema: JSONSchema;
    enabled: boolean;
    isCustom: boolean;
  }> {
    return this.getAllIncludingDisabled().map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      enabled: !this.disabledTools.has(tool.name),
      isCustom: this.customTools.has(tool.name),
    }));
  }

  /**
   * Enable a tool
   */
  enableTool(name: string): boolean {
    if (!this.tools.has(name)) {
      return false;
    }
    this.disabledTools.delete(name);
    logger.info(`Tool enabled: ${name}`);
    return true;
  }

  /**
   * Disable a tool
   */
  disableTool(name: string): boolean {
    if (!this.tools.has(name)) {
      return false;
    }
    this.disabledTools.add(name);
    logger.info(`Tool disabled: ${name}`);
    return true;
  }

  /**
   * Set tool enabled state
   */
  setToolEnabled(name: string, enabled: boolean): boolean {
    return enabled ? this.enableTool(name) : this.disableTool(name);
  }

  /**
   * Enable all tools
   */
  enableAllTools(): void {
    this.disabledTools.clear();
    logger.info('All tools enabled');
  }

  /**
   * Disable all tools
   */
  disableAllTools(): void {
    for (const tool of this.tools.keys()) {
      this.disabledTools.add(tool);
    }
    logger.info('All tools disabled');
  }

  /**
   * Check if a tool is disabled
   */
  isDisabled(name: string): boolean {
    return this.disabledTools.has(name);
  }

  /**
   * Get disabled tool names
   */
  getDisabledToolNames(): string[] {
    return Array.from(this.disabledTools);
  }

  /**
   * Get tool states (for persistence)
   */
  getToolStates(): Record<string, boolean> {
    const states: Record<string, boolean> = {};
    for (const name of this.tools.keys()) {
      states[name] = !this.disabledTools.has(name);
    }
    return states;
  }

  /**
   * Set tool states (from persistence)
   */
  setToolStates(states: Record<string, boolean>): void {
    for (const [name, enabled] of Object.entries(states)) {
      if (this.tools.has(name)) {
        if (enabled) {
          this.disabledTools.delete(name);
        } else {
          this.disabledTools.add(name);
        }
      }
    }
  }

  /**
   * Register a custom tool
   */
  registerCustomTool(customTool: CustomTool): void {
    // Build input schema from parameters
    const properties: Record<string, JSONSchema & { description?: string }> = {};
    const required: string[] = [];

    for (const param of customTool.parameters) {
      properties[param.name] = {
        type: param.type as 'string' | 'number' | 'boolean',
        description: param.description,
      };
      if (param.required) {
        required.push(param.name);
      }
    }

    const inputSchema: JSONSchema = {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };

    // Create the MCP tool
    const mcpTool: MCPTool = {
      name: customTool.name,
      description: customTool.description,
      inputSchema,
      execute: async (args) => {
        return this.executeCustomTool(customTool, args);
      },
    };

    // Store custom tool definition
    this.customTools.set(customTool.name, customTool);

    // Register as regular tool
    this.register(mcpTool);
    logger.info(`Custom tool registered: ${customTool.name}`);
  }

  /**
   * Execute a custom tool
   */
  private async executeCustomTool(
    customTool: CustomTool,
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    try {
      switch (customTool.type) {
        case 'command': {
          if (!customTool.command) {
            return errorResult('No command specified');
          }
          // Substitute parameters in command
          let command = customTool.command;
          for (const [key, value] of Object.entries(args)) {
            command = command.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
          }
          // Execute using child_process
          const { exec } = await import('child_process');
          const { promisify } = await import('util');
          const execAsync = promisify(exec);
          const result = await execAsync(command, { timeout: 30000 });
          return textResult(result.stdout + (result.stderr ? `\n${result.stderr}` : ''));
        }

        case 'http': {
          if (!customTool.url) {
            return errorResult('No URL specified');
          }
          let url = customTool.url;
          const method = customTool.method || 'GET';
          // Substitute parameters in URL
          for (const [key, value] of Object.entries(args)) {
            url = url.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
          }
          const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: method !== 'GET' ? JSON.stringify(args) : undefined,
          });
          const text = await response.text();
          return textResult(text);
        }

        case 'script': {
          if (!customTool.script) {
            return errorResult('No script specified');
          }
          // Execute JavaScript code with args available
          const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
          const fn = new AsyncFunction('args', customTool.script);
          const result = await fn(args);
          return textResult(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
        }

        default:
          return errorResult(`Unknown custom tool type: ${customTool.type}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Custom tool execution failed: ${message}`);
    }
  }

  /**
   * Remove a custom tool
   */
  removeCustomTool(name: string): boolean {
    if (!this.customTools.has(name)) {
      return false;
    }
    this.customTools.delete(name);
    this.tools.delete(name);
    this.disabledTools.delete(name);
    logger.info(`Custom tool removed: ${name}`);
    return true;
  }

  /**
   * Get all custom tools
   */
  getCustomTools(): CustomTool[] {
    return Array.from(this.customTools.values());
  }

  /**
   * Check if a tool is custom
   */
  isCustomTool(name: string): boolean {
    return this.customTools.has(name);
  }

  /**
   * Execute a tool by name
   */
  async execute(
    name: string,
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);

    if (!tool) {
      logger.error(`Tool not found: ${name}`);
      return errorResult(`Unknown tool: ${name}`);
    }

    if (this.disabledTools.has(name)) {
      logger.warn(`Tool is disabled: ${name}`);
      return errorResult(`Tool is disabled: ${name}`);
    }

    logger.tool(name, 'executing', args);

    try {
      const startTime = Date.now();
      const result = await tool.execute(args, context);
      const duration = Date.now() - startTime;

      logger.tool(name, `completed in ${duration}ms`, {
        isError: result.isError,
        contentTypes: result.content.map(c => c.type),
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Tool execution failed: ${name}`, message);
      return errorResult(message);
    }
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get number of registered tools (only enabled)
   */
  get size(): number {
    return this.getAll().length;
  }

  /**
   * Get total number of tools (including disabled)
   */
  get totalSize(): number {
    return this.tools.size;
  }
}

// Export singleton registry
export const toolRegistry = new ToolRegistry();
