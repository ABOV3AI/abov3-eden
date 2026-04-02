/**
 * ABOV3 Eden - File System Tools
 * Tools for reading, writing, and managing files
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { glob } from 'glob';
import type { MCPTool, ToolContext, ToolResult } from './index.js';
import { textResult, errorResult, jsonResult } from './index.js';

/**
 * Resolve path by searching workspace roots for the project folder.
 *
 * Path resolution priority:
 * 1. Absolute paths are used directly
 * 2. If workingDirectory is set (from Exodus), relative paths resolve against it
 * 3. Otherwise, search workspace roots for project folders
 * 4. Fallback to first workspace root or cwd
 */
function resolvePath(inputPath: string, context: ToolContext): string {
  // Normalize slashes
  const normalizedInput = inputPath.replace(/\\/g, '/');

  // If absolute path, use it directly
  if (path.isAbsolute(normalizedInput)) {
    return path.normalize(normalizedInput);
  }

  // If workingDirectory is set (from Exodus workspace), use it for relative paths
  // This is the primary mechanism for respecting the Exodus workspace folder
  if (context.workingDirectory && context.workingDirectory !== process.cwd()) {
    const resolvedPath = path.resolve(context.workingDirectory, normalizedInput);
    return path.normalize(resolvedPath);
  }

  // Extract the first path segment (potential project folder name)
  const segments = normalizedInput.split('/').filter(s => s.length > 0);
  if (segments.length === 0) {
    // Empty path - use working directory or first workspace root
    return context.workingDirectory || context.workspaceRoots[0] || process.cwd();
  }

  const projectFolder = segments[0];
  const remainingPath = segments.slice(1).join('/');

  // Search workspace roots for the project folder
  for (const root of context.workspaceRoots) {
    const potentialProjectPath = path.join(root, projectFolder);
    try {
      if (fsSync.existsSync(potentialProjectPath) && fsSync.statSync(potentialProjectPath).isDirectory()) {
        // Found the project folder in this workspace root
        const fullPath = remainingPath
          ? path.join(potentialProjectPath, remainingPath)
          : potentialProjectPath;
        return path.normalize(fullPath);
      }
    } catch {
      // Ignore errors and try next root
    }
  }

  // Project folder not found in any workspace root
  // Use working directory or first workspace root as fallback
  const fallbackRoot = context.workingDirectory || context.workspaceRoots[0] || process.cwd();
  return path.normalize(path.join(fallbackRoot, normalizedInput));
}

/**
 * Validate path and return resolved path or error
 */
function validateAndResolvePath(
  inputPath: string,
  context: ToolContext
): { path: string } | { error: string } {
  const resolved = resolvePath(inputPath, context);
  const validation = context.security.validatePath(resolved);
  if (!validation.valid) {
    return { error: validation.error || 'Path validation failed' };
  }
  return { path: resolved };
}

// ============================================================
// Read File Tool
// ============================================================
const readFileTool: MCPTool = {
  name: 'read_file',
  description: 'Read the contents of a file. Returns text content for text files, or base64-encoded content for binary files.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to read (absolute or relative to working directory)',
      },
      encoding: {
        type: 'string',
        description: 'File encoding: "utf8" for text (default), "base64" for binary',
        enum: ['utf8', 'base64'],
        default: 'utf8',
      },
    },
    required: ['path'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { path: inputPath, encoding = 'utf8' } = args as { path: string; encoding?: string };

    const result = validateAndResolvePath(inputPath, context);
    if ('error' in result) return errorResult(result.error);

    try {
      const stats = await fs.stat(result.path);
      const sizeValidation = context.security.validateFileSize(stats.size);
      if (!sizeValidation.valid) {
        return errorResult(sizeValidation.error || 'File too large');
      }

      if (encoding === 'base64') {
        const buffer = await fs.readFile(result.path);
        return textResult(buffer.toString('base64'));
      }

      const content = await fs.readFile(result.path, 'utf8');
      return textResult(content);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return errorResult(`File not found: ${inputPath}`);
      }
      throw error;
    }
  },
};

// ============================================================
// Write File Tool
// ============================================================
const writeFileTool: MCPTool = {
  name: 'write_file',
  description: 'Write content to a file. Creates the file if it does not exist, overwrites if it does. Creates parent directories if needed.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to write',
      },
      content: {
        type: 'string',
        description: 'Content to write to the file',
      },
      encoding: {
        type: 'string',
        description: 'Content encoding: "utf8" for text (default), "base64" for binary',
        enum: ['utf8', 'base64'],
        default: 'utf8',
      },
    },
    required: ['path', 'content'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { path: inputPath, content, encoding = 'utf8' } = args as {
      path: string;
      content: string;
      encoding?: string;
    };

    const result = validateAndResolvePath(inputPath, context);
    if ('error' in result) return errorResult(result.error);

    // Ensure parent directory exists
    const dir = path.dirname(result.path);
    await fs.mkdir(dir, { recursive: true });

    if (encoding === 'base64') {
      const buffer = Buffer.from(content, 'base64');
      await fs.writeFile(result.path, buffer);
      return textResult(`Successfully wrote ${buffer.length} bytes to ${inputPath}`);
    }

    await fs.writeFile(result.path, content, 'utf8');
    return textResult(`Successfully wrote ${content.length} characters to ${inputPath}`);
  },
};

// ============================================================
// List Directory Tool
// ============================================================
const listDirectoryTool: MCPTool = {
  name: 'list_directory',
  description: 'List files and directories in a directory. Returns file names, sizes, and types.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the directory to list (defaults to working directory)',
        default: '.',
      },
      includeHidden: {
        type: 'boolean',
        description: 'Include hidden files (starting with .)',
        default: false,
      },
    },
    required: [],
  },
  async execute(args, context): Promise<ToolResult> {
    const { path: inputPath = '.', includeHidden = false } = args as {
      path?: string;
      includeHidden?: boolean;
    };

    const result = validateAndResolvePath(inputPath, context);
    if ('error' in result) return errorResult(result.error);

    try {
      const entries = await fs.readdir(result.path, { withFileTypes: true });
      const items = await Promise.all(
        entries
          .filter(entry => includeHidden || !entry.name.startsWith('.'))
          .map(async entry => {
            const entryPath = path.join(result.path, entry.name);
            try {
              const stats = await fs.stat(entryPath);
              return {
                name: entry.name,
                type: entry.isDirectory() ? 'directory' : 'file',
                size: entry.isFile() ? stats.size : undefined,
                modified: stats.mtime.toISOString(),
              };
            } catch {
              return {
                name: entry.name,
                type: entry.isDirectory() ? 'directory' : 'file',
              };
            }
          })
      );

      return jsonResult({
        path: inputPath,
        entries: items,
        count: items.length,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return errorResult(`Directory not found: ${inputPath}`);
      }
      throw error;
    }
  },
};

// ============================================================
// Create Directory Tool
// ============================================================
const createDirectoryTool: MCPTool = {
  name: 'create_directory',
  description: 'Create a new directory. Creates parent directories if they do not exist.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path of the directory to create',
      },
    },
    required: ['path'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { path: inputPath } = args as { path: string };

    const result = validateAndResolvePath(inputPath, context);
    if ('error' in result) return errorResult(result.error);

    await fs.mkdir(result.path, { recursive: true });
    return textResult(`Successfully created directory: ${inputPath}`);
  },
};

// ============================================================
// Delete File Tool
// ============================================================
const deleteFileTool: MCPTool = {
  name: 'delete_file',
  description: 'Delete a file or empty directory.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file or directory to delete',
      },
    },
    required: ['path'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { path: inputPath } = args as { path: string };

    const result = validateAndResolvePath(inputPath, context);
    if ('error' in result) return errorResult(result.error);

    try {
      const stats = await fs.stat(result.path);
      if (stats.isDirectory()) {
        await fs.rmdir(result.path);
        return textResult(`Successfully deleted directory: ${inputPath}`);
      } else {
        await fs.unlink(result.path);
        return textResult(`Successfully deleted file: ${inputPath}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return errorResult(`File or directory not found: ${inputPath}`);
      }
      if ((error as NodeJS.ErrnoException).code === 'ENOTEMPTY') {
        return errorResult(`Directory not empty: ${inputPath}`);
      }
      throw error;
    }
  },
};

// ============================================================
// Move File Tool
// ============================================================
const moveFileTool: MCPTool = {
  name: 'move_file',
  description: 'Move or rename a file or directory.',
  inputSchema: {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        description: 'Source path',
      },
      destination: {
        type: 'string',
        description: 'Destination path',
      },
    },
    required: ['source', 'destination'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { source, destination } = args as { source: string; destination: string };

    const sourceResult = validateAndResolvePath(source, context);
    if ('error' in sourceResult) return errorResult(sourceResult.error);

    const destResult = validateAndResolvePath(destination, context);
    if ('error' in destResult) return errorResult(destResult.error);

    // Ensure destination directory exists
    const destDir = path.dirname(destResult.path);
    await fs.mkdir(destDir, { recursive: true });

    await fs.rename(sourceResult.path, destResult.path);
    return textResult(`Successfully moved ${source} to ${destination}`);
  },
};

// ============================================================
// Copy File Tool
// ============================================================
const copyFileTool: MCPTool = {
  name: 'copy_file',
  description: 'Copy a file to a new location.',
  inputSchema: {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        description: 'Source file path',
      },
      destination: {
        type: 'string',
        description: 'Destination file path',
      },
    },
    required: ['source', 'destination'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { source, destination } = args as { source: string; destination: string };

    const sourceResult = validateAndResolvePath(source, context);
    if ('error' in sourceResult) return errorResult(sourceResult.error);

    const destResult = validateAndResolvePath(destination, context);
    if ('error' in destResult) return errorResult(destResult.error);

    // Ensure destination directory exists
    const destDir = path.dirname(destResult.path);
    await fs.mkdir(destDir, { recursive: true });

    await fs.copyFile(sourceResult.path, destResult.path);
    return textResult(`Successfully copied ${source} to ${destination}`);
  },
};

// ============================================================
// File Info Tool
// ============================================================
const fileInfoTool: MCPTool = {
  name: 'file_info',
  description: 'Get detailed information about a file or directory.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file or directory',
      },
    },
    required: ['path'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { path: inputPath } = args as { path: string };

    const result = validateAndResolvePath(inputPath, context);
    if ('error' in result) return errorResult(result.error);

    try {
      const stats = await fs.stat(result.path);
      const info = {
        path: inputPath,
        absolutePath: result.path,
        type: stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : 'other',
        size: stats.size,
        sizeHuman: formatBytes(stats.size),
        created: stats.birthtime.toISOString(),
        modified: stats.mtime.toISOString(),
        accessed: stats.atime.toISOString(),
        permissions: stats.mode.toString(8),
        isSymbolicLink: stats.isSymbolicLink(),
      };
      return jsonResult(info);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return errorResult(`File not found: ${inputPath}`);
      }
      throw error;
    }
  },
};

// ============================================================
// Search Files Tool
// ============================================================
const searchFilesTool: MCPTool = {
  name: 'search_files',
  description: 'Search for files matching a glob pattern.',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob pattern to match (e.g., "**/*.ts", "*.json")',
      },
      path: {
        type: 'string',
        description: 'Base directory to search in (defaults to working directory)',
        default: '.',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return',
        default: 100,
      },
    },
    required: ['pattern'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { pattern, path: inputPath = '.', maxResults = 100 } = args as {
      pattern: string;
      path?: string;
      maxResults?: number;
    };

    const result = validateAndResolvePath(inputPath, context);
    if ('error' in result) return errorResult(result.error);

    const matches = await glob(pattern, {
      cwd: result.path,
      nodir: false,
      dot: false,
      maxDepth: 20,
    });

    const limitedMatches = matches.slice(0, maxResults);

    return jsonResult({
      pattern,
      basePath: inputPath,
      matches: limitedMatches,
      count: limitedMatches.length,
      truncated: matches.length > maxResults,
      totalMatches: matches.length,
    });
  },
};

// ============================================================
// Read Multiple Files Tool
// ============================================================
const readMultipleTool: MCPTool = {
  name: 'read_multiple',
  description: 'Read contents of multiple files at once.',
  inputSchema: {
    type: 'object',
    properties: {
      paths: {
        type: 'array',
        description: 'Array of file paths to read',
        items: { type: 'string' },
      },
    },
    required: ['paths'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { paths } = args as { paths: string[] };

    const results: Record<string, { content?: string; error?: string }> = {};

    for (const inputPath of paths) {
      const result = validateAndResolvePath(inputPath, context);
      if ('error' in result) {
        results[inputPath] = { error: result.error };
        continue;
      }

      try {
        const stats = await fs.stat(result.path);
        const sizeValidation = context.security.validateFileSize(stats.size);
        if (!sizeValidation.valid) {
          results[inputPath] = { error: sizeValidation.error || 'File too large' };
          continue;
        }

        const content = await fs.readFile(result.path, 'utf8');
        results[inputPath] = { content };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          results[inputPath] = { error: 'File not found' };
        } else {
          results[inputPath] = { error: (error as Error).message };
        }
      }
    }

    return jsonResult(results);
  },
};

// ============================================================
// Append to File Tool
// ============================================================
const appendFileTool: MCPTool = {
  name: 'append_file',
  description: 'Append content to an existing file. Creates the file if it does not exist.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file',
      },
      content: {
        type: 'string',
        description: 'Content to append',
      },
    },
    required: ['path', 'content'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { path: inputPath, content } = args as { path: string; content: string };

    const result = validateAndResolvePath(inputPath, context);
    if ('error' in result) return errorResult(result.error);

    // Ensure parent directory exists
    const dir = path.dirname(result.path);
    await fs.mkdir(dir, { recursive: true });

    await fs.appendFile(result.path, content, 'utf8');
    return textResult(`Successfully appended ${content.length} characters to ${inputPath}`);
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

// ============================================================
// Export all file system tools
// ============================================================
export const filesystemTools: MCPTool[] = [
  readFileTool,
  writeFileTool,
  listDirectoryTool,
  createDirectoryTool,
  deleteFileTool,
  moveFileTool,
  copyFileTool,
  fileInfoTool,
  searchFilesTool,
  readMultipleTool,
  appendFileTool,
];
