/**
 * Productivity Tools - Business and productivity utilities
 * Provides tools for encryption, password generation, time tracking, and more
 */

import type { Tool } from './index.js';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Generate a secure random password
 */
function generateSecurePassword(length: number, options: {
  uppercase?: boolean;
  lowercase?: boolean;
  numbers?: boolean;
  symbols?: boolean;
  excludeSimilar?: boolean;
  excludeAmbiguous?: boolean;
}): string {
  const {
    uppercase = true,
    lowercase = true,
    numbers = true,
    symbols = true,
    excludeSimilar = false,
    excludeAmbiguous = false,
  } = options;

  let chars = '';

  const upperChars = excludeSimilar ? 'ABCDEFGHJKLMNPQRSTUVWXYZ' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowerChars = excludeSimilar ? 'abcdefghjkmnpqrstuvwxyz' : 'abcdefghijklmnopqrstuvwxyz';
  const numChars = excludeSimilar ? '23456789' : '0123456789';
  const symbolChars = excludeAmbiguous ? '!@#$%^&*-_=+' : '!@#$%^&*()_+-=[]{}|;:,.<>?';

  if (uppercase) chars += upperChars;
  if (lowercase) chars += lowerChars;
  if (numbers) chars += numChars;
  if (symbols) chars += symbolChars;

  if (chars.length === 0) {
    chars = lowerChars + numChars; // Fallback
  }

  let password = '';
  const randomBytes = crypto.randomBytes(length);

  for (let i = 0; i < length; i++) {
    password += chars[randomBytes[i] % chars.length];
  }

  return password;
}

/**
 * Derive encryption key from password
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
}

/**
 * Simple local storage for time tracking
 */
const timeTracking: Map<string, {
  name: string;
  startTime: number;
  notes?: string;
}> = new Map();

export const productivityTools: Tool[] = [
  {
    name: 'password_generate',
    description: 'Generate a secure random password with configurable options',
    inputSchema: {
      type: 'object',
      properties: {
        length: {
          type: 'number',
          description: 'Password length. Default: 16',
        },
        count: {
          type: 'number',
          description: 'Number of passwords to generate. Default: 1',
        },
        uppercase: {
          type: 'boolean',
          description: 'Include uppercase letters. Default: true',
        },
        lowercase: {
          type: 'boolean',
          description: 'Include lowercase letters. Default: true',
        },
        numbers: {
          type: 'boolean',
          description: 'Include numbers. Default: true',
        },
        symbols: {
          type: 'boolean',
          description: 'Include symbols. Default: true',
        },
        excludeSimilar: {
          type: 'boolean',
          description: 'Exclude similar characters (0, O, I, l, 1). Default: false',
        },
        excludeAmbiguous: {
          type: 'boolean',
          description: 'Exclude ambiguous symbols. Default: false',
        },
      },
      required: [],
    },
    handler: async ({ length = 16, count = 1, uppercase = true, lowercase = true, numbers = true, symbols = true, excludeSimilar = false, excludeAmbiguous = false }) => {
      try {
        const passwords: string[] = [];

        for (let i = 0; i < count; i++) {
          passwords.push(generateSecurePassword(length, {
            uppercase,
            lowercase,
            numbers,
            symbols,
            excludeSimilar,
            excludeAmbiguous,
          }));
        }

        // Calculate password strength
        let charsetSize = 0;
        if (uppercase) charsetSize += 26;
        if (lowercase) charsetSize += 26;
        if (numbers) charsetSize += 10;
        if (symbols) charsetSize += 32;

        const entropy = Math.floor(Math.log2(Math.pow(charsetSize, length)));
        let strength = 'weak';
        if (entropy >= 128) strength = 'very strong';
        else if (entropy >= 80) strength = 'strong';
        else if (entropy >= 60) strength = 'moderate';

        return {
          success: true,
          passwords: count === 1 ? passwords[0] : passwords,
          length,
          entropy: `${entropy} bits`,
          strength,
        };
      } catch (error) {
        return { error: `Failed to generate password: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'encrypt_text',
    description: 'Encrypt text using AES-256-GCM with a password',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to encrypt',
        },
        password: {
          type: 'string',
          description: 'Encryption password',
        },
        output: {
          type: 'string',
          description: 'Output file path (optional)',
        },
      },
      required: ['text', 'password'],
    },
    handler: async ({ text, password, output }) => {
      try {
        // Generate salt and IV
        const salt = crypto.randomBytes(16);
        const iv = crypto.randomBytes(12);

        // Derive key from password
        const key = deriveKey(password, salt);

        // Encrypt
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        let encrypted = cipher.update(text, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        const authTag = cipher.getAuthTag();

        // Combine: salt + iv + authTag + encrypted
        const combined = Buffer.concat([
          salt,
          iv,
          authTag,
          Buffer.from(encrypted, 'base64'),
        ]).toString('base64');

        if (output) {
          const outputPath = path.resolve(output);
          await fs.mkdir(path.dirname(outputPath), { recursive: true });
          await fs.writeFile(outputPath, combined);
          return {
            success: true,
            output: outputPath,
            algorithm: 'AES-256-GCM',
          };
        }

        return {
          success: true,
          encrypted: combined,
          algorithm: 'AES-256-GCM',
        };
      } catch (error) {
        return { error: `Failed to encrypt: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'decrypt_text',
    description: 'Decrypt text that was encrypted with encrypt_text',
    inputSchema: {
      type: 'object',
      properties: {
        encrypted: {
          type: 'string',
          description: 'Encrypted text (base64)',
        },
        password: {
          type: 'string',
          description: 'Decryption password',
        },
        file: {
          type: 'string',
          description: 'Path to encrypted file (alternative to encrypted)',
        },
      },
      required: ['password'],
    },
    handler: async ({ encrypted, password, file }) => {
      try {
        let encryptedData = encrypted;

        if (file && !encrypted) {
          const filePath = path.resolve(file);
          encryptedData = await fs.readFile(filePath, 'utf-8');
        }

        if (!encryptedData) {
          return { error: 'Either encrypted or file is required' };
        }

        // Decode combined data
        const combined = Buffer.from(encryptedData, 'base64');

        // Extract components
        const salt = combined.subarray(0, 16);
        const iv = combined.subarray(16, 28);
        const authTag = combined.subarray(28, 44);
        const encryptedContent = combined.subarray(44);

        // Derive key from password
        const key = deriveKey(password, salt);

        // Decrypt
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encryptedContent);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        return {
          success: true,
          decrypted: decrypted.toString('utf8'),
        };
      } catch (error) {
        if (error instanceof Error && error.message.includes('Unsupported state')) {
          return { error: 'Decryption failed - incorrect password or corrupted data' };
        }
        return { error: `Failed to decrypt: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'timer_start',
    description: 'Start a time tracking timer for a task',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name/description of the task',
        },
        id: {
          type: 'string',
          description: 'Unique timer ID. Default: auto-generated',
        },
        notes: {
          type: 'string',
          description: 'Additional notes',
        },
      },
      required: ['name'],
    },
    handler: async ({ name, id, notes }) => {
      try {
        const timerId = id || `timer_${Date.now()}`;

        if (timeTracking.has(timerId)) {
          return { error: `Timer with ID "${timerId}" already exists` };
        }

        timeTracking.set(timerId, {
          name,
          startTime: Date.now(),
          notes,
        });

        return {
          success: true,
          id: timerId,
          name,
          startedAt: new Date().toISOString(),
        };
      } catch (error) {
        return { error: `Failed to start timer: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'timer_stop',
    description: 'Stop a time tracking timer and get elapsed time',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Timer ID to stop',
        },
      },
      required: ['id'],
    },
    handler: async ({ id }) => {
      try {
        const timer = timeTracking.get(id);

        if (!timer) {
          return { error: `Timer with ID "${id}" not found` };
        }

        const endTime = Date.now();
        const elapsedMs = endTime - timer.startTime;
        const elapsedSec = Math.floor(elapsedMs / 1000);
        const hours = Math.floor(elapsedSec / 3600);
        const minutes = Math.floor((elapsedSec % 3600) / 60);
        const seconds = elapsedSec % 60;

        timeTracking.delete(id);

        return {
          success: true,
          id,
          name: timer.name,
          notes: timer.notes,
          startedAt: new Date(timer.startTime).toISOString(),
          stoppedAt: new Date(endTime).toISOString(),
          elapsed: {
            milliseconds: elapsedMs,
            seconds: elapsedSec,
            formatted: `${hours}h ${minutes}m ${seconds}s`,
          },
        };
      } catch (error) {
        return { error: `Failed to stop timer: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'timer_list',
    description: 'List all active timers',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: async () => {
      try {
        const now = Date.now();
        const timers = Array.from(timeTracking.entries()).map(([id, timer]) => {
          const elapsedMs = now - timer.startTime;
          const elapsedSec = Math.floor(elapsedMs / 1000);
          const hours = Math.floor(elapsedSec / 3600);
          const minutes = Math.floor((elapsedSec % 3600) / 60);
          const seconds = elapsedSec % 60;

          return {
            id,
            name: timer.name,
            notes: timer.notes,
            startedAt: new Date(timer.startTime).toISOString(),
            elapsed: `${hours}h ${minutes}m ${seconds}s`,
          };
        });

        return {
          success: true,
          timers,
          count: timers.length,
        };
      } catch (error) {
        return { error: `Failed to list timers: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'notes_search',
    description: 'Search for text in markdown notes within a directory',
    inputSchema: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: 'Directory to search in',
        },
        query: {
          type: 'string',
          description: 'Search query (text or regex)',
        },
        regex: {
          type: 'boolean',
          description: 'Treat query as regex. Default: false',
        },
        caseSensitive: {
          type: 'boolean',
          description: 'Case sensitive search. Default: false',
        },
        extensions: {
          type: 'array',
          items: { type: 'string' },
          description: 'File extensions to search. Default: [".md", ".txt"]',
        },
      },
      required: ['directory', 'query'],
    },
    handler: async ({ directory, query, regex = false, caseSensitive = false, extensions = ['.md', '.txt'] }) => {
      try {
        const dirPath = path.resolve(directory);
        const results: any[] = [];

        async function searchDir(dir: string) {
          const entries = await fs.readdir(dir, { withFileTypes: true });

          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
              await searchDir(fullPath);
            } else if (entry.isFile()) {
              const ext = path.extname(entry.name).toLowerCase();
              if (!extensions.includes(ext)) continue;

              const content = await fs.readFile(fullPath, 'utf-8');
              const lines = content.split('\n');

              let searchFn: (line: string) => boolean;

              if (regex) {
                const re = new RegExp(query, caseSensitive ? 'g' : 'gi');
                searchFn = (line) => re.test(line);
              } else {
                const q = caseSensitive ? query : query.toLowerCase();
                searchFn = (line) => (caseSensitive ? line : line.toLowerCase()).includes(q);
              }

              const matches: { line: number; text: string }[] = [];
              lines.forEach((line, idx) => {
                if (searchFn(line)) {
                  matches.push({
                    line: idx + 1,
                    text: line.trim().slice(0, 200),
                  });
                }
              });

              if (matches.length > 0) {
                results.push({
                  file: fullPath,
                  relativePath: path.relative(dirPath, fullPath),
                  matches,
                  matchCount: matches.length,
                });
              }
            }
          }
        }

        await searchDir(dirPath);

        return {
          success: true,
          results,
          filesMatched: results.length,
          totalMatches: results.reduce((sum, r) => sum + r.matchCount, 0),
        };
      } catch (error) {
        return { error: `Failed to search notes: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'bookmark_manage',
    description: 'Manage bookmarks stored in a JSON file',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'remove', 'list', 'search'],
          description: 'Action to perform',
        },
        file: {
          type: 'string',
          description: 'Path to bookmarks JSON file',
        },
        bookmark: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            title: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            notes: { type: 'string' },
          },
          description: 'Bookmark data (for add action)',
        },
        url: {
          type: 'string',
          description: 'URL to remove (for remove action)',
        },
        query: {
          type: 'string',
          description: 'Search query (for search action)',
        },
        tag: {
          type: 'string',
          description: 'Filter by tag (for list/search action)',
        },
      },
      required: ['action', 'file'],
    },
    handler: async ({ action, file, bookmark, url, query, tag }) => {
      try {
        const filePath = path.resolve(file);

        // Load existing bookmarks
        let bookmarks: any[] = [];
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          bookmarks = JSON.parse(content);
        } catch {
          // File doesn't exist or invalid JSON, start fresh
        }

        switch (action) {
          case 'add':
            if (!bookmark || !bookmark.url) {
              return { error: 'Bookmark with URL is required for add action' };
            }

            // Check for duplicate
            if (bookmarks.some(b => b.url === bookmark.url)) {
              return { error: 'Bookmark with this URL already exists' };
            }

            bookmarks.push({
              ...bookmark,
              createdAt: new Date().toISOString(),
            });

            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, JSON.stringify(bookmarks, null, 2));

            return {
              success: true,
              action: 'added',
              bookmark,
              totalBookmarks: bookmarks.length,
            };

          case 'remove':
            if (!url) {
              return { error: 'URL is required for remove action' };
            }

            const originalLength = bookmarks.length;
            bookmarks = bookmarks.filter(b => b.url !== url);

            if (bookmarks.length === originalLength) {
              return { error: 'Bookmark not found' };
            }

            await fs.writeFile(filePath, JSON.stringify(bookmarks, null, 2));

            return {
              success: true,
              action: 'removed',
              url,
              totalBookmarks: bookmarks.length,
            };

          case 'list':
            let filtered = bookmarks;

            if (tag) {
              filtered = filtered.filter(b =>
                b.tags && b.tags.some((t: string) => t.toLowerCase() === tag.toLowerCase())
              );
            }

            return {
              success: true,
              bookmarks: filtered,
              count: filtered.length,
              totalBookmarks: bookmarks.length,
            };

          case 'search':
            if (!query) {
              return { error: 'Query is required for search action' };
            }

            const q = query.toLowerCase();
            let searchResults = bookmarks.filter(b =>
              b.url?.toLowerCase().includes(q) ||
              b.title?.toLowerCase().includes(q) ||
              b.notes?.toLowerCase().includes(q) ||
              b.tags?.some((t: string) => t.toLowerCase().includes(q))
            );

            if (tag) {
              searchResults = searchResults.filter(b =>
                b.tags && b.tags.some((t: string) => t.toLowerCase() === tag.toLowerCase())
              );
            }

            return {
              success: true,
              results: searchResults,
              count: searchResults.length,
            };

          default:
            return { error: `Unknown action: ${action}` };
        }
      } catch (error) {
        return { error: `Failed to manage bookmarks: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'hash_file',
    description: 'Calculate hash checksum of a file',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'Path to file',
        },
        algorithm: {
          type: 'string',
          enum: ['md5', 'sha1', 'sha256', 'sha512'],
          description: 'Hash algorithm. Default: sha256',
        },
      },
      required: ['file'],
    },
    handler: async ({ file, algorithm = 'sha256' }) => {
      try {
        const filePath = path.resolve(file);
        const content = await fs.readFile(filePath);
        const hash = crypto.createHash(algorithm).update(content).digest('hex');

        const stat = await fs.stat(filePath);

        return {
          success: true,
          file: filePath,
          algorithm,
          hash,
          size: stat.size,
        };
      } catch (error) {
        return { error: `Failed to hash file: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'date_calculate',
    description: 'Calculate dates, durations, and time differences',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['add', 'subtract', 'diff', 'format', 'parse'],
          description: 'Operation to perform',
        },
        date: {
          type: 'string',
          description: 'Date string (ISO 8601 or common formats)',
        },
        date2: {
          type: 'string',
          description: 'Second date (for diff operation)',
        },
        amount: {
          type: 'number',
          description: 'Amount to add/subtract',
        },
        unit: {
          type: 'string',
          enum: ['years', 'months', 'weeks', 'days', 'hours', 'minutes', 'seconds'],
          description: 'Time unit for add/subtract',
        },
        format: {
          type: 'string',
          description: 'Output format (for format operation). Uses tokens: YYYY, MM, DD, HH, mm, ss',
        },
        timezone: {
          type: 'string',
          description: 'Timezone (e.g., "America/New_York", "UTC")',
        },
      },
      required: ['operation'],
    },
    handler: async ({ operation, date, date2, amount, unit, format, timezone }) => {
      try {
        const parseDate = (d: string | undefined): Date => {
          if (!d) return new Date();
          return new Date(d);
        };

        const d = parseDate(date);

        if (isNaN(d.getTime())) {
          return { error: 'Invalid date format' };
        }

        switch (operation) {
          case 'add':
          case 'subtract': {
            if (amount === undefined || !unit) {
              return { error: 'Amount and unit are required for add/subtract' };
            }

            const multiplier = operation === 'subtract' ? -1 : 1;
            const result = new Date(d);

            switch (unit) {
              case 'years':
                result.setFullYear(result.getFullYear() + amount * multiplier);
                break;
              case 'months':
                result.setMonth(result.getMonth() + amount * multiplier);
                break;
              case 'weeks':
                result.setDate(result.getDate() + amount * 7 * multiplier);
                break;
              case 'days':
                result.setDate(result.getDate() + amount * multiplier);
                break;
              case 'hours':
                result.setHours(result.getHours() + amount * multiplier);
                break;
              case 'minutes':
                result.setMinutes(result.getMinutes() + amount * multiplier);
                break;
              case 'seconds':
                result.setSeconds(result.getSeconds() + amount * multiplier);
                break;
            }

            return {
              success: true,
              operation,
              original: d.toISOString(),
              result: result.toISOString(),
              amount,
              unit,
            };
          }

          case 'diff': {
            if (!date2) {
              return { error: 'date2 is required for diff operation' };
            }

            const d2 = parseDate(date2);
            if (isNaN(d2.getTime())) {
              return { error: 'Invalid date2 format' };
            }

            const diffMs = d2.getTime() - d.getTime();
            const diffSec = Math.floor(Math.abs(diffMs) / 1000);
            const diffMin = Math.floor(diffSec / 60);
            const diffHours = Math.floor(diffMin / 60);
            const diffDays = Math.floor(diffHours / 24);
            const diffWeeks = Math.floor(diffDays / 7);
            const diffMonths = Math.floor(diffDays / 30.44);
            const diffYears = Math.floor(diffDays / 365.25);

            return {
              success: true,
              operation: 'diff',
              date1: d.toISOString(),
              date2: d2.toISOString(),
              difference: {
                milliseconds: diffMs,
                seconds: diffSec,
                minutes: diffMin,
                hours: diffHours,
                days: diffDays,
                weeks: diffWeeks,
                months: diffMonths,
                years: diffYears,
              },
              humanReadable: formatDuration(Math.abs(diffMs)),
              isPast: diffMs < 0,
            };
          }

          case 'format': {
            const fmt = format || 'YYYY-MM-DD HH:mm:ss';
            const formatted = fmt
              .replace('YYYY', d.getFullYear().toString())
              .replace('MM', (d.getMonth() + 1).toString().padStart(2, '0'))
              .replace('DD', d.getDate().toString().padStart(2, '0'))
              .replace('HH', d.getHours().toString().padStart(2, '0'))
              .replace('mm', d.getMinutes().toString().padStart(2, '0'))
              .replace('ss', d.getSeconds().toString().padStart(2, '0'));

            return {
              success: true,
              operation: 'format',
              original: d.toISOString(),
              formatted,
              format: fmt,
            };
          }

          case 'parse': {
            return {
              success: true,
              operation: 'parse',
              input: date,
              iso: d.toISOString(),
              unix: Math.floor(d.getTime() / 1000),
              unixMs: d.getTime(),
              parts: {
                year: d.getFullYear(),
                month: d.getMonth() + 1,
                day: d.getDate(),
                hour: d.getHours(),
                minute: d.getMinutes(),
                second: d.getSeconds(),
                dayOfWeek: d.getDay(),
                dayOfYear: getDayOfYear(d),
              },
            };
          }

          default:
            return { error: `Unknown operation: ${operation}` };
        }
      } catch (error) {
        return { error: `Failed to calculate date: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },
];

/**
 * Format duration in human-readable form
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? 's' : ''}, ${hours % 24} hour${hours % 24 !== 1 ? 's' : ''}`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}, ${minutes % 60} minute${minutes % 60 !== 1 ? 's' : ''}`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''}, ${seconds % 60} second${seconds % 60 !== 1 ? 's' : ''}`;
  return `${seconds} second${seconds !== 1 ? 's' : ''}`;
}

/**
 * Get day of year (1-366)
 */
function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}
