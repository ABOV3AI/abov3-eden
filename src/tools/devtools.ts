/**
 * Developer Tools - Code formatting, linting, minification, and diff
 * Provides tools for code quality and development tasks
 */

import type { Tool } from './index.js';
import { promises as fs } from 'fs';
import path from 'path';

// Lazy load dependencies
let prettier: typeof import('prettier') | null = null;
let terser: typeof import('terser') | null = null;
let diff: typeof import('diff') | null = null;

async function getPrettier() {
  if (!prettier) {
    prettier = await import('prettier');
  }
  return prettier;
}

async function getTerser() {
  if (!terser) {
    terser = await import('terser');
  }
  return terser;
}

async function getDiff() {
  if (!diff) {
    diff = await import('diff');
  }
  return diff;
}

/**
 * Detect language/parser from file extension or explicit type
 */
function detectParser(filename?: string, language?: string): string {
  if (language) {
    const langMap: Record<string, string> = {
      javascript: 'babel',
      js: 'babel',
      jsx: 'babel',
      typescript: 'typescript',
      ts: 'typescript',
      tsx: 'typescript',
      json: 'json',
      css: 'css',
      scss: 'scss',
      less: 'less',
      html: 'html',
      markdown: 'markdown',
      md: 'markdown',
      yaml: 'yaml',
      yml: 'yaml',
      graphql: 'graphql',
      vue: 'vue',
      angular: 'angular',
    };
    return langMap[language.toLowerCase()] || 'babel';
  }

  if (filename) {
    const ext = path.extname(filename).toLowerCase().slice(1);
    const extMap: Record<string, string> = {
      js: 'babel',
      jsx: 'babel',
      mjs: 'babel',
      cjs: 'babel',
      ts: 'typescript',
      tsx: 'typescript',
      mts: 'typescript',
      cts: 'typescript',
      json: 'json',
      css: 'css',
      scss: 'scss',
      less: 'less',
      html: 'html',
      htm: 'html',
      md: 'markdown',
      markdown: 'markdown',
      yaml: 'yaml',
      yml: 'yaml',
      graphql: 'graphql',
      gql: 'graphql',
      vue: 'vue',
    };
    return extMap[ext] || 'babel';
  }

  return 'babel';
}

export const devTools: Tool[] = [
  {
    name: 'code_format',
    description: 'Format code using Prettier with configurable options',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Code to format',
        },
        file: {
          type: 'string',
          description: 'File path to format (alternative to code)',
        },
        language: {
          type: 'string',
          description: 'Language/parser (js, ts, json, css, html, md, yaml). Auto-detected from file extension',
        },
        options: {
          type: 'object',
          properties: {
            tabWidth: { type: 'number', description: 'Tab width. Default: 2' },
            useTabs: { type: 'boolean', description: 'Use tabs. Default: false' },
            semi: { type: 'boolean', description: 'Add semicolons. Default: true' },
            singleQuote: { type: 'boolean', description: 'Use single quotes. Default: false' },
            trailingComma: { type: 'string', enum: ['none', 'es5', 'all'], description: 'Trailing commas. Default: es5' },
            printWidth: { type: 'number', description: 'Print width. Default: 80' },
          },
          description: 'Prettier formatting options',
        },
        output: {
          type: 'string',
          description: 'Output file path. If not provided, returns formatted code',
        },
      },
      required: [],
    },
    handler: async ({ code, file, language, options = {}, output }) => {
      try {
        const prt = await getPrettier();

        let sourceCode = code;
        let filename = file;

        if (file && !code) {
          const filePath = path.resolve(file);
          sourceCode = await fs.readFile(filePath, 'utf-8');
          filename = filePath;
        }

        if (!sourceCode) {
          return { error: 'Either code or file is required' };
        }

        const parser = detectParser(filename, language);

        const formatted = await prt.format(sourceCode, {
          parser,
          tabWidth: options.tabWidth ?? 2,
          useTabs: options.useTabs ?? false,
          semi: options.semi ?? true,
          singleQuote: options.singleQuote ?? false,
          trailingComma: (options.trailingComma as 'none' | 'es5' | 'all') ?? 'es5',
          printWidth: options.printWidth ?? 80,
        });

        if (output) {
          const outputPath = path.resolve(output);
          await fs.mkdir(path.dirname(outputPath), { recursive: true });
          await fs.writeFile(outputPath, formatted);
          return {
            success: true,
            output: outputPath,
            parser,
          };
        }

        return {
          success: true,
          formatted,
          parser,
          originalLength: sourceCode.length,
          formattedLength: formatted.length,
        };
      } catch (error) {
        return { error: `Failed to format code: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'code_minify',
    description: 'Minify JavaScript or CSS code',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Code to minify',
        },
        file: {
          type: 'string',
          description: 'File path to minify (alternative to code)',
        },
        type: {
          type: 'string',
          enum: ['javascript', 'css'],
          description: 'Code type. Default: javascript',
        },
        options: {
          type: 'object',
          properties: {
            mangle: { type: 'boolean', description: 'Mangle variable names. Default: true' },
            compress: { type: 'boolean', description: 'Apply compression. Default: true' },
            sourceMap: { type: 'boolean', description: 'Generate source map. Default: false' },
          },
          description: 'Minification options',
        },
        output: {
          type: 'string',
          description: 'Output file path',
        },
      },
      required: [],
    },
    handler: async ({ code, file, type = 'javascript', options = {}, output }) => {
      try {
        let sourceCode = code;

        if (file && !code) {
          const filePath = path.resolve(file);
          sourceCode = await fs.readFile(filePath, 'utf-8');

          // Auto-detect type from extension
          const ext = path.extname(file).toLowerCase();
          if (ext === '.css') type = 'css';
        }

        if (!sourceCode) {
          return { error: 'Either code or file is required' };
        }

        let minified: string;
        let sourceMap: string | undefined;

        if (type === 'javascript') {
          const tr = await getTerser();
          const result = await tr.minify(sourceCode, {
            mangle: options.mangle ?? true,
            compress: options.compress ?? true,
            sourceMap: options.sourceMap ? { url: 'inline' } : false,
          });

          if (result.code === undefined) {
            return { error: 'Minification produced no output' };
          }

          minified = result.code;
          sourceMap = result.map as string | undefined;
        } else if (type === 'css') {
          // Simple CSS minification (remove comments, whitespace)
          minified = sourceCode
            .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comments
            .replace(/\s+/g, ' ') // Collapse whitespace
            .replace(/\s*([{}:;,>+~])\s*/g, '$1') // Remove space around special chars
            .replace(/;}/g, '}') // Remove trailing semicolons
            .trim();
        } else {
          return { error: `Unsupported type: ${type}` };
        }

        const savings = ((1 - minified.length / sourceCode.length) * 100).toFixed(1);

        if (output) {
          const outputPath = path.resolve(output);
          await fs.mkdir(path.dirname(outputPath), { recursive: true });
          await fs.writeFile(outputPath, minified);

          if (sourceMap && options.sourceMap) {
            await fs.writeFile(outputPath + '.map', sourceMap);
          }

          return {
            success: true,
            output: outputPath,
            originalSize: sourceCode.length,
            minifiedSize: minified.length,
            savings: `${savings}%`,
          };
        }

        return {
          success: true,
          minified,
          originalSize: sourceCode.length,
          minifiedSize: minified.length,
          savings: `${savings}%`,
          sourceMap,
        };
      } catch (error) {
        return { error: `Failed to minify code: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'code_beautify',
    description: 'Beautify/unminify compressed JavaScript or CSS code',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Minified code to beautify',
        },
        file: {
          type: 'string',
          description: 'File path to beautify (alternative to code)',
        },
        language: {
          type: 'string',
          description: 'Language (js, css, json, html). Auto-detected from file',
        },
        output: {
          type: 'string',
          description: 'Output file path',
        },
      },
      required: [],
    },
    handler: async ({ code, file, language, output }) => {
      try {
        const prt = await getPrettier();

        let sourceCode = code;
        let filename = file;

        if (file && !code) {
          const filePath = path.resolve(file);
          sourceCode = await fs.readFile(filePath, 'utf-8');
          filename = filePath;
        }

        if (!sourceCode) {
          return { error: 'Either code or file is required' };
        }

        const parser = detectParser(filename, language);

        // Use Prettier with wide print width for beautification
        const beautified = await prt.format(sourceCode, {
          parser,
          tabWidth: 2,
          useTabs: false,
          printWidth: 80,
        });

        if (output) {
          const outputPath = path.resolve(output);
          await fs.mkdir(path.dirname(outputPath), { recursive: true });
          await fs.writeFile(outputPath, beautified);
          return {
            success: true,
            output: outputPath,
            parser,
          };
        }

        return {
          success: true,
          beautified,
          parser,
          originalLength: sourceCode.length,
          beautifiedLength: beautified.length,
        };
      } catch (error) {
        return { error: `Failed to beautify code: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'diff_create',
    description: 'Create a diff/patch between two texts or files',
    inputSchema: {
      type: 'object',
      properties: {
        oldText: {
          type: 'string',
          description: 'Original text content',
        },
        newText: {
          type: 'string',
          description: 'New text content',
        },
        oldFile: {
          type: 'string',
          description: 'Path to original file (alternative to oldText)',
        },
        newFile: {
          type: 'string',
          description: 'Path to new file (alternative to newText)',
        },
        context: {
          type: 'number',
          description: 'Context lines around changes. Default: 3',
        },
        format: {
          type: 'string',
          enum: ['unified', 'patch', 'json'],
          description: 'Output format. Default: unified',
        },
        output: {
          type: 'string',
          description: 'Output file path for the diff',
        },
      },
      required: [],
    },
    handler: async ({ oldText, newText, oldFile, newFile, context = 3, format = 'unified', output }) => {
      try {
        const d = await getDiff();

        let oldContent = oldText || '';
        let newContent = newText || '';
        let oldName = 'original';
        let newName = 'modified';

        if (oldFile) {
          const filePath = path.resolve(oldFile);
          oldContent = await fs.readFile(filePath, 'utf-8');
          oldName = oldFile;
        }

        if (newFile) {
          const filePath = path.resolve(newFile);
          newContent = await fs.readFile(filePath, 'utf-8');
          newName = newFile;
        }

        let result: string | object;

        switch (format) {
          case 'unified':
          case 'patch':
            result = d.createPatch(
              oldName,
              oldContent,
              newContent,
              oldName,
              newName,
              { context }
            );
            break;

          case 'json':
            const changes = d.diffLines(oldContent, newContent);
            result = {
              changes: changes.map((part: any) => ({
                value: part.value,
                added: part.added || false,
                removed: part.removed || false,
                count: part.count,
              })),
              stats: {
                additions: changes.filter((p: any) => p.added).reduce((sum: number, p: any) => sum + (p.count || 0), 0),
                deletions: changes.filter((p: any) => p.removed).reduce((sum: number, p: any) => sum + (p.count || 0), 0),
              },
            };
            break;

          default:
            return { error: `Unknown format: ${format}` };
        }

        if (output) {
          const outputPath = path.resolve(output);
          await fs.mkdir(path.dirname(outputPath), { recursive: true });
          await fs.writeFile(
            outputPath,
            typeof result === 'string' ? result : JSON.stringify(result, null, 2)
          );
          return {
            success: true,
            output: outputPath,
            format,
          };
        }

        return {
          success: true,
          diff: result,
          format,
        };
      } catch (error) {
        return { error: `Failed to create diff: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'diff_apply',
    description: 'Apply a patch/diff to text or file',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to apply patch to',
        },
        file: {
          type: 'string',
          description: 'File to apply patch to (alternative to text)',
        },
        patch: {
          type: 'string',
          description: 'Patch content (unified diff format)',
        },
        patchFile: {
          type: 'string',
          description: 'Path to patch file (alternative to patch)',
        },
        output: {
          type: 'string',
          description: 'Output file path',
        },
      },
      required: [],
    },
    handler: async ({ text, file, patch, patchFile, output }) => {
      try {
        const d = await getDiff();

        let sourceText = text || '';
        let patchContent = patch || '';

        if (file && !text) {
          const filePath = path.resolve(file);
          sourceText = await fs.readFile(filePath, 'utf-8');
        }

        if (patchFile && !patch) {
          const filePath = path.resolve(patchFile);
          patchContent = await fs.readFile(filePath, 'utf-8');
        }

        if (!sourceText && !file) {
          return { error: 'Either text or file is required' };
        }

        if (!patchContent) {
          return { error: 'Either patch or patchFile is required' };
        }

        const result = d.applyPatch(sourceText, patchContent);

        if (result === false) {
          return { error: 'Failed to apply patch - patch does not match source' };
        }

        if (output) {
          const outputPath = path.resolve(output);
          await fs.mkdir(path.dirname(outputPath), { recursive: true });
          await fs.writeFile(outputPath, result);
          return {
            success: true,
            output: outputPath,
          };
        }

        return {
          success: true,
          result,
          originalLength: sourceText.length,
          resultLength: result.length,
        };
      } catch (error) {
        return { error: `Failed to apply patch: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'json_format',
    description: 'Format, validate, and transform JSON',
    inputSchema: {
      type: 'object',
      properties: {
        json: {
          type: 'string',
          description: 'JSON string to format',
        },
        file: {
          type: 'string',
          description: 'Path to JSON file (alternative to json)',
        },
        indent: {
          type: 'number',
          description: 'Indentation spaces. Default: 2',
        },
        sortKeys: {
          type: 'boolean',
          description: 'Sort object keys alphabetically. Default: false',
        },
        minify: {
          type: 'boolean',
          description: 'Minify output (no whitespace). Default: false',
        },
        output: {
          type: 'string',
          description: 'Output file path',
        },
      },
      required: [],
    },
    handler: async ({ json, file, indent = 2, sortKeys = false, minify = false, output }) => {
      try {
        let jsonString = json;

        if (file && !json) {
          const filePath = path.resolve(file);
          jsonString = await fs.readFile(filePath, 'utf-8');
        }

        if (!jsonString) {
          return { error: 'Either json or file is required' };
        }

        // Parse to validate
        let parsed;
        try {
          parsed = JSON.parse(jsonString);
        } catch (e) {
          return {
            error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
            valid: false,
          };
        }

        // Sort keys if requested
        if (sortKeys) {
          parsed = sortObjectKeys(parsed);
        }

        // Format output
        const formatted = minify
          ? JSON.stringify(parsed)
          : JSON.stringify(parsed, null, indent);

        if (output) {
          const outputPath = path.resolve(output);
          await fs.mkdir(path.dirname(outputPath), { recursive: true });
          await fs.writeFile(outputPath, formatted);
          return {
            success: true,
            valid: true,
            output: outputPath,
          };
        }

        return {
          success: true,
          valid: true,
          formatted,
          originalSize: jsonString.length,
          formattedSize: formatted.length,
        };
      } catch (error) {
        return { error: `Failed to format JSON: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'code_stats',
    description: 'Calculate code statistics (lines, characters, complexity metrics)',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Code to analyze',
        },
        file: {
          type: 'string',
          description: 'File path to analyze (alternative to code)',
        },
        language: {
          type: 'string',
          description: 'Language for language-specific analysis',
        },
      },
      required: [],
    },
    handler: async ({ code, file, language }) => {
      try {
        let sourceCode = code;

        if (file && !code) {
          const filePath = path.resolve(file);
          sourceCode = await fs.readFile(filePath, 'utf-8');
        }

        if (!sourceCode) {
          return { error: 'Either code or file is required' };
        }

        const lines = sourceCode.split('\n');
        const nonEmptyLines = lines.filter(line => line.trim().length > 0);
        const commentLines = lines.filter(line => {
          const trimmed = line.trim();
          return trimmed.startsWith('//') ||
                 trimmed.startsWith('#') ||
                 trimmed.startsWith('/*') ||
                 trimmed.startsWith('*') ||
                 trimmed.startsWith('<!--');
        });

        // Basic complexity heuristics
        const conditionals = (sourceCode.match(/\b(if|else|switch|case|for|while|do|try|catch)\b/g) || []).length;
        const functions = (sourceCode.match(/\b(function|const\s+\w+\s*=|let\s+\w+\s*=|def\s+|fn\s+|func\s+)\s*[\w<>]*\s*\(/g) || []).length;
        const classes = (sourceCode.match(/\b(class|interface|struct|enum)\s+\w+/g) || []).length;
        const imports = (sourceCode.match(/\b(import|require|from|include)\b/g) || []).length;

        // Calculate cyclomatic complexity approximation
        const cyclomaticComplexity = 1 + conditionals;

        return {
          success: true,
          stats: {
            lines: {
              total: lines.length,
              code: nonEmptyLines.length - commentLines.length,
              comments: commentLines.length,
              blank: lines.length - nonEmptyLines.length,
            },
            characters: {
              total: sourceCode.length,
              withoutWhitespace: sourceCode.replace(/\s/g, '').length,
            },
            structure: {
              functions,
              classes,
              imports,
              conditionals,
            },
            complexity: {
              cyclomatic: cyclomaticComplexity,
              density: (conditionals / Math.max(nonEmptyLines.length, 1)).toFixed(3),
            },
          },
        };
      } catch (error) {
        return { error: `Failed to analyze code: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'base64_encode',
    description: 'Encode text or file to Base64',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to encode',
        },
        file: {
          type: 'string',
          description: 'File path to encode (alternative to text)',
        },
        urlSafe: {
          type: 'boolean',
          description: 'Use URL-safe Base64 encoding. Default: false',
        },
      },
      required: [],
    },
    handler: async ({ text, file, urlSafe = false }) => {
      try {
        let data: Buffer;

        if (file) {
          const filePath = path.resolve(file);
          data = await fs.readFile(filePath);
        } else if (text) {
          data = Buffer.from(text, 'utf-8');
        } else {
          return { error: 'Either text or file is required' };
        }

        let encoded = data.toString('base64');

        if (urlSafe) {
          encoded = encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        }

        return {
          success: true,
          encoded,
          originalSize: data.length,
          encodedSize: encoded.length,
        };
      } catch (error) {
        return { error: `Failed to encode: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'base64_decode',
    description: 'Decode Base64 to text or file',
    inputSchema: {
      type: 'object',
      properties: {
        encoded: {
          type: 'string',
          description: 'Base64 encoded string',
        },
        output: {
          type: 'string',
          description: 'Output file path (for binary data)',
        },
        urlSafe: {
          type: 'boolean',
          description: 'Input is URL-safe Base64. Default: false',
        },
      },
      required: ['encoded'],
    },
    handler: async ({ encoded, output, urlSafe = false }) => {
      try {
        let base64 = encoded;

        if (urlSafe) {
          base64 = base64.replace(/-/g, '+').replace(/_/g, '/');
          // Add padding
          while (base64.length % 4) {
            base64 += '=';
          }
        }

        const data = Buffer.from(base64, 'base64');

        if (output) {
          const outputPath = path.resolve(output);
          await fs.mkdir(path.dirname(outputPath), { recursive: true });
          await fs.writeFile(outputPath, data);
          return {
            success: true,
            output: outputPath,
            size: data.length,
          };
        }

        // Try to decode as UTF-8 text
        const decoded = data.toString('utf-8');

        return {
          success: true,
          decoded,
          size: data.length,
        };
      } catch (error) {
        return { error: `Failed to decode: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'url_encode',
    description: 'URL encode or decode text',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to encode or decode',
        },
        decode: {
          type: 'boolean',
          description: 'Decode instead of encode. Default: false',
        },
        component: {
          type: 'boolean',
          description: 'Use encodeURIComponent (encodes more chars). Default: true',
        },
      },
      required: ['text'],
    },
    handler: async ({ text, decode = false, component = true }) => {
      try {
        let result: string;

        if (decode) {
          result = component ? decodeURIComponent(text) : decodeURI(text);
        } else {
          result = component ? encodeURIComponent(text) : encodeURI(text);
        }

        return {
          success: true,
          result,
          operation: decode ? 'decode' : 'encode',
        };
      } catch (error) {
        return { error: `Failed to ${decode ? 'decode' : 'encode'} URL: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },
];

/**
 * Recursively sort object keys
 */
function sortObjectKeys(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }

  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj)
      .sort()
      .reduce((result: any, key) => {
        result[key] = sortObjectKeys(obj[key]);
        return result;
      }, {});
  }

  return obj;
}
