/**
 * ABOV3 Eden - Local MCP Server
 * Entry point for the HTTP server with web dashboard
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { loadConfig, validateConfig, type EdenConfig } from './config.js';
import { logger } from './utils/logger.js';
import { MCPServer } from './mcp-server.js';
import { toolRegistry, createMCPTools } from './tools/index.js';
import { comfyuiManager } from './services/comfyui-manager.js';
import { filesystemTools } from './tools/filesystem.js';
import { shellTools } from './tools/shell.js';
import { databaseTools, closeAllConnections } from './tools/database.js';
import { systemTools } from './tools/system.js';
import { extendedTools } from './tools/extended.js';
// New extended tool categories
import { documentTools } from './tools/documents.js';
import { imageTools } from './tools/images.js';
import { multimediaTools } from './tools/multimedia.js';
import { analyticsTools } from './tools/analytics.js';
import { researchTools } from './tools/research.js';
import { communicationTools } from './tools/communication.js';
import { devTools } from './tools/devtools.js';
import { productivityTools } from './tools/productivity.js';
import { aiTools } from './tools/ai-tools.js';
import { scienceTools } from './tools/science.js';
import { slmTools } from './tools/slm-tools.js';
import { trainingTools } from './tools/training-tools.js';
import { stats } from './stats.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ASCII Banner
 */
const BANNER = `
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║     █████╗ ██████╗  ██████╗ ██╗   ██╗██████╗                  ║
║    ██╔══██╗██╔══██╗██╔═══██╗██║   ██║╚════██╗                 ║
║    ███████║██████╔╝██║   ██║██║   ██║ █████╔╝                 ║
║    ██╔══██║██╔══██╗██║   ██║╚██╗ ██╔╝ ╚═══██╗                 ║
║    ██║  ██║██████╔╝╚██████╔╝ ╚████╔╝ ██████╔╝                 ║
║    ╚═╝  ╚═╝╚═════╝  ╚═════╝   ╚═══╝  ╚═════╝                  ║
║                                                               ║
║    ███████╗██████╗ ███████╗███╗   ██╗                         ║
║    ██╔════╝██╔══██╗██╔════╝████╗  ██║                         ║
║    █████╗  ██║  ██║█████╗  ██╔██╗ ██║                         ║
║    ██╔══╝  ██║  ██║██╔══╝  ██║╚██╗██║                         ║
║    ███████╗██████╔╝███████╗██║ ╚████║                         ║
║    ╚══════╝╚═════╝ ╚══════╝╚═╝  ╚═══╝                         ║
║                                                               ║
║    Local MCP Server for ABOV3 Exodus                          ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`;

/**
 * Initialize and register all tools
 */
function registerTools(): void {
  logger.info('Registering tools...');

  // Register core tool categories (MCPTool format)
  toolRegistry.registerAll(filesystemTools);
  logger.debug(`Registered ${filesystemTools.length} filesystem tools`);

  toolRegistry.registerAll(shellTools);
  logger.debug(`Registered ${shellTools.length} shell tools`);

  toolRegistry.registerAll(databaseTools);
  logger.debug(`Registered ${databaseTools.length} database tools`);

  toolRegistry.registerAll(systemTools);
  logger.debug(`Registered ${systemTools.length} system tools`);

  toolRegistry.registerAll(extendedTools);
  logger.debug(`Registered ${extendedTools.length} extended tools`);

  // Register document and image tools (already in MCPTool format)
  toolRegistry.registerAll(documentTools);
  logger.debug(`Registered ${documentTools.length} document tools`);

  toolRegistry.registerAll(imageTools);
  logger.debug(`Registered ${imageTools.length} image tools`);

  // Register new extended tool categories (simplified Tool format - convert to MCPTool)
  const multimediaMCPTools = createMCPTools(multimediaTools);
  toolRegistry.registerAll(multimediaMCPTools);
  logger.debug(`Registered ${multimediaTools.length} multimedia tools`);

  const analyticsMCPTools = createMCPTools(analyticsTools);
  toolRegistry.registerAll(analyticsMCPTools);
  logger.debug(`Registered ${analyticsTools.length} analytics tools`);

  const researchMCPTools = createMCPTools(researchTools);
  toolRegistry.registerAll(researchMCPTools);
  logger.debug(`Registered ${researchTools.length} research tools`);

  const communicationMCPTools = createMCPTools(communicationTools);
  toolRegistry.registerAll(communicationMCPTools);
  logger.debug(`Registered ${communicationTools.length} communication tools`);

  const devMCPTools = createMCPTools(devTools);
  toolRegistry.registerAll(devMCPTools);
  logger.debug(`Registered ${devTools.length} dev tools`);

  const productivityMCPTools = createMCPTools(productivityTools);
  toolRegistry.registerAll(productivityMCPTools);
  logger.debug(`Registered ${productivityTools.length} productivity tools`);

  const aiMCPTools = createMCPTools(aiTools);
  toolRegistry.registerAll(aiMCPTools);
  logger.debug(`Registered ${aiTools.length} AI tools`);

  const scienceMCPTools = createMCPTools(scienceTools);
  toolRegistry.registerAll(scienceMCPTools);
  logger.debug(`Registered ${scienceTools.length} science tools`);

  const slmMCPTools = createMCPTools(slmTools);
  toolRegistry.registerAll(slmMCPTools);
  logger.debug(`Registered ${slmTools.length} SLM tools`);

  // Register training tools for model distillation and fine-tuning
  const trainingMCPTools = createMCPTools(trainingTools);
  toolRegistry.registerAll(trainingMCPTools);
  logger.debug(`Registered ${trainingTools.length} training tools`);

  logger.info(`Total tools registered: ${toolRegistry.size}`);

  // Update stats
  stats.setToolCount(toolRegistry.size);
}

/**
 * Create Express app with MCP endpoint and dashboard
 */
function createApp(config: EdenConfig, mcpServer: MCPServer): express.Application {
  const app = express();

  // Store config in stats
  stats.setConfig(config);

  // CORS configuration
  if (config.cors.enabled) {
    app.use(cors({
      origin: config.cors.origins,
      methods: ['POST', 'GET', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }));
  }

  // JSON body parser with size limit
  app.use(express.json({ limit: '10mb' }));

  // Serve static files from public directory
  const publicPath = path.join(__dirname, '..', 'public');
  app.use(express.static(publicPath));

  // Request logging and stats middleware
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.debug(`${req.method} ${req.path}`);
    stats.incrementRequests();
    stats.addLog('debug', `${req.method} ${req.path}`);
    next();
  });

  // ============================================================
  // Dashboard API Endpoints
  // ============================================================

  // Stats API
  app.get('/api/stats', (_req: Request, res: Response) => {
    res.json(stats.getStats());
  });

  // ComfyUI Status API
  app.get('/api/comfyui/status', (_req: Request, res: Response) => {
    res.json(comfyuiManager.getStatus());
  });

  // ComfyUI Control APIs
  app.post('/api/comfyui/start', async (_req: Request, res: Response) => {
    try {
      const success = await comfyuiManager.start();
      res.json({ success, status: comfyuiManager.getStatus() });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/comfyui/stop', async (_req: Request, res: Response) => {
    try {
      await comfyuiManager.stop();
      res.json({ success: true, status: comfyuiManager.getStatus() });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/comfyui/restart', async (_req: Request, res: Response) => {
    try {
      const success = await comfyuiManager.restart();
      res.json({ success, status: comfyuiManager.getStatus() });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ComfyUI Force Reset - clears stuck state
  app.post('/api/comfyui/reset', async (_req: Request, res: Response) => {
    try {
      await comfyuiManager.forceReset();
      res.json({ success: true, status: comfyuiManager.getStatus() });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ComfyUI install info
  app.get('/api/comfyui/install-info', (_req: Request, res: Response) => {
    const status = comfyuiManager.getStatus();
    const setupScript = path.join(__dirname, '..', 'setup-comfyui.bat');
    const scriptExists = fs.existsSync(setupScript);

    res.json({
      installed: status.enabled && !!status.installPath,
      scriptPath: scriptExists ? setupScript : null,
      instructions: [
        'To install ComfyUI for AI image generation:',
        '',
        '1. Open a terminal/command prompt',
        `2. Navigate to: ${path.dirname(setupScript)}`,
        '3. Run: setup-comfyui.bat',
        '',
        'The setup script will:',
        '- Download ComfyUI from GitHub',
        '- Install Python dependencies (PyTorch, etc.)',
        '- Download a Stable Diffusion model',
        '- Configure Eden to use ComfyUI',
        '',
        'This process may take 10-30 minutes depending on your internet speed.',
      ],
    });
  });

  // Logs API
  app.get('/api/logs', (_req: Request, res: Response) => {
    res.json({ logs: stats.getLogs() });
  });

  app.delete('/api/logs', (_req: Request, res: Response) => {
    stats.clearLogs();
    res.json({ success: true });
  });

  // Config API
  app.get('/api/config', (_req: Request, res: Response) => {
    res.json(stats.getConfig());
  });

  // ============================================================
  // Tool Management API Endpoints
  // ============================================================

  // Get all tools with their enabled states (for management UI)
  app.get('/api/tools/all', (_req: Request, res: Response) => {
    const tools = toolRegistry.getAllDefinitions();
    res.json({
      tools,
      count: tools.length,
      enabledCount: tools.filter(t => t.enabled).length,
    });
  });

  // Toggle a single tool on/off
  app.post('/api/tools/toggle', (req: Request, res: Response) => {
    const { name, enabled } = req.body;

    if (!name || typeof name !== 'string') {
      res.status(400).json({ success: false, error: 'Tool name is required' });
      return;
    }

    if (typeof enabled !== 'boolean') {
      res.status(400).json({ success: false, error: 'Enabled state must be a boolean' });
      return;
    }

    const success = toolRegistry.setToolEnabled(name, enabled);

    if (success) {
      stats.addLog('info', `Tool ${enabled ? 'enabled' : 'disabled'}: ${name}`);
      res.json({ success: true, name, enabled });
    } else {
      res.status(404).json({ success: false, error: `Tool not found: ${name}` });
    }
  });

  // Toggle all tools on/off
  app.post('/api/tools/toggle-all', (req: Request, res: Response) => {
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      res.status(400).json({ success: false, error: 'Enabled state must be a boolean' });
      return;
    }

    if (enabled) {
      toolRegistry.enableAllTools();
    } else {
      toolRegistry.disableAllTools();
    }

    stats.addLog('info', `All tools ${enabled ? 'enabled' : 'disabled'}`);
    res.json({ success: true, enabled });
  });

  // Get tool states (for persistence/loading)
  app.get('/api/tools/states', (_req: Request, res: Response) => {
    res.json({ states: toolRegistry.getToolStates() });
  });

  // Set tool states (from persistence/loading)
  app.post('/api/tools/states', (req: Request, res: Response) => {
    const { states } = req.body;

    if (!states || typeof states !== 'object') {
      res.status(400).json({ success: false, error: 'States object is required' });
      return;
    }

    toolRegistry.setToolStates(states);
    stats.addLog('info', 'Tool states loaded');
    res.json({ success: true });
  });

  // ============================================================
  // Custom Tools API Endpoints
  // ============================================================

  // Get all custom tools
  app.get('/api/tools/custom', (_req: Request, res: Response) => {
    const customTools = toolRegistry.getCustomTools();
    res.json({ tools: customTools, count: customTools.length });
  });

  // Add a new custom tool
  app.post('/api/tools/custom', (req: Request, res: Response) => {
    const { name, description, type, command, url, method, script, parameters } = req.body;

    // Validation
    if (!name || typeof name !== 'string') {
      res.status(400).json({ success: false, error: 'Tool name is required' });
      return;
    }

    if (!description || typeof description !== 'string') {
      res.status(400).json({ success: false, error: 'Tool description is required' });
      return;
    }

    if (!['command', 'http', 'script'].includes(type)) {
      res.status(400).json({ success: false, error: 'Type must be command, http, or script' });
      return;
    }

    // Check if tool name already exists (and is not a custom tool being updated)
    if (toolRegistry.has(name) && !toolRegistry.isCustomTool(name)) {
      res.status(400).json({ success: false, error: `Cannot override built-in tool: ${name}` });
      return;
    }

    // If updating an existing custom tool, remove it first
    if (toolRegistry.isCustomTool(name)) {
      toolRegistry.removeCustomTool(name);
    }

    try {
      toolRegistry.registerCustomTool({
        name,
        description,
        type,
        command,
        url,
        method,
        script,
        parameters: parameters || [],
      });

      stats.addLog('info', `Custom tool created: ${name}`);
      res.json({ success: true, name });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  // Delete a custom tool
  app.delete('/api/tools/custom/:name', (req: Request, res: Response) => {
    const name = req.params.name as string;

    if (!toolRegistry.isCustomTool(name)) {
      res.status(404).json({ success: false, error: `Custom tool not found: ${name}` });
      return;
    }

    const success = toolRegistry.removeCustomTool(name);

    if (success) {
      stats.addLog('info', `Custom tool deleted: ${name}`);
      res.json({ success: true, name });
    } else {
      res.status(500).json({ success: false, error: 'Failed to remove custom tool' });
    }
  });

  // ============================================================
  // Core MCP Endpoints
  // ============================================================

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      server: 'abov3-eden',
      version: '1.0.0',
      tools: toolRegistry.size,
      uptime: process.uptime(),
    });
  });

  // Find folder path by name - used by Exodus to auto-populate workspace path
  app.post('/api/find-folder', async (req: Request, res: Response) => {
    const { folderName } = req.body;

    if (!folderName || typeof folderName !== 'string') {
      res.status(400).json({ success: false, error: 'folderName is required' });
      return;
    }

    const fs = await import('fs');
    const os = await import('os');

    // Helper to search recursively up to maxDepth levels
    const searchRecursive = (dir: string, target: string, depth: number, maxDepth: number): string | null => {
      if (depth > maxDepth) return null;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          // Skip hidden folders and common non-project folders
          if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '__pycache__') continue;

          const fullPath = path.join(dir, entry.name);
          if (entry.name === target) {
            return fullPath;
          }
          // Search deeper
          if (depth < maxDepth) {
            const found = searchRecursive(fullPath, target, depth + 1, maxDepth);
            if (found) return found;
          }
        }
      } catch {
        // Skip inaccessible directories
      }
      return null;
    };

    // Search locations in order of priority
    const searchLocations = [
      // Configured workspace roots (search 3 levels deep)
      ...(config.workspace.roots || []).map(loc => ({ path: loc, depth: 3 })),
      // Common project locations (search 2 levels deep)
      { path: path.join(os.homedir(), 'Documents'), depth: 3 },
      { path: path.join(os.homedir(), 'Projects'), depth: 2 },
      { path: path.join(os.homedir(), 'projects'), depth: 2 },
      { path: path.join(os.homedir(), 'dev'), depth: 2 },
      { path: path.join(os.homedir(), 'Development'), depth: 2 },
      { path: path.join(os.homedir(), 'Code'), depth: 2 },
      { path: path.join(os.homedir(), 'code'), depth: 2 },
      { path: path.join(os.homedir(), 'workspace'), depth: 2 },
      { path: path.join(os.homedir(), 'Workspace'), depth: 2 },
      { path: path.join(os.homedir(), 'Desktop'), depth: 2 },
      { path: os.homedir(), depth: 1 },
      // Windows specific (search 1 level deep only)
      { path: 'D:\\', depth: 1 },
      { path: 'E:\\', depth: 1 },
    ];

    // Search for the folder
    for (const { path: location, depth: maxDepth } of searchLocations) {
      try {
        // First check direct child
        const directPath = path.join(location, folderName);
        if (fs.existsSync(directPath) && fs.statSync(directPath).isDirectory()) {
          logger.info(`Found folder "${folderName}" at: ${directPath}`);
          res.json({ success: true, path: directPath });
          return;
        }

        // Then search recursively
        if (maxDepth > 1) {
          const found = searchRecursive(location, folderName, 1, maxDepth);
          if (found) {
            logger.info(`Found folder "${folderName}" at: ${found}`);
            res.json({ success: true, path: found });
            return;
          }
        }
      } catch {
        // Skip inaccessible locations
      }
    }

    // Not found
    res.json({ success: false, error: `Folder "${folderName}" not found in common locations` });
  });

  // MCP endpoint
  app.post('/mcp', async (req: Request, res: Response) => {
    try {
      // Track tool executions
      if (req.body?.method === 'tools/call') {
        stats.incrementToolExecutions();
        const toolName = req.body?.params?.name || 'unknown';
        stats.addLog('info', `Tool call: ${toolName}`);
      }

      const response = await mcpServer.handleRequest(req.body);
      res.json(response);
    } catch (error) {
      logger.error('MCP request error:', error);
      stats.addLog('error', `MCP error: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: 'Internal server error',
        },
      });
    }
  });

  // List tools endpoint (convenience) - includes full schema for dashboard
  app.get('/tools', (_req: Request, res: Response) => {
    const tools = toolRegistry.getDefinitions();
    res.json({
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
      count: tools.length,
    });
  });

  // Dashboard fallback - serve index.html for client-side routing
  app.get('/', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('Unhandled error:', err);
    stats.addLog('error', `Unhandled error: ${err.message}`);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log(BANNER);

  // Load configuration
  const config = loadConfig();
  const validation = validateConfig(config);

  if (!validation.valid) {
    logger.error('Invalid configuration:', validation.errors);
    process.exit(1);
  }

  // Register tools
  registerTools();

  // Initialize ComfyUI manager (for AI image generation)
  logger.info('Initializing ComfyUI manager...');
  await comfyuiManager.initialize(config.comfyui);
  const comfyStatus = comfyuiManager.getStatus();
  if (comfyStatus.enabled) {
    if (comfyStatus.running) {
      logger.info(`ComfyUI: Running at ${comfyStatus.url}`);
    } else if (comfyStatus.error) {
      logger.warn(`ComfyUI: ${comfyStatus.error}`);
    } else {
      logger.info('ComfyUI: Not running (will start on first use or manual start)');
    }
  } else {
    logger.info('ComfyUI: Disabled (configure comfyui.path in config.json to enable)');
  }

  // Determine workspace roots - directories where Eden searches for project folders
  const workspaceRoots = config.workspace?.roots || [process.cwd()];
  logger.info(`Workspace roots: ${workspaceRoots.join(', ')}`);

  // Create MCP server with workspace roots for dynamic project folder resolution
  const mcpServer = new MCPServer(config.security, workspaceRoots);

  // Create Express app
  const app = createApp(config, mcpServer);

  // Start server
  const server = app.listen(config.server.port, config.server.host, () => {
    logger.info(`ABOV3 Eden MCP Server running on http://${config.server.host}:${config.server.port}`);
    logger.info(`Dashboard: http://${config.server.host}:${config.server.port}`);
    logger.info(`MCP endpoint: http://${config.server.host}:${config.server.port}/mcp`);
    logger.info(`Health check: http://${config.server.host}:${config.server.port}/health`);
    logger.info('');
    logger.info('To connect from ABOV3 Exodus:');
    logger.info(`  Settings → Tools → MCP Servers → Add: http://localhost:${config.server.port}/mcp`);

    // Add startup log
    stats.addLog('info', 'ABOV3 Eden server started');
    stats.addLog('info', `${toolRegistry.size} tools registered`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    stats.addLog('warn', `Shutdown initiated: ${signal}`);

    // Stop ComfyUI if we started it
    if (comfyuiManager.getStatus().running) {
      logger.info('Stopping ComfyUI...');
      await comfyuiManager.stop();
    }

    // Close database connections
    closeAllConnections();

    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });

    // Force exit after timeout
    setTimeout(() => {
      logger.warn('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Run
main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
