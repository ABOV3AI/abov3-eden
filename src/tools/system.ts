/**
 * ABOV3 Eden - System Tools
 * Tools for system information, environment, and utilities
 */

import os from 'os';
import type { MCPTool, ToolResult } from './index.js';
import { jsonResult, textResult, errorResult } from './index.js';

// ============================================================
// System Info Tool
// ============================================================
const systemInfoTool: MCPTool = {
  name: 'system_info',
  description: 'Get detailed system information including OS, CPU, memory, and uptime.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_args, _context): Promise<ToolResult> {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    return jsonResult({
      os: {
        platform: os.platform(),
        type: os.type(),
        release: os.release(),
        version: os.version(),
        arch: os.arch(),
        hostname: os.hostname(),
      },
      cpu: {
        model: cpus[0]?.model || 'Unknown',
        cores: cpus.length,
        speed: cpus[0]?.speed || 0,
      },
      memory: {
        total: totalMem,
        totalHuman: formatBytes(totalMem),
        free: freeMem,
        freeHuman: formatBytes(freeMem),
        used: totalMem - freeMem,
        usedHuman: formatBytes(totalMem - freeMem),
        usagePercent: ((totalMem - freeMem) / totalMem * 100).toFixed(1) + '%',
      },
      uptime: {
        seconds: os.uptime(),
        human: formatUptime(os.uptime()),
      },
      user: {
        username: os.userInfo().username,
        homedir: os.homedir(),
        shell: os.userInfo().shell || 'N/A',
      },
      nodejs: {
        version: process.version,
        pid: process.pid,
      },
    });
  },
};

// ============================================================
// Environment Variables Tool
// ============================================================
const environmentVarsTool: MCPTool = {
  name: 'environment_vars',
  description: 'Get environment variables. Can filter by prefix or get specific variables.',
  inputSchema: {
    type: 'object',
    properties: {
      names: {
        type: 'array',
        description: 'Specific variable names to retrieve',
        items: { type: 'string' },
      },
      prefix: {
        type: 'string',
        description: 'Filter variables by prefix (e.g., "NODE_", "PATH")',
      },
      maskSecrets: {
        type: 'boolean',
        description: 'Mask values that appear to be secrets (default: true)',
        default: true,
      },
    },
    required: [],
  },
  async execute(args, _context): Promise<ToolResult> {
    const { names, prefix, maskSecrets = true } = args as {
      names?: string[];
      prefix?: string;
      maskSecrets?: boolean;
    };

    let vars: Record<string, string | undefined> = { ...process.env };

    // Filter by specific names
    if (names && names.length > 0) {
      const filtered: Record<string, string | undefined> = {};
      for (const name of names) {
        filtered[name] = vars[name];
      }
      vars = filtered;
    }

    // Filter by prefix
    if (prefix) {
      const filtered: Record<string, string | undefined> = {};
      for (const [key, value] of Object.entries(vars)) {
        if (key.toUpperCase().startsWith(prefix.toUpperCase())) {
          filtered[key] = value;
        }
      }
      vars = filtered;
    }

    // Mask secrets
    if (maskSecrets) {
      const secretPatterns = ['KEY', 'SECRET', 'TOKEN', 'PASSWORD', 'CREDENTIAL', 'AUTH'];
      for (const [key, value] of Object.entries(vars)) {
        if (value && secretPatterns.some(p => key.toUpperCase().includes(p))) {
          vars[key] = value.substring(0, 4) + '****' + value.substring(value.length - 4);
        }
      }
    }

    return jsonResult({
      variables: vars,
      count: Object.keys(vars).length,
    });
  },
};

// ============================================================
// Network Info Tool
// ============================================================
const networkInfoTool: MCPTool = {
  name: 'network_info',
  description: 'Get network interface information including IP addresses.',
  inputSchema: {
    type: 'object',
    properties: {
      includeInternal: {
        type: 'boolean',
        description: 'Include internal/loopback interfaces',
        default: false,
      },
    },
    required: [],
  },
  async execute(args, _context): Promise<ToolResult> {
    const { includeInternal = false } = args as { includeInternal?: boolean };

    const interfaces = os.networkInterfaces();
    const result: Record<string, Array<{
      address: string;
      family: string;
      mac: string;
      internal: boolean;
      cidr: string | null;
    }>> = {};

    for (const [name, addrs] of Object.entries(interfaces)) {
      if (!addrs) continue;

      const filteredAddrs = addrs.filter(addr => includeInternal || !addr.internal);
      if (filteredAddrs.length > 0) {
        result[name] = filteredAddrs.map(addr => ({
          address: addr.address,
          family: addr.family,
          mac: addr.mac,
          internal: addr.internal,
          cidr: addr.cidr,
        }));
      }
    }

    return jsonResult({
      hostname: os.hostname(),
      interfaces: result,
    });
  },
};

// ============================================================
// Current Time Tool
// ============================================================
const currentTimeTool: MCPTool = {
  name: 'current_time',
  description: 'Get the current date and time in various formats.',
  inputSchema: {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        description: 'Timezone for the time (e.g., "America/New_York", "UTC")',
      },
    },
    required: [],
  },
  async execute(args, _context): Promise<ToolResult> {
    const { timezone } = args as { timezone?: string };

    const now = new Date();

    const formats: Record<string, string> = {
      iso: now.toISOString(),
      utc: now.toUTCString(),
      local: now.toString(),
      timestamp: now.getTime().toString(),
      date: now.toLocaleDateString(),
      time: now.toLocaleTimeString(),
    };

    if (timezone) {
      try {
        formats.timezone = now.toLocaleString('en-US', { timeZone: timezone });
        formats.requestedTimezone = timezone;
      } catch {
        formats.timezoneError = `Invalid timezone: ${timezone}`;
      }
    }

    return jsonResult(formats);
  },
};

// ============================================================
// Working Directory Tool
// ============================================================
const workingDirectoryTool: MCPTool = {
  name: 'working_directory',
  description: 'Get the current working directory of the MCP server.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_args, context): Promise<ToolResult> {
    return jsonResult({
      workingDirectory: context.workingDirectory,
      processCwd: process.cwd(),
    });
  },
};

// ============================================================
// Disk Usage Tool
// ============================================================
const diskUsageTool: MCPTool = {
  name: 'disk_usage',
  description: 'Get disk usage information for a path.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to check disk usage for (defaults to working directory)',
      },
    },
    required: [],
  },
  async execute(args, context): Promise<ToolResult> {
    // Note: Node.js doesn't have built-in disk space API
    // This is a simplified implementation using OS-specific commands would be needed for full support
    const { path: inputPath } = args as { path?: string };
    const checkPath = inputPath || context.workingDirectory;

    // Return a placeholder - full implementation would use child_process
    // to run df (Unix) or wmic (Windows)
    return jsonResult({
      path: checkPath,
      note: 'Full disk usage requires platform-specific commands. Use execute_command with "df -h" (Unix) or "wmic logicaldisk get size,freespace,caption" (Windows) for detailed info.',
    });
  },
};

// ============================================================
// Sleep/Wait Tool
// ============================================================
const sleepTool: MCPTool = {
  name: 'sleep',
  description: 'Wait for a specified number of milliseconds.',
  inputSchema: {
    type: 'object',
    properties: {
      milliseconds: {
        type: 'number',
        description: 'Time to wait in milliseconds (max 60000)',
      },
    },
    required: ['milliseconds'],
  },
  async execute(args, _context): Promise<ToolResult> {
    const { milliseconds } = args as { milliseconds: number };

    if (milliseconds < 0 || milliseconds > 60000) {
      return errorResult('Sleep duration must be between 0 and 60000 milliseconds');
    }

    await new Promise(resolve => setTimeout(resolve, milliseconds));
    return textResult(`Waited for ${milliseconds}ms`);
  },
};

// ============================================================
// Generate UUID Tool
// ============================================================
const generateUuidTool: MCPTool = {
  name: 'generate_uuid',
  description: 'Generate a random UUID (v4).',
  inputSchema: {
    type: 'object',
    properties: {
      count: {
        type: 'number',
        description: 'Number of UUIDs to generate (default: 1, max: 100)',
        default: 1,
      },
    },
    required: [],
  },
  async execute(args, _context): Promise<ToolResult> {
    const { count = 1 } = args as { count?: number };

    if (count < 1 || count > 100) {
      return errorResult('Count must be between 1 and 100');
    }

    const { randomUUID } = await import('crypto');
    const uuids = Array.from({ length: count }, () => randomUUID());

    if (count === 1) {
      return textResult(uuids[0]);
    }

    return jsonResult({ uuids, count });
  },
};

// ============================================================
// Hash Tool
// ============================================================
const hashTool: MCPTool = {
  name: 'hash',
  description: 'Calculate hash of a string using various algorithms.',
  inputSchema: {
    type: 'object',
    properties: {
      input: {
        type: 'string',
        description: 'String to hash',
      },
      algorithm: {
        type: 'string',
        description: 'Hash algorithm: md5, sha1, sha256, sha512',
        enum: ['md5', 'sha1', 'sha256', 'sha512'],
        default: 'sha256',
      },
    },
    required: ['input'],
  },
  async execute(args, _context): Promise<ToolResult> {
    const { input, algorithm = 'sha256' } = args as {
      input: string;
      algorithm?: 'md5' | 'sha1' | 'sha256' | 'sha512';
    };

    const { createHash } = await import('crypto');
    const hash = createHash(algorithm).update(input).digest('hex');

    return jsonResult({
      input: input.length > 100 ? input.substring(0, 100) + '...' : input,
      algorithm,
      hash,
    });
  },
};

// ============================================================
// Base64 Encode/Decode Tool
// ============================================================
const base64Tool: MCPTool = {
  name: 'base64',
  description: 'Encode or decode Base64 strings.',
  inputSchema: {
    type: 'object',
    properties: {
      input: {
        type: 'string',
        description: 'String to encode or decode',
      },
      operation: {
        type: 'string',
        description: 'Operation: encode or decode',
        enum: ['encode', 'decode'],
        default: 'encode',
      },
    },
    required: ['input'],
  },
  async execute(args, _context): Promise<ToolResult> {
    const { input, operation = 'encode' } = args as {
      input: string;
      operation?: 'encode' | 'decode';
    };

    try {
      if (operation === 'encode') {
        const encoded = Buffer.from(input, 'utf8').toString('base64');
        return textResult(encoded);
      } else {
        const decoded = Buffer.from(input, 'base64').toString('utf8');
        return textResult(decoded);
      }
    } catch (error) {
      return errorResult(`Base64 ${operation} failed: ${(error as Error).message}`);
    }
  },
};

// ============================================================
// Helper Functions
// ============================================================
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);

  return parts.join(' ');
}

// ============================================================
// Export all system tools
// ============================================================
export const systemTools: MCPTool[] = [
  systemInfoTool,
  environmentVarsTool,
  networkInfoTool,
  currentTimeTool,
  workingDirectoryTool,
  diskUsageTool,
  sleepTool,
  generateUuidTool,
  hashTool,
  base64Tool,
];
