/**
 * ABOV3 Eden - Shell/Command Tools
 * Tools for executing shell commands and scripts
 */

import { exec, spawn, type ChildProcess } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import type { MCPTool, ToolResult } from './index.js';
import { textResult, errorResult, jsonResult } from './index.js';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

/**
 * Track spawned background processes
 */
const backgroundProcesses: Map<string, {
  process: ChildProcess;
  command: string;
  startTime: Date;
  pid: number;
}> = new Map();

/**
 * Generate a unique process ID
 */
function generateProcessId(): string {
  return `proc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// ============================================================
// Execute Command Tool
// ============================================================
const executeCommandTool: MCPTool = {
  name: 'execute_command',
  description: 'Execute a shell command and return its output. Commands are executed in the working directory.',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute',
      },
      cwd: {
        type: 'string',
        description: 'Working directory for the command (defaults to server working directory)',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (defaults to configured commandTimeout)',
      },
      env: {
        type: 'object',
        description: 'Additional environment variables to set',
      },
    },
    required: ['command'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { command, cwd, timeout, env } = args as {
      command: string;
      cwd?: string;
      timeout?: number;
      env?: Record<string, string>;
    };

    // Validate command
    const commandValidation = context.security.validateCommand(command);
    if (!commandValidation.valid) {
      return errorResult(commandValidation.error || 'Command not allowed');
    }

    // Resolve working directory
    let workingDir = context.workingDirectory;
    if (cwd) {
      const cwdResult = context.security.validatePath(cwd);
      if (!cwdResult.valid) {
        return errorResult(cwdResult.error || 'Invalid working directory');
      }
      workingDir = path.isAbsolute(cwd) ? cwd : path.join(context.workingDirectory, cwd);
    }

    const execTimeout = timeout || context.security.getCommandTimeout();

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: workingDir,
        timeout: execTimeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        env: { ...process.env, ...env },
        shell: os.platform() === 'win32' ? 'cmd.exe' : '/bin/bash',
      });

      const output = {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: 0,
      };

      if (stderr && !stdout) {
        return textResult(`Command completed with warnings:\n${stderr}`);
      }

      return jsonResult(output);
    } catch (error: unknown) {
      const execError = error as { code?: number; killed?: boolean; stdout?: string; stderr?: string; message?: string };

      if (execError.killed) {
        return errorResult(`Command timed out after ${execTimeout}ms`);
      }

      // Command failed but still produced output
      if (execError.stdout || execError.stderr) {
        return jsonResult({
          stdout: execError.stdout?.trim() || '',
          stderr: execError.stderr?.trim() || '',
          exitCode: execError.code || 1,
          error: execError.message,
        });
      }

      return errorResult(execError.message || 'Command execution failed');
    }
  },
};

// ============================================================
// Execute Script Tool
// ============================================================
const executeScriptTool: MCPTool = {
  name: 'execute_script',
  description: 'Execute a script file (shell script, batch file, PowerShell script).',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the script file',
      },
      args: {
        type: 'array',
        description: 'Arguments to pass to the script',
        items: { type: 'string' },
      },
      cwd: {
        type: 'string',
        description: 'Working directory for script execution',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds',
      },
    },
    required: ['path'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { path: scriptPath, args: scriptArgs = [], cwd, timeout } = args as {
      path: string;
      args?: string[];
      cwd?: string;
      timeout?: number;
    };

    // Validate script path
    const pathValidation = context.security.validatePath(scriptPath);
    if (!pathValidation.valid) {
      return errorResult(pathValidation.error || 'Invalid script path');
    }

    const resolvedPath = path.isAbsolute(scriptPath)
      ? scriptPath
      : path.join(context.workingDirectory, scriptPath);

    // Determine interpreter based on extension
    const ext = path.extname(resolvedPath).toLowerCase();
    let command: string;

    if (os.platform() === 'win32') {
      switch (ext) {
        case '.ps1':
          command = `powershell -ExecutionPolicy Bypass -File "${resolvedPath}" ${scriptArgs.join(' ')}`;
          break;
        case '.bat':
        case '.cmd':
          command = `"${resolvedPath}" ${scriptArgs.join(' ')}`;
          break;
        default:
          command = `"${resolvedPath}" ${scriptArgs.join(' ')}`;
      }
    } else {
      switch (ext) {
        case '.sh':
          command = `bash "${resolvedPath}" ${scriptArgs.join(' ')}`;
          break;
        case '.py':
          command = `python3 "${resolvedPath}" ${scriptArgs.join(' ')}`;
          break;
        case '.js':
          command = `node "${resolvedPath}" ${scriptArgs.join(' ')}`;
          break;
        default:
          command = `"${resolvedPath}" ${scriptArgs.join(' ')}`;
      }
    }

    // Execute using the execute_command tool logic
    return executeCommandTool.execute({ command, cwd, timeout }, context);
  },
};

// ============================================================
// Spawn Process Tool
// ============================================================
const spawnProcessTool: MCPTool = {
  name: 'spawn_process',
  description: 'Start a background process. Returns a process ID that can be used to check status or kill the process.',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The command to run',
      },
      args: {
        type: 'array',
        description: 'Arguments for the command',
        items: { type: 'string' },
      },
      cwd: {
        type: 'string',
        description: 'Working directory',
      },
    },
    required: ['command'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { command, args: cmdArgs = [], cwd } = args as {
      command: string;
      args?: string[];
      cwd?: string;
    };

    // Validate command
    const fullCommand = `${command} ${cmdArgs.join(' ')}`;
    const commandValidation = context.security.validateCommand(fullCommand);
    if (!commandValidation.valid) {
      return errorResult(commandValidation.error || 'Command not allowed');
    }

    const workingDir = cwd
      ? (path.isAbsolute(cwd) ? cwd : path.join(context.workingDirectory, cwd))
      : context.workingDirectory;

    const processId = generateProcessId();

    const childProcess = spawn(command, cmdArgs, {
      cwd: workingDir,
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    if (!childProcess.pid) {
      return errorResult('Failed to spawn process');
    }

    backgroundProcesses.set(processId, {
      process: childProcess,
      command: fullCommand,
      startTime: new Date(),
      pid: childProcess.pid,
    });

    // Clean up when process exits
    childProcess.on('exit', () => {
      backgroundProcesses.delete(processId);
      logger.debug(`Background process ${processId} exited`);
    });

    return jsonResult({
      processId,
      pid: childProcess.pid,
      command: fullCommand,
      status: 'running',
    });
  },
};

// ============================================================
// List Processes Tool
// ============================================================
const listProcessesTool: MCPTool = {
  name: 'list_processes',
  description: 'List background processes started by this server.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_args, _context): Promise<ToolResult> {
    const processes = Array.from(backgroundProcesses.entries()).map(([id, info]) => ({
      processId: id,
      pid: info.pid,
      command: info.command,
      startTime: info.startTime.toISOString(),
      running: !info.process.killed,
    }));

    return jsonResult({
      processes,
      count: processes.length,
    });
  },
};

// ============================================================
// Kill Process Tool
// ============================================================
const killProcessTool: MCPTool = {
  name: 'kill_process',
  description: 'Kill a background process by its process ID.',
  inputSchema: {
    type: 'object',
    properties: {
      processId: {
        type: 'string',
        description: 'The process ID returned by spawn_process',
      },
      signal: {
        type: 'string',
        description: 'Signal to send (SIGTERM, SIGKILL)',
        enum: ['SIGTERM', 'SIGKILL'],
        default: 'SIGTERM',
      },
    },
    required: ['processId'],
  },
  async execute(args, _context): Promise<ToolResult> {
    const { processId, signal = 'SIGTERM' } = args as {
      processId: string;
      signal?: 'SIGTERM' | 'SIGKILL';
    };

    const processInfo = backgroundProcesses.get(processId);
    if (!processInfo) {
      return errorResult(`Process not found: ${processId}`);
    }

    const killed = processInfo.process.kill(signal);
    if (killed) {
      backgroundProcesses.delete(processId);
      return textResult(`Process ${processId} (PID: ${processInfo.pid}) killed with ${signal}`);
    }

    return errorResult(`Failed to kill process ${processId}`);
  },
};

// ============================================================
// Get Process Output Tool
// ============================================================
const getProcessOutputTool: MCPTool = {
  name: 'get_process_output',
  description: 'Get the stdout/stderr output from a running background process.',
  inputSchema: {
    type: 'object',
    properties: {
      processId: {
        type: 'string',
        description: 'The process ID',
      },
    },
    required: ['processId'],
  },
  async execute(args, _context): Promise<ToolResult> {
    const { processId } = args as { processId: string };

    const processInfo = backgroundProcesses.get(processId);
    if (!processInfo) {
      return errorResult(`Process not found: ${processId}`);
    }

    // Note: This is a simplified implementation
    // Full implementation would buffer output streams
    return jsonResult({
      processId,
      pid: processInfo.pid,
      command: processInfo.command,
      running: !processInfo.process.killed,
      note: 'Real-time output streaming not implemented. Process is running in background.',
    });
  },
};

// ============================================================
// Export all shell tools
// ============================================================
export const shellTools: MCPTool[] = [
  executeCommandTool,
  executeScriptTool,
  spawnProcessTool,
  listProcessesTool,
  killProcessTool,
  getProcessOutputTool,
];
