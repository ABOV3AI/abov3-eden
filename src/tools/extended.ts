/**
 * ABOV3 Eden - Extended Tools
 * Additional useful tools for desktop productivity
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { MCPTool, ToolResult } from './index.js';
import { jsonResult, textResult, errorResult } from './index.js';

const execAsync = promisify(exec);

// ============================================================
// Clipboard Tools
// ============================================================
const clipboardReadTool: MCPTool = {
  name: 'clipboard_read',
  description: 'Read text content from the system clipboard.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_args, _context): Promise<ToolResult> {
    try {
      const platform = process.platform;
      let command: string;

      if (platform === 'win32') {
        command = 'powershell -command "Get-Clipboard"';
      } else if (platform === 'darwin') {
        command = 'pbpaste';
      } else {
        // Linux - try xclip first, then xsel
        command = 'xclip -selection clipboard -o 2>/dev/null || xsel --clipboard --output 2>/dev/null';
      }

      const { stdout } = await execAsync(command, { timeout: 5000 });
      return textResult(stdout);
    } catch (error) {
      return errorResult(`Failed to read clipboard: ${(error as Error).message}`);
    }
  },
};

const clipboardWriteTool: MCPTool = {
  name: 'clipboard_write',
  description: 'Write text content to the system clipboard.',
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Text to write to clipboard',
      },
    },
    required: ['text'],
  },
  async execute(args, _context): Promise<ToolResult> {
    const { text } = args as { text: string };

    try {
      const platform = process.platform;
      let command: string;

      if (platform === 'win32') {
        // Escape for PowerShell
        const escapedText = text.replace(/"/g, '`"').replace(/\$/g, '`$');
        command = `powershell -command "Set-Clipboard -Value \\"${escapedText}\\""`;
      } else if (platform === 'darwin') {
        command = `echo "${text.replace(/"/g, '\\"')}" | pbcopy`;
      } else {
        // Linux
        command = `echo "${text.replace(/"/g, '\\"')}" | xclip -selection clipboard`;
      }

      await execAsync(command, { timeout: 5000 });
      return textResult(`Copied ${text.length} characters to clipboard`);
    } catch (error) {
      return errorResult(`Failed to write to clipboard: ${(error as Error).message}`);
    }
  },
};

// ============================================================
// Git Tools
// ============================================================
const gitStatusTool: MCPTool = {
  name: 'git_status',
  description: 'Get the git status of the working directory. Shows modified, staged, and untracked files.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Repository path (defaults to working directory)',
      },
      short: {
        type: 'boolean',
        description: 'Use short status format',
        default: false,
      },
    },
    required: [],
  },
  async execute(args, context): Promise<ToolResult> {
    const { path: repoPath, short = false } = args as { path?: string; short?: boolean };
    const cwd = repoPath || context.workingDirectory;

    try {
      const command = short ? 'git status --short' : 'git status';
      const { stdout } = await execAsync(command, { cwd, timeout: 10000 });
      return textResult(stdout.trim() || 'Nothing to commit, working tree clean');
    } catch (error) {
      return errorResult(`Git status failed: ${(error as Error).message}`);
    }
  },
};

const gitLogTool: MCPTool = {
  name: 'git_log',
  description: 'Get git commit history with customizable format.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Repository path (defaults to working directory)',
      },
      count: {
        type: 'number',
        description: 'Number of commits to show (default: 10)',
        default: 10,
      },
      oneline: {
        type: 'boolean',
        description: 'Use one-line format',
        default: true,
      },
    },
    required: [],
  },
  async execute(args, context): Promise<ToolResult> {
    const { path: repoPath, count = 10, oneline = true } = args as {
      path?: string;
      count?: number;
      oneline?: boolean;
    };
    const cwd = repoPath || context.workingDirectory;

    try {
      const format = oneline ? '--oneline' : '--pretty=format:"%h - %an, %ar : %s"';
      const { stdout } = await execAsync(`git log ${format} -n ${count}`, { cwd, timeout: 10000 });
      return textResult(stdout.trim() || 'No commits found');
    } catch (error) {
      return errorResult(`Git log failed: ${(error as Error).message}`);
    }
  },
};

const gitDiffTool: MCPTool = {
  name: 'git_diff',
  description: 'Show git diff for changes in the working directory.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Repository path (defaults to working directory)',
      },
      file: {
        type: 'string',
        description: 'Specific file to diff',
      },
      staged: {
        type: 'boolean',
        description: 'Show staged changes only',
        default: false,
      },
    },
    required: [],
  },
  async execute(args, context): Promise<ToolResult> {
    const { path: repoPath, file, staged = false } = args as {
      path?: string;
      file?: string;
      staged?: boolean;
    };
    const cwd = repoPath || context.workingDirectory;

    try {
      let command = 'git diff';
      if (staged) command += ' --staged';
      if (file) command += ` -- "${file}"`;

      const { stdout } = await execAsync(command, { cwd, timeout: 30000, maxBuffer: 10 * 1024 * 1024 });
      return textResult(stdout.trim() || 'No differences found');
    } catch (error) {
      return errorResult(`Git diff failed: ${(error as Error).message}`);
    }
  },
};

const gitBranchTool: MCPTool = {
  name: 'git_branch',
  description: 'List git branches or get the current branch.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Repository path (defaults to working directory)',
      },
      all: {
        type: 'boolean',
        description: 'Show all branches including remote',
        default: false,
      },
      current: {
        type: 'boolean',
        description: 'Only show current branch name',
        default: false,
      },
    },
    required: [],
  },
  async execute(args, context): Promise<ToolResult> {
    const { path: repoPath, all = false, current = false } = args as {
      path?: string;
      all?: boolean;
      current?: boolean;
    };
    const cwd = repoPath || context.workingDirectory;

    try {
      let command: string;
      if (current) {
        command = 'git branch --show-current';
      } else if (all) {
        command = 'git branch -a';
      } else {
        command = 'git branch';
      }

      const { stdout } = await execAsync(command, { cwd, timeout: 10000 });
      return textResult(stdout.trim() || 'No branches found');
    } catch (error) {
      return errorResult(`Git branch failed: ${(error as Error).message}`);
    }
  },
};

// ============================================================
// Web/HTTP Tools
// ============================================================
const httpFetchTool: MCPTool = {
  name: 'http_fetch',
  description: 'Fetch content from a URL using HTTP/HTTPS.',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL to fetch',
      },
      method: {
        type: 'string',
        description: 'HTTP method (GET, POST, PUT, DELETE)',
        enum: ['GET', 'POST', 'PUT', 'DELETE'],
        default: 'GET',
      },
      headers: {
        type: 'object',
        description: 'Custom headers as key-value pairs',
      },
      body: {
        type: 'string',
        description: 'Request body (for POST/PUT)',
      },
      timeout: {
        type: 'number',
        description: 'Request timeout in milliseconds (default: 30000)',
        default: 30000,
      },
    },
    required: ['url'],
  },
  async execute(args, _context): Promise<ToolResult> {
    const {
      url,
      method = 'GET',
      headers = {},
      body,
      timeout = 30000,
    } = args as {
      url: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      timeout?: number;
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method,
        headers: headers as HeadersInit,
        body: body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const contentType = response.headers.get('content-type') || '';
      let responseBody: string;

      if (contentType.includes('application/json')) {
        const json = await response.json();
        responseBody = JSON.stringify(json, null, 2);
      } else {
        responseBody = await response.text();
        // Truncate very large responses
        if (responseBody.length > 50000) {
          responseBody = responseBody.substring(0, 50000) + '\n... (truncated)';
        }
      }

      return jsonResult({
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: responseBody,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('abort')) {
        return errorResult(`Request timed out after ${timeout}ms`);
      }
      return errorResult(`HTTP fetch failed: ${message}`);
    }
  },
};

// ============================================================
// JSON Tools
// ============================================================
const jsonValidateTool: MCPTool = {
  name: 'json_validate',
  description: 'Validate and optionally format JSON content.',
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'JSON string to validate',
      },
      format: {
        type: 'boolean',
        description: 'Return formatted JSON if valid',
        default: true,
      },
    },
    required: ['content'],
  },
  async execute(args, _context): Promise<ToolResult> {
    const { content, format = true } = args as { content: string; format?: boolean };

    try {
      const parsed = JSON.parse(content);

      if (format) {
        return jsonResult({
          valid: true,
          formatted: JSON.stringify(parsed, null, 2),
          type: Array.isArray(parsed) ? 'array' : typeof parsed,
          keys: typeof parsed === 'object' && parsed !== null ? Object.keys(parsed) : [],
        });
      }

      return jsonResult({ valid: true });
    } catch (error) {
      return jsonResult({
        valid: false,
        error: (error as Error).message,
      });
    }
  },
};

const jsonQueryTool: MCPTool = {
  name: 'json_query',
  description: 'Query JSON content using simple path expressions (e.g., "data.items[0].name").',
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'JSON string to query',
      },
      path: {
        type: 'string',
        description: 'Path expression (e.g., "data.items[0].name", "users[*].email")',
      },
    },
    required: ['content', 'path'],
  },
  async execute(args, _context): Promise<ToolResult> {
    const { content, path } = args as { content: string; path: string };

    try {
      const parsed = JSON.parse(content);

      // Simple path parser
      const parts = path.split(/\.|\[|\]/).filter(Boolean);
      let current: any = parsed;

      for (const part of parts) {
        if (part === '*' && Array.isArray(current)) {
          // Wildcard for arrays - return all values at this level
          continue;
        }

        if (current === undefined || current === null) {
          return errorResult(`Path not found: ${path}`);
        }

        if (Array.isArray(current) && part === '*') {
          // Already handled
        } else if (Array.isArray(current) && !isNaN(Number(part))) {
          current = current[Number(part)];
        } else if (typeof current === 'object') {
          current = current[part];
        } else {
          return errorResult(`Cannot access property "${part}" on ${typeof current}`);
        }
      }

      if (current === undefined) {
        return errorResult(`Path not found: ${path}`);
      }

      return jsonResult({
        path,
        result: current,
        type: Array.isArray(current) ? 'array' : typeof current,
      });
    } catch (error) {
      return errorResult(`JSON query failed: ${(error as Error).message}`);
    }
  },
};

// ============================================================
// Text Processing Tools
// ============================================================
const textTransformTool: MCPTool = {
  name: 'text_transform',
  description: 'Transform text with various operations.',
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Text to transform',
      },
      operation: {
        type: 'string',
        description: 'Transformation operation',
        enum: [
          'uppercase',
          'lowercase',
          'capitalize',
          'reverse',
          'trim',
          'lines_sort',
          'lines_unique',
          'lines_reverse',
          'words_count',
          'chars_count',
          'lines_count',
        ],
      },
    },
    required: ['text', 'operation'],
  },
  async execute(args, _context): Promise<ToolResult> {
    const { text, operation } = args as { text: string; operation: string };

    switch (operation) {
      case 'uppercase':
        return textResult(text.toUpperCase());
      case 'lowercase':
        return textResult(text.toLowerCase());
      case 'capitalize':
        return textResult(text.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' '));
      case 'reverse':
        return textResult(text.split('').reverse().join(''));
      case 'trim':
        return textResult(text.trim());
      case 'lines_sort':
        return textResult(text.split('\n').sort().join('\n'));
      case 'lines_unique':
        return textResult([...new Set(text.split('\n'))].join('\n'));
      case 'lines_reverse':
        return textResult(text.split('\n').reverse().join('\n'));
      case 'words_count':
        return jsonResult({ count: text.split(/\s+/).filter(Boolean).length });
      case 'chars_count':
        return jsonResult({ count: text.length, noSpaces: text.replace(/\s/g, '').length });
      case 'lines_count':
        return jsonResult({ count: text.split('\n').length });
      default:
        return errorResult(`Unknown operation: ${operation}`);
    }
  },
};

// ============================================================
// Open URL/File Tool
// ============================================================
const openTool: MCPTool = {
  name: 'open',
  description: 'Open a URL in the default browser or a file with its default application.',
  inputSchema: {
    type: 'object',
    properties: {
      target: {
        type: 'string',
        description: 'URL or file path to open',
      },
    },
    required: ['target'],
  },
  async execute(args, _context): Promise<ToolResult> {
    const { target } = args as { target: string };

    try {
      const platform = process.platform;
      let command: string;

      if (platform === 'win32') {
        command = `start "" "${target}"`;
      } else if (platform === 'darwin') {
        command = `open "${target}"`;
      } else {
        command = `xdg-open "${target}"`;
      }

      await execAsync(command, { timeout: 5000 });
      return textResult(`Opened: ${target}`);
    } catch (error) {
      return errorResult(`Failed to open: ${(error as Error).message}`);
    }
  },
};

// ============================================================
// Notification Tool (Desktop)
// ============================================================
const notifyTool: MCPTool = {
  name: 'notify',
  description: 'Show a desktop notification.',
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Notification title',
      },
      message: {
        type: 'string',
        description: 'Notification message body',
      },
    },
    required: ['title', 'message'],
  },
  async execute(args, _context): Promise<ToolResult> {
    const { title, message } = args as { title: string; message: string };

    try {
      const platform = process.platform;
      let command: string;

      if (platform === 'win32') {
        // PowerShell toast notification
        const ps = `
          [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
          $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
          $textNodes = $template.GetElementsByTagName("text")
          $textNodes.Item(0).AppendChild($template.CreateTextNode("${title.replace(/"/g, '`"')}")) | Out-Null
          $textNodes.Item(1).AppendChild($template.CreateTextNode("${message.replace(/"/g, '`"')}")) | Out-Null
          $toast = [Windows.UI.Notifications.ToastNotification]::new($template)
          [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("ABOV3 Eden").Show($toast)
        `;
        command = `powershell -command "${ps.replace(/\n/g, ' ')}"`;
      } else if (platform === 'darwin') {
        command = `osascript -e 'display notification "${message.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}"'`;
      } else {
        command = `notify-send "${title.replace(/"/g, '\\"')}" "${message.replace(/"/g, '\\"')}"`;
      }

      await execAsync(command, { timeout: 5000 });
      return textResult('Notification sent');
    } catch (error) {
      return errorResult(`Notification failed: ${(error as Error).message}`);
    }
  },
};

// ============================================================
// Export all extended tools
// ============================================================
export const extendedTools: MCPTool[] = [
  clipboardReadTool,
  clipboardWriteTool,
  gitStatusTool,
  gitLogTool,
  gitDiffTool,
  gitBranchTool,
  httpFetchTool,
  jsonValidateTool,
  jsonQueryTool,
  textTransformTool,
  openTool,
  notifyTool,
];
