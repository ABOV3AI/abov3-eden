/**
 * ABOV3 Eden - Stats Tracking Module
 * Tracks server statistics, request counts, and logs
 */

import os from 'os';
import type { EdenConfig } from './config.js';

/**
 * Log entry interface
 */
export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
}

/**
 * Stats data interface
 */
export interface StatsData {
  startTime: Date;
  requests: number;
  toolExecutions: number;
  tools: number;
  uptime: number;
  system: {
    platform: string;
    arch: string;
    nodeVersion: string;
    cpuCores: number;
    memoryTotal: number;
    memoryUsed: number;
    memoryFree: number;
    workingDirectory: string;
    port: number;
  };
}

/**
 * Stats tracker class
 */
class StatsTracker {
  private startTime: Date = new Date();
  private requestCount: number = 0;
  private toolExecutionCount: number = 0;
  private toolCount: number = 0;
  private logs: LogEntry[] = [];
  private maxLogs: number = 500;
  private config: EdenConfig | null = null;

  /**
   * Set configuration
   */
  setConfig(config: EdenConfig): void {
    this.config = config;
  }

  /**
   * Set tool count
   */
  setToolCount(count: number): void {
    this.toolCount = count;
  }

  /**
   * Increment request count
   */
  incrementRequests(): void {
    this.requestCount++;
  }

  /**
   * Increment tool execution count
   */
  incrementToolExecutions(): void {
    this.toolExecutionCount++;
  }

  /**
   * Add a log entry
   */
  addLog(level: LogEntry['level'], message: string): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };

    this.logs.push(entry);

    // Trim old logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
  }

  /**
   * Get all logs
   */
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Clear logs
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * Get current stats
   */
  getStats(): StatsData {
    const memTotal = os.totalmem();
    const memFree = os.freemem();

    return {
      startTime: this.startTime,
      requests: this.requestCount,
      toolExecutions: this.toolExecutionCount,
      tools: this.toolCount,
      uptime: Math.floor((Date.now() - this.startTime.getTime()) / 1000),
      system: {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        cpuCores: os.cpus().length,
        memoryTotal: memTotal,
        memoryUsed: memTotal - memFree,
        memoryFree: memFree,
        workingDirectory: process.cwd(),
        port: this.config?.server.port || 3100,
      },
    };
  }

  /**
   * Get configuration (sanitized)
   */
  getConfig(): EdenConfig | null {
    return this.config;
  }

  /**
   * Reset stats
   */
  reset(): void {
    this.startTime = new Date();
    this.requestCount = 0;
    this.toolExecutionCount = 0;
    this.logs = [];
  }
}

// Export singleton instance
export const stats = new StatsTracker();
