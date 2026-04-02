/**
 * ABOV3 Eden - Security Utilities
 * Path validation, command filtering, and sandboxing helpers
 */

import path from 'path';
import { logger } from './logger.js';

/**
 * Security configuration interface
 */
export interface SecurityConfig {
  allowedPaths: string[];
  blockedCommands: string[];
  maxFileSize: number; // in bytes
  commandTimeout: number; // in milliseconds
  allowAllPaths?: boolean;
}

const DEFAULT_BLOCKED_COMMANDS = [
  // Destructive commands
  'rm -rf /',
  'rm -rf /*',
  'rm -rf ~',
  'rm -rf ~/*',
  'del /s /q c:\\',
  'format',
  'mkfs',
  'dd if=',
  // Network attacks
  'wget',
  'curl.*-o.*|.*sh',
  // Privilege escalation patterns
  'chmod 777',
  'chmod -R 777',
  // Fork bombs
  ':(){ :|:& };:',
  '.+&.+&.+&.+&',
];

/**
 * Normalize a file path to prevent directory traversal attacks
 */
export function normalizePath(inputPath: string): string {
  // Resolve to absolute path and normalize
  const resolved = path.resolve(inputPath);
  return path.normalize(resolved);
}

/**
 * Check if a path is within allowed directories
 */
export function isPathAllowed(
  targetPath: string,
  allowedPaths: string[],
  allowAllPaths = false
): boolean {
  if (allowAllPaths) {
    return true;
  }

  if (allowedPaths.length === 0) {
    return true; // No restrictions if no paths specified
  }

  const normalizedTarget = normalizePath(targetPath);

  for (const allowedPath of allowedPaths) {
    const normalizedAllowed = normalizePath(allowedPath);
    if (normalizedTarget.startsWith(normalizedAllowed)) {
      return true;
    }
  }

  return false;
}

/**
 * Validate a path doesn't contain traversal attempts
 */
export function validatePathSafety(inputPath: string): { safe: boolean; reason?: string } {
  // Check for null bytes
  if (inputPath.includes('\0')) {
    return { safe: false, reason: 'Path contains null bytes' };
  }

  // Check for obvious traversal patterns
  const traversalPatterns = ['../', '..\\', '/../', '\\..\\'];
  for (const pattern of traversalPatterns) {
    if (inputPath.includes(pattern)) {
      // Allow relative paths but warn
      logger.warn(`Path contains parent directory reference: ${inputPath}`);
    }
  }

  // Check for protocol handlers that could be exploited
  if (/^(file|ftp|http|https|data|javascript):/.test(inputPath)) {
    return { safe: false, reason: 'Path contains protocol handler' };
  }

  return { safe: true };
}

/**
 * Check if a command matches blocked patterns
 */
export function isCommandBlocked(
  command: string,
  blockedCommands: string[] = DEFAULT_BLOCKED_COMMANDS
): { blocked: boolean; reason?: string } {
  const normalizedCommand = command.toLowerCase().trim();

  for (const blocked of blockedCommands) {
    // Check for exact match or pattern match
    try {
      const pattern = new RegExp(blocked, 'i');
      if (pattern.test(normalizedCommand)) {
        return {
          blocked: true,
          reason: `Command matches blocked pattern: ${blocked}`,
        };
      }
    } catch {
      // If not a valid regex, do simple includes check
      if (normalizedCommand.includes(blocked.toLowerCase())) {
        return {
          blocked: true,
          reason: `Command contains blocked sequence: ${blocked}`,
        };
      }
    }
  }

  return { blocked: false };
}

/**
 * Sanitize a filename to prevent injection
 */
export function sanitizeFilename(filename: string): string {
  // Remove or replace dangerous characters
  return filename
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/^\.+/, '_')
    .trim();
}

/**
 * Validate file size against limit
 */
export function isFileSizeAllowed(size: number, maxSize: number): boolean {
  return size <= maxSize;
}

/**
 * Parse size string to bytes (e.g., "100MB" -> 104857600)
 */
export function parseSizeString(sizeStr: string): number {
  const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)?$/i);
  if (!match) {
    throw new Error(`Invalid size string: ${sizeStr}`);
  }

  const value = parseFloat(match[1]);
  const unit = (match[2] || 'B').toUpperCase();

  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
    TB: 1024 * 1024 * 1024 * 1024,
  };

  return Math.floor(value * multipliers[unit]);
}

/**
 * Create a security context for a request
 */
export function createSecurityContext(config: SecurityConfig) {
  return {
    validatePath: (targetPath: string): { valid: boolean; error?: string } => {
      const safety = validatePathSafety(targetPath);
      if (!safety.safe) {
        return { valid: false, error: safety.reason };
      }

      if (!isPathAllowed(targetPath, config.allowedPaths, config.allowAllPaths)) {
        return {
          valid: false,
          error: `Path not in allowed directories: ${targetPath}`,
        };
      }

      return { valid: true };
    },

    validateCommand: (command: string): { valid: boolean; error?: string } => {
      const blocked = isCommandBlocked(command, config.blockedCommands);
      if (blocked.blocked) {
        return { valid: false, error: blocked.reason };
      }
      return { valid: true };
    },

    validateFileSize: (size: number): { valid: boolean; error?: string } => {
      if (!isFileSizeAllowed(size, config.maxFileSize)) {
        return {
          valid: false,
          error: `File size ${size} exceeds maximum ${config.maxFileSize}`,
        };
      }
      return { valid: true };
    },

    getCommandTimeout: () => config.commandTimeout,
  };
}

export type SecurityContext = ReturnType<typeof createSecurityContext>;
