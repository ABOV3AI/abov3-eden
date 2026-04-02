/**
 * ABOV3 Eden - Database Tools
 * Tools for querying SQLite, PostgreSQL, and MySQL databases
 */

import path from 'path';
import type { MCPTool, ToolResult } from './index.js';
import { textResult, errorResult, jsonResult } from './index.js';
import { logger } from '../utils/logger.js';
import { getConfig } from '../config.js';

// SQLite types (better-sqlite3)
type SQLiteDatabase = {
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: unknown[]): unknown;
  };
  exec(sql: string): void;
  close(): void;
};

// Database connection cache
const sqliteConnections: Map<string, SQLiteDatabase> = new Map();

/**
 * Get or create SQLite connection
 */
async function getSQLiteConnection(dbPath: string): Promise<SQLiteDatabase> {
  if (sqliteConnections.has(dbPath)) {
    return sqliteConnections.get(dbPath)!;
  }

  const Database = await import('better-sqlite3').then(m => m.default);
  const db = new Database(dbPath);
  sqliteConnections.set(dbPath, db);
  return db;
}

/**
 * Close all database connections
 */
export function closeAllConnections(): void {
  for (const [path, db] of sqliteConnections) {
    try {
      db.close();
      logger.debug(`Closed SQLite connection: ${path}`);
    } catch (error) {
      logger.error(`Error closing SQLite connection: ${path}`, error);
    }
  }
  sqliteConnections.clear();
}

// ============================================================
// SQLite Query Tool
// ============================================================
const sqliteQueryTool: MCPTool = {
  name: 'sqlite_query',
  description: 'Execute a read-only SQL query on a SQLite database and return results.',
  inputSchema: {
    type: 'object',
    properties: {
      database: {
        type: 'string',
        description: 'Path to the SQLite database file',
      },
      query: {
        type: 'string',
        description: 'SQL SELECT query to execute',
      },
      params: {
        type: 'array',
        description: 'Query parameters for prepared statements',
      },
    },
    required: ['database', 'query'],
  },
  async execute(args, context): Promise<ToolResult> {
    const config = getConfig();
    if (!config.database.sqlite.enabled) {
      return errorResult('SQLite is not enabled in configuration');
    }

    const { database, query, params = [] } = args as {
      database: string;
      query: string;
      params?: unknown[];
    };

    // Validate database path
    const pathValidation = context.security.validatePath(database);
    if (!pathValidation.valid) {
      return errorResult(pathValidation.error || 'Invalid database path');
    }

    const dbPath = path.isAbsolute(database)
      ? database
      : path.join(context.workingDirectory, database);

    // Only allow SELECT queries
    const normalizedQuery = query.trim().toUpperCase();
    if (!normalizedQuery.startsWith('SELECT') && !normalizedQuery.startsWith('PRAGMA')) {
      return errorResult('Only SELECT and PRAGMA queries are allowed. Use sqlite_execute for modifications.');
    }

    try {
      const db = await getSQLiteConnection(dbPath);
      const stmt = db.prepare(query);
      const rows = stmt.all(...params);

      return jsonResult({
        query,
        rows,
        rowCount: rows.length,
      });
    } catch (error) {
      return errorResult(`SQLite query failed: ${(error as Error).message}`);
    }
  },
};

// ============================================================
// SQLite Execute Tool
// ============================================================
const sqliteExecuteTool: MCPTool = {
  name: 'sqlite_execute',
  description: 'Execute a SQL statement (INSERT, UPDATE, DELETE, CREATE) on a SQLite database.',
  inputSchema: {
    type: 'object',
    properties: {
      database: {
        type: 'string',
        description: 'Path to the SQLite database file',
      },
      statement: {
        type: 'string',
        description: 'SQL statement to execute',
      },
      params: {
        type: 'array',
        description: 'Statement parameters for prepared statements',
      },
    },
    required: ['database', 'statement'],
  },
  async execute(args, context): Promise<ToolResult> {
    const config = getConfig();
    if (!config.database.sqlite.enabled) {
      return errorResult('SQLite is not enabled in configuration');
    }

    const { database, statement, params = [] } = args as {
      database: string;
      statement: string;
      params?: unknown[];
    };

    // Validate database path
    const pathValidation = context.security.validatePath(database);
    if (!pathValidation.valid) {
      return errorResult(pathValidation.error || 'Invalid database path');
    }

    const dbPath = path.isAbsolute(database)
      ? database
      : path.join(context.workingDirectory, database);

    try {
      const db = await getSQLiteConnection(dbPath);
      const stmt = db.prepare(statement);
      const result = stmt.run(...params);

      return jsonResult({
        statement,
        changes: result.changes,
        lastInsertRowid: Number(result.lastInsertRowid),
      });
    } catch (error) {
      return errorResult(`SQLite execute failed: ${(error as Error).message}`);
    }
  },
};

// ============================================================
// Database List Tables Tool
// ============================================================
const dbListTablesTool: MCPTool = {
  name: 'db_list_tables',
  description: 'List all tables in a database.',
  inputSchema: {
    type: 'object',
    properties: {
      database: {
        type: 'string',
        description: 'Path to the SQLite database file (or connection identifier for other DBs)',
      },
      type: {
        type: 'string',
        description: 'Database type: "sqlite" (default), "postgres", "mysql"',
        enum: ['sqlite', 'postgres', 'mysql'],
        default: 'sqlite',
      },
    },
    required: ['database'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { database, type = 'sqlite' } = args as {
      database: string;
      type?: 'sqlite' | 'postgres' | 'mysql';
    };

    if (type === 'sqlite') {
      const config = getConfig();
      if (!config.database.sqlite.enabled) {
        return errorResult('SQLite is not enabled in configuration');
      }

      const pathValidation = context.security.validatePath(database);
      if (!pathValidation.valid) {
        return errorResult(pathValidation.error || 'Invalid database path');
      }

      const dbPath = path.isAbsolute(database)
        ? database
        : path.join(context.workingDirectory, database);

      try {
        const db = await getSQLiteConnection(dbPath);
        const stmt = db.prepare(`
          SELECT name, type
          FROM sqlite_master
          WHERE type IN ('table', 'view')
          AND name NOT LIKE 'sqlite_%'
          ORDER BY type, name
        `);
        const tables = stmt.all() as { name: string; type: string }[];

        return jsonResult({
          database,
          tables: tables.map(t => ({ name: t.name, type: t.type })),
          count: tables.length,
        });
      } catch (error) {
        return errorResult(`Failed to list tables: ${(error as Error).message}`);
      }
    }

    // PostgreSQL and MySQL would need optional dependencies
    return errorResult(`Database type "${type}" support requires additional configuration`);
  },
};

// ============================================================
// Database Describe Table Tool
// ============================================================
const dbDescribeTableTool: MCPTool = {
  name: 'db_describe_table',
  description: 'Get the schema/structure of a database table.',
  inputSchema: {
    type: 'object',
    properties: {
      database: {
        type: 'string',
        description: 'Path to the SQLite database file',
      },
      table: {
        type: 'string',
        description: 'Name of the table to describe',
      },
      type: {
        type: 'string',
        description: 'Database type: "sqlite" (default)',
        enum: ['sqlite', 'postgres', 'mysql'],
        default: 'sqlite',
      },
    },
    required: ['database', 'table'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { database, table, type = 'sqlite' } = args as {
      database: string;
      table: string;
      type?: 'sqlite' | 'postgres' | 'mysql';
    };

    if (type === 'sqlite') {
      const config = getConfig();
      if (!config.database.sqlite.enabled) {
        return errorResult('SQLite is not enabled in configuration');
      }

      const pathValidation = context.security.validatePath(database);
      if (!pathValidation.valid) {
        return errorResult(pathValidation.error || 'Invalid database path');
      }

      const dbPath = path.isAbsolute(database)
        ? database
        : path.join(context.workingDirectory, database);

      try {
        const db = await getSQLiteConnection(dbPath);
        const stmt = db.prepare(`PRAGMA table_info("${table.replace(/"/g, '""')}")`);
        const columns = stmt.all() as Array<{
          cid: number;
          name: string;
          type: string;
          notnull: number;
          dflt_value: unknown;
          pk: number;
        }>;

        if (columns.length === 0) {
          return errorResult(`Table not found: ${table}`);
        }

        // Get indexes
        const indexStmt = db.prepare(`PRAGMA index_list("${table.replace(/"/g, '""')}")`);
        const indexes = indexStmt.all() as Array<{
          seq: number;
          name: string;
          unique: number;
        }>;

        return jsonResult({
          table,
          columns: columns.map(c => ({
            name: c.name,
            type: c.type,
            nullable: c.notnull === 0,
            defaultValue: c.dflt_value,
            primaryKey: c.pk > 0,
          })),
          indexes: indexes.map(i => ({
            name: i.name,
            unique: i.unique === 1,
          })),
        });
      } catch (error) {
        return errorResult(`Failed to describe table: ${(error as Error).message}`);
      }
    }

    return errorResult(`Database type "${type}" support requires additional configuration`);
  },
};

// ============================================================
// SQLite Create Database Tool
// ============================================================
const sqliteCreateDatabaseTool: MCPTool = {
  name: 'sqlite_create_database',
  description: 'Create a new SQLite database file.',
  inputSchema: {
    type: 'object',
    properties: {
      database: {
        type: 'string',
        description: 'Path for the new SQLite database file',
      },
    },
    required: ['database'],
  },
  async execute(args, context): Promise<ToolResult> {
    const config = getConfig();
    if (!config.database.sqlite.enabled) {
      return errorResult('SQLite is not enabled in configuration');
    }

    const { database } = args as { database: string };

    const pathValidation = context.security.validatePath(database);
    if (!pathValidation.valid) {
      return errorResult(pathValidation.error || 'Invalid database path');
    }

    const dbPath = path.isAbsolute(database)
      ? database
      : path.join(context.workingDirectory, database);

    try {
      const db = await getSQLiteConnection(dbPath);
      // Create a simple test to ensure it's working
      db.exec('SELECT 1');
      return textResult(`Successfully created SQLite database: ${database}`);
    } catch (error) {
      return errorResult(`Failed to create database: ${(error as Error).message}`);
    }
  },
};

// ============================================================
// Export all database tools
// ============================================================
export const databaseTools: MCPTool[] = [
  sqliteQueryTool,
  sqliteExecuteTool,
  dbListTablesTool,
  dbDescribeTableTool,
  sqliteCreateDatabaseTool,
];
