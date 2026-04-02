/**
 * ComfyUI Manager Service
 * Manages the ComfyUI process lifecycle - starting, stopping, health checks
 * Auto-detects bundled ComfyUI installation in ./comfyui folder
 */

import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';
import type { EdenConfig } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to bundled ComfyUI (relative to Eden root)
const BUNDLED_COMFYUI_PATH = path.resolve(__dirname, '..', '..', 'comfyui');
const BUNDLED_PYTHON_PATH = path.join(BUNDLED_COMFYUI_PATH, 'venv', 'Scripts', 'python.exe');
const BUNDLED_PYTHON_UNIX = path.join(BUNDLED_COMFYUI_PATH, 'venv', 'bin', 'python');

export interface ComfyUIStatus {
  enabled: boolean;
  running: boolean;
  url: string;
  pid?: number;
  uptime?: number;
  lastHealthCheck?: string;
  error?: string;
  bundled?: boolean;
  installPath?: string;
}

/**
 * ComfyUI Manager - Singleton service for managing ComfyUI
 */
class ComfyUIManager {
  private static instance: ComfyUIManager | null = null;
  private config: EdenConfig['comfyui'] | null = null;
  private process: ChildProcess | null = null;
  private startTime: number | null = null;
  private lastHealthCheck: Date | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private isStarting: boolean = false;
  private lastError: string | null = null;
  private isBundled: boolean = false;
  private actualPath: string | null = null;
  private actualPythonPath: string | null = null;

  private constructor() {}

  static getInstance(): ComfyUIManager {
    if (!ComfyUIManager.instance) {
      ComfyUIManager.instance = new ComfyUIManager();
    }
    return ComfyUIManager.instance;
  }

  /**
   * Check if bundled ComfyUI exists
   */
  private checkBundledComfyUI(): { exists: boolean; path?: string; pythonPath?: string } {
    const mainPy = path.join(BUNDLED_COMFYUI_PATH, 'main.py');
    if (!fs.existsSync(mainPy)) {
      return { exists: false };
    }

    // Check for venv Python
    const pythonPath = process.platform === 'win32' ? BUNDLED_PYTHON_PATH : BUNDLED_PYTHON_UNIX;
    if (fs.existsSync(pythonPath)) {
      return { exists: true, path: BUNDLED_COMFYUI_PATH, pythonPath };
    }

    // No venv, but ComfyUI exists - might use system Python
    return { exists: true, path: BUNDLED_COMFYUI_PATH };
  }

  /**
   * Initialize the ComfyUI manager with configuration
   * Auto-detects bundled ComfyUI if no path is configured
   */
  async initialize(config: EdenConfig['comfyui']): Promise<void> {
    this.config = { ...config };

    // Check for bundled ComfyUI first
    const bundled = this.checkBundledComfyUI();
    if (bundled.exists) {
      logger.info(`[ComfyUI] Found bundled ComfyUI at ${bundled.path}`);
      this.isBundled = true;
      this.actualPath = bundled.path!;
      this.actualPythonPath = bundled.pythonPath || null;

      // Override config if not explicitly set
      if (!this.config.path) {
        this.config.path = bundled.path!;
        this.config.enabled = true;
      }
      if (!this.config.pythonPath && bundled.pythonPath) {
        this.config.pythonPath = bundled.pythonPath;
      }
    } else {
      this.actualPath = config.path || null;
      this.actualPythonPath = config.pythonPath || null;
    }

    if (!this.config.enabled) {
      logger.info('[ComfyUI] ComfyUI is disabled in configuration');
      return;
    }

    if (!this.actualPath) {
      logger.warn('[ComfyUI] ComfyUI not found. Run setup-comfyui.bat to install.');
      this.lastError = 'ComfyUI not installed. Run setup-comfyui.bat to install.';
      return;
    }

    // Validate ComfyUI installation
    const mainPy = path.join(this.actualPath, 'main.py');
    if (!fs.existsSync(mainPy)) {
      logger.error(`[ComfyUI] main.py not found at ${mainPy} - please check your ComfyUI path`);
      this.lastError = `ComfyUI not found at path: ${this.actualPath}`;
      return;
    }

    logger.info(`[ComfyUI] Using ComfyUI at ${this.actualPath}${this.isBundled ? ' (bundled)' : ''}`);

    // Check if ComfyUI is already running
    const isRunning = await this.checkHealth();
    if (isRunning) {
      logger.info('[ComfyUI] ComfyUI is already running');
      this.startHealthCheckLoop();
      return;
    }

    // Auto-start if configured
    if (this.config.autoStart) {
      await this.start();
    }
  }

  /**
   * Start ComfyUI process
   */
  async start(): Promise<boolean> {
    if (!this.config || !this.config.enabled) {
      logger.warn('[ComfyUI] Cannot start - not enabled or not configured');
      return false;
    }

    if (!this.actualPath) {
      logger.warn('[ComfyUI] Cannot start - ComfyUI not installed. Run setup-comfyui.bat to install.');
      this.lastError = 'ComfyUI not installed. Run setup-comfyui.bat to install.';
      return false;
    }

    if (this.isStarting) {
      logger.warn('[ComfyUI] Already starting...');
      return false;
    }

    if (this.process) {
      logger.warn('[ComfyUI] Already running');
      return true;
    }

    // Check if already running externally
    const isRunning = await this.checkHealth();
    if (isRunning) {
      logger.info('[ComfyUI] ComfyUI is already running externally');
      this.startHealthCheckLoop();
      return true;
    }

    this.isStarting = true;
    this.lastError = null;

    try {
      const { host, port, extraArgs } = this.config;
      const comfyPath = this.actualPath;

      // Determine Python executable - prefer bundled venv Python
      const python = this.actualPythonPath || (process.platform === 'win32' ? 'python' : 'python3');

      // Build arguments
      const args = [
        'main.py',
        '--listen', host,
        '--port', String(port),
        ...(extraArgs || []),
      ];

      logger.info(`[ComfyUI] Starting: ${python} ${args.join(' ')}`);
      logger.info(`[ComfyUI] Working directory: ${comfyPath}`);

      // Spawn ComfyUI process
      this.process = spawn(python, args, {
        cwd: comfyPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        shell: process.platform === 'win32', // Use shell on Windows for better compatibility
      });

      this.startTime = Date.now();

      // Handle stdout
      this.process.stdout?.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          logger.debug(`[ComfyUI] ${output}`);
        }
      });

      // Handle stderr
      this.process.stderr?.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          // ComfyUI logs to stderr, filter out routine messages
          if (output.includes('error') || output.includes('Error') || output.includes('ERROR')) {
            logger.error(`[ComfyUI] ${output}`);
          } else {
            logger.debug(`[ComfyUI] ${output}`);
          }
        }
      });

      // Handle process exit
      this.process.on('exit', (code, signal) => {
        logger.info(`[ComfyUI] Process exited with code ${code}, signal ${signal}`);
        this.process = null;
        this.startTime = null;
        this.lastHealthCheck = null; // Clear health check when process exits
        this.stopHealthCheckLoop();
        if (code !== 0 && code !== null) {
          this.lastError = `ComfyUI exited with code ${code}`;
        }
      });

      // Handle process error
      this.process.on('error', (err) => {
        logger.error(`[ComfyUI] Process error:`, err);
        this.lastError = err.message;
        this.process = null;
        this.startTime = null;
      });

      // Wait for ComfyUI to be ready
      const ready = await this.waitForReady(60000); // 60 second timeout

      if (ready) {
        logger.info(`[ComfyUI] Started successfully on http://${host}:${port}`);
        this.startHealthCheckLoop();
        return true;
      } else {
        logger.error('[ComfyUI] Failed to start within timeout');
        this.lastError = 'ComfyUI failed to start within timeout';
        await this.stop();
        return false;
      }

    } catch (error: any) {
      logger.error('[ComfyUI] Failed to start:', error);
      this.lastError = error.message;
      return false;
    } finally {
      this.isStarting = false;
    }
  }

  /**
   * Wait for ComfyUI to be ready
   */
  private async waitForReady(timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();
    const checkInterval = 2000; // Check every 2 seconds

    while (Date.now() - startTime < timeoutMs) {
      if (await this.checkHealth()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    return false;
  }

  /**
   * Stop ComfyUI process
   */
  async stop(): Promise<void> {
    this.stopHealthCheckLoop();

    if (!this.process) {
      logger.info('[ComfyUI] Not running');
      return;
    }

    logger.info('[ComfyUI] Stopping...');

    return new Promise((resolve) => {
      if (!this.process) {
        resolve();
        return;
      }

      // Set up exit handler
      this.process.once('exit', () => {
        this.process = null;
        this.startTime = null;
        logger.info('[ComfyUI] Stopped');
        resolve();
      });

      // Try graceful shutdown first
      if (process.platform === 'win32') {
        // Windows: use taskkill
        spawn('taskkill', ['/pid', String(this.process.pid), '/f', '/t']);
      } else {
        // Unix: send SIGTERM
        this.process.kill('SIGTERM');
      }

      // Force kill after 5 seconds
      setTimeout(() => {
        if (this.process) {
          logger.warn('[ComfyUI] Force killing...');
          this.process.kill('SIGKILL');
        }
      }, 5000);
    });
  }

  /**
   * Restart ComfyUI
   */
  async restart(): Promise<boolean> {
    await this.stop();
    return await this.start();
  }

  /**
   * Check if ComfyUI is healthy/responsive
   */
  async checkHealth(): Promise<boolean> {
    if (!this.config) return false;

    const url = `http://${this.config.host}:${this.config.port}/system_stats`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        this.lastHealthCheck = new Date();
        this.lastError = null;
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Start periodic health checks
   */
  private startHealthCheckLoop(): void {
    if (this.healthCheckInterval) return;

    this.healthCheckInterval = setInterval(async () => {
      const healthy = await this.checkHealth();
      if (!healthy && this.process) {
        logger.warn('[ComfyUI] Health check failed - process may have crashed');
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Stop health check loop
   */
  private stopHealthCheckLoop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Get ComfyUI status
   */
  getStatus(): ComfyUIStatus {
    const running = this.process !== null || this.lastHealthCheck !== null;
    const url = this.config
      ? `http://${this.config.host}:${this.config.port}`
      : 'http://127.0.0.1:8188';

    return {
      enabled: this.config?.enabled ?? false,
      running,
      url,
      pid: this.process?.pid,
      uptime: this.startTime ? Date.now() - this.startTime : undefined,
      lastHealthCheck: this.lastHealthCheck?.toISOString(),
      error: this.lastError || undefined,
      bundled: this.isBundled,
      installPath: this.actualPath || undefined,
    };
  }

  /**
   * Get ComfyUI URL for API calls
   */
  getUrl(): string {
    if (!this.config) return 'http://127.0.0.1:8188';
    return `http://${this.config.host}:${this.config.port}`;
  }

  /**
   * Get default checkpoint model name
   */
  getDefaultModel(): string {
    return this.config?.models.checkpointDefault || 'sd_xl_base_1.0.safetensors';
  }

  /**
   * Check if ComfyUI is configured and available
   */
  isAvailable(): boolean {
    return this.config?.enabled === true && this.lastHealthCheck !== null;
  }

  /**
   * Force reset the ComfyUI manager state
   * Used when the UI gets stuck showing incorrect state
   */
  async forceReset(): Promise<void> {
    logger.info('[ComfyUI] Force resetting state...');

    // Stop health check loop
    this.stopHealthCheckLoop();

    // Kill any lingering process
    if (this.process) {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(this.process.pid), '/f', '/t']);
        } else {
          this.process.kill('SIGKILL');
        }
      } catch (e) {
        // Ignore errors
      }
    }

    // Clear all state
    this.process = null;
    this.startTime = null;
    this.lastHealthCheck = null;
    this.lastError = null;
    this.isStarting = false;

    logger.info('[ComfyUI] State reset complete');
  }
}

// Export singleton instance
export const comfyuiManager = ComfyUIManager.getInstance();

// Export helper function for getting ComfyUI URL (used by tools)
export function getComfyUIUrl(): string {
  return comfyuiManager.getUrl();
}

// Export helper function for getting default model (used by tools)
export function getComfyUIDefaultModel(): string {
  return comfyuiManager.getDefaultModel();
}
