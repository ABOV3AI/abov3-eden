/**
 * ABOV3 Eden - Configuration Module
 * Loads and manages server configuration
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseSizeString, type SecurityConfig } from './utils/security.js';
import { logger, setLogLevel, type LogLevel } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Server configuration interface
 */
export interface EdenConfig {
  server: {
    port: number;
    host: string;
  };
  workspace: {
    roots: string[]; // List of directories to search for project folders
  };
  cors: {
    origins: string[];
    enabled: boolean;
  };
  security: SecurityConfig;
  database: {
    sqlite: { enabled: boolean };
    postgres: { enabled: boolean; connectionString?: string };
    mysql: { enabled: boolean; connectionString?: string };
  };
  logging: {
    level: LogLevel;
  };
  comfyui: {
    enabled: boolean;
    autoStart: boolean; // Start ComfyUI automatically with Eden
    path: string; // Path to ComfyUI installation directory
    host: string;
    port: number;
    pythonPath?: string; // Custom Python path (optional)
    extraArgs?: string[]; // Extra command line arguments
    models: {
      checkpointDefault: string; // Default checkpoint model name
    };
  };
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: EdenConfig = {
  server: {
    port: 3100,
    host: '127.0.0.1',
  },
  workspace: {
    roots: [process.cwd()], // Default to current working directory
  },
  cors: {
    enabled: true,
    origins: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'https://exodus.abov3.com',
    ],
  },
  security: {
    allowedPaths: [],
    allowAllPaths: true, // Default to allowing all paths for ease of use
    blockedCommands: [],
    maxFileSize: 100 * 1024 * 1024, // 100MB
    commandTimeout: 30000, // 30 seconds
  },
  database: {
    sqlite: { enabled: true },
    postgres: { enabled: false },
    mysql: { enabled: false },
  },
  logging: {
    level: 'info',
  },
  comfyui: {
    enabled: false, // Disabled by default until user configures path
    autoStart: true,
    path: '', // User must configure this
    host: '127.0.0.1',
    port: 8188,
    models: {
      checkpointDefault: 'sd_xl_base_1.0.safetensors',
    },
  },
};

/**
 * Load configuration from file or environment
 */
export function loadConfig(configPath?: string): EdenConfig {
  const config: EdenConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

  // Try to load from config file
  const configFile = configPath || path.join(__dirname, '..', 'config.json');

  if (fs.existsSync(configFile)) {
    try {
      const fileContent = fs.readFileSync(configFile, 'utf-8');
      const fileConfig = JSON.parse(fileContent);
      mergeConfig(config as unknown as Record<string, unknown>, fileConfig);
      logger.info(`Loaded configuration from ${configFile}`);
    } catch (error) {
      logger.warn(`Failed to load config file: ${error}`);
    }
  }

  // Override with environment variables
  if (process.env.EDEN_PORT) {
    config.server.port = parseInt(process.env.EDEN_PORT, 10);
  }
  if (process.env.EDEN_HOST) {
    config.server.host = process.env.EDEN_HOST;
  }
  if (process.env.EDEN_CORS_ORIGINS) {
    config.cors.origins = process.env.EDEN_CORS_ORIGINS.split(',').map(s => s.trim());
  }
  if (process.env.EDEN_LOG_LEVEL) {
    config.logging.level = process.env.EDEN_LOG_LEVEL as LogLevel;
  }
  if (process.env.EDEN_MAX_FILE_SIZE) {
    config.security.maxFileSize = parseSizeString(process.env.EDEN_MAX_FILE_SIZE);
  }
  if (process.env.EDEN_COMMAND_TIMEOUT) {
    config.security.commandTimeout = parseInt(process.env.EDEN_COMMAND_TIMEOUT, 10);
  }
  if (process.env.EDEN_ALLOWED_PATHS) {
    config.security.allowedPaths = process.env.EDEN_ALLOWED_PATHS.split(',').map(s => s.trim());
    config.security.allowAllPaths = false;
  }
  if (process.env.EDEN_WORKSPACE_ROOTS) {
    config.workspace.roots = process.env.EDEN_WORKSPACE_ROOTS.split(',').map(s => s.trim());
  }

  // Database connection strings from environment
  if (process.env.POSTGRES_URL) {
    config.database.postgres.enabled = true;
    config.database.postgres.connectionString = process.env.POSTGRES_URL;
  }
  if (process.env.MYSQL_URL) {
    config.database.mysql.enabled = true;
    config.database.mysql.connectionString = process.env.MYSQL_URL;
  }

  // ComfyUI configuration from environment
  if (process.env.COMFYUI_PATH) {
    config.comfyui.enabled = true;
    config.comfyui.path = process.env.COMFYUI_PATH;
  }
  if (process.env.COMFYUI_HOST) {
    config.comfyui.host = process.env.COMFYUI_HOST;
  }
  if (process.env.COMFYUI_PORT) {
    config.comfyui.port = parseInt(process.env.COMFYUI_PORT, 10);
  }
  if (process.env.COMFYUI_PYTHON) {
    config.comfyui.pythonPath = process.env.COMFYUI_PYTHON;
  }
  if (process.env.COMFYUI_AUTO_START) {
    config.comfyui.autoStart = process.env.COMFYUI_AUTO_START === 'true';
  }
  if (process.env.COMFYUI_MODEL) {
    config.comfyui.models.checkpointDefault = process.env.COMFYUI_MODEL;
  }

  // Apply log level
  setLogLevel(config.logging.level);

  return config;
}

/**
 * Deep merge configuration objects
 */
function mergeConfig(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object'
    ) {
      mergeConfig(
        target[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>
      );
    } else {
      target[key] = source[key];
    }
  }
}

/**
 * Validate configuration
 */
export function validateConfig(config: EdenConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.server.port < 1 || config.server.port > 65535) {
    errors.push(`Invalid port: ${config.server.port}`);
  }

  if (config.security.maxFileSize < 0) {
    errors.push(`Invalid maxFileSize: ${config.security.maxFileSize}`);
  }

  if (config.security.commandTimeout < 0) {
    errors.push(`Invalid commandTimeout: ${config.security.commandTimeout}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Export singleton config
let _config: EdenConfig | null = null;

export function getConfig(): EdenConfig {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}

export function setConfig(config: EdenConfig): void {
  _config = config;
}
