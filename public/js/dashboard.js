/**
 * ABOV3 Eden Dashboard - Client-Side JavaScript
 */

// State
const state = {
  tools: [],
  stats: null,
  logs: [],
  config: null,
  activities: [],
  pollInterval: null,
  toolStates: {}, // { toolName: enabled }
  customTools: [],
  currentToolForModal: null,
};

// DOM Elements
const elements = {
  // Stats
  totalTools: document.getElementById('totalTools'),
  totalRequests: document.getElementById('totalRequests'),
  uptime: document.getElementById('uptime'),
  toolExecutions: document.getElementById('toolExecutions'),

  // Status
  serverStatus: document.getElementById('serverStatus'),

  // System Info
  systemInfo: document.getElementById('systemInfo'),

  // Activity
  activityList: document.getElementById('activityList'),
  clearActivity: document.getElementById('clearActivity'),

  // Categories
  categoryGrid: document.getElementById('categoryGrid'),

  // Tools
  toolsGrid: document.getElementById('toolsGrid'),
  toolSearch: document.getElementById('toolSearch'),

  // Logs
  logsList: document.getElementById('logsList'),
  logLevel: document.getElementById('logLevel'),
  clearLogs: document.getElementById('clearLogs'),
  downloadLogs: document.getElementById('downloadLogs'),

  // Config
  serverConfig: document.getElementById('serverConfig'),
  securityConfig: document.getElementById('securityConfig'),
  mcpEndpoint: document.getElementById('mcpEndpoint'),
  healthEndpoint: document.getElementById('healthEndpoint'),

  // Modal
  toolModal: document.getElementById('toolModal'),
  modalToolName: document.getElementById('modalToolName'),
  modalToolDescription: document.getElementById('modalToolDescription'),
  modalToolSchema: document.getElementById('modalToolSchema'),
  closeModal: document.getElementById('closeModal'),
  testToolInput: document.getElementById('testToolInput'),
  executeTestTool: document.getElementById('executeTestTool'),
  testToolResult: document.getElementById('testToolResult'),

  // Toast
  toastContainer: document.getElementById('toastContainer'),

  // Tool Management
  toolToggleList: document.getElementById('toolToggleList'),
  toolToggleSearch: document.getElementById('toolToggleSearch'),
  enableAllTools: document.getElementById('enableAllTools'),
  disableAllTools: document.getElementById('disableAllTools'),
  customToolsList: document.getElementById('customToolsList'),
  customToolsSearch: document.getElementById('customToolsSearch'),
  addCustomToolBtn: document.getElementById('addCustomToolBtn'),
  customToolModal: document.getElementById('customToolModal'),
  closeCustomToolModal: document.getElementById('closeCustomToolModal'),
  customToolForm: document.getElementById('customToolForm'),
  cancelCustomTool: document.getElementById('cancelCustomTool'),
  customToolType: document.getElementById('customToolType'),
  shellCommandGroup: document.getElementById('shellCommandGroup'),
  httpGroup: document.getElementById('httpGroup'),
  scriptGroup: document.getElementById('scriptGroup'),

  // ComfyUI
  comfyuiCard: document.getElementById('comfyuiCard'),
  comfyuiStatusBadge: document.getElementById('comfyuiStatusBadge'),
  comfyuiStatus: document.getElementById('comfyuiStatus'),
  comfyuiUrl: document.getElementById('comfyuiUrl'),
  comfyuiUptime: document.getElementById('comfyuiUptime'),
  comfyuiUptimeRow: document.getElementById('comfyuiUptimeRow'),
  comfyuiError: document.getElementById('comfyuiError'),
  comfyuiErrorRow: document.getElementById('comfyuiErrorRow'),
  comfyuiStartBtn: document.getElementById('comfyuiStartBtn'),
  comfyuiStopBtn: document.getElementById('comfyuiStopBtn'),
  comfyuiRestartBtn: document.getElementById('comfyuiRestartBtn'),
  comfyuiInstallNotice: document.getElementById('comfyuiInstallNotice'),
};

// Utility Functions
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Toast Notifications
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      ${type === 'success'
        ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'
        : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'
      }
    </svg>
    <span class="toast-message">${escapeHtml(message)}</span>
  `;

  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// API Functions
async function fetchStats() {
  try {
    const response = await fetch('/api/stats');
    if (!response.ok) throw new Error('Failed to fetch stats');
    return await response.json();
  } catch (error) {
    console.error('Error fetching stats:', error);
    return null;
  }
}

async function fetchTools() {
  try {
    const response = await fetch('/tools');
    if (!response.ok) throw new Error('Failed to fetch tools');
    return await response.json();
  } catch (error) {
    console.error('Error fetching tools:', error);
    return { tools: [] };
  }
}

async function fetchAllTools() {
  try {
    const response = await fetch('/api/tools/all');
    if (!response.ok) throw new Error('Failed to fetch tools');
    return await response.json();
  } catch (error) {
    console.error('Error fetching all tools:', error);
    return { tools: [] };
  }
}

async function fetchHealth() {
  try {
    const response = await fetch('/health');
    if (!response.ok) throw new Error('Server unhealthy');
    return await response.json();
  } catch (error) {
    console.error('Error fetching health:', error);
    return null;
  }
}

async function fetchLogs() {
  try {
    const response = await fetch('/api/logs');
    if (!response.ok) throw new Error('Failed to fetch logs');
    return await response.json();
  } catch (error) {
    console.error('Error fetching logs:', error);
    return { logs: [] };
  }
}

async function fetchConfig() {
  try {
    const response = await fetch('/api/config');
    if (!response.ok) throw new Error('Failed to fetch config');
    return await response.json();
  } catch (error) {
    console.error('Error fetching config:', error);
    return null;
  }
}

async function executeTool(name, args) {
  try {
    const response = await fetch('/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    });

    if (!response.ok) throw new Error('Tool execution failed');
    return await response.json();
  } catch (error) {
    console.error('Error executing tool:', error);
    throw error;
  }
}

// ComfyUI API Functions
async function fetchComfyUIStatus() {
  try {
    const response = await fetch('/api/comfyui/status');
    if (!response.ok) throw new Error('Failed to fetch ComfyUI status');
    return await response.json();
  } catch (error) {
    console.error('Error fetching ComfyUI status:', error);
    return null;
  }
}

async function startComfyUI() {
  try {
    const response = await fetch('/api/comfyui/start', { method: 'POST' });
    if (!response.ok) throw new Error('Failed to start ComfyUI');
    return await response.json();
  } catch (error) {
    console.error('Error starting ComfyUI:', error);
    throw error;
  }
}

async function stopComfyUI() {
  try {
    const response = await fetch('/api/comfyui/stop', { method: 'POST' });
    if (!response.ok) throw new Error('Failed to stop ComfyUI');
    return await response.json();
  } catch (error) {
    console.error('Error stopping ComfyUI:', error);
    throw error;
  }
}

async function restartComfyUI() {
  try {
    const response = await fetch('/api/comfyui/restart', { method: 'POST' });
    if (!response.ok) throw new Error('Failed to restart ComfyUI');
    return await response.json();
  } catch (error) {
    console.error('Error restarting ComfyUI:', error);
    throw error;
  }
}

// Render Functions
function renderStats(stats) {
  if (!stats) return;

  elements.totalTools.textContent = stats.tools || 0;
  elements.totalRequests.textContent = stats.requests || 0;
  elements.uptime.textContent = formatUptime(stats.uptime || 0);
  elements.toolExecutions.textContent = stats.toolExecutions || 0;
}

function renderSystemInfo(stats) {
  if (!stats || !stats.system) return;

  const sys = stats.system;
  elements.systemInfo.innerHTML = `
    <div class="info-item">
      <span class="info-label">Platform</span>
      <span class="info-value">${sys.platform} (${sys.arch})</span>
    </div>
    <div class="info-item">
      <span class="info-label">Node.js</span>
      <span class="info-value">${sys.nodeVersion}</span>
    </div>
    <div class="info-item">
      <span class="info-label">Memory</span>
      <span class="info-value">${formatBytes(sys.memoryUsed)} / ${formatBytes(sys.memoryTotal)}</span>
    </div>
    <div class="info-item">
      <span class="info-label">CPU Cores</span>
      <span class="info-value">${sys.cpuCores}</span>
    </div>
    <div class="info-item">
      <span class="info-label">Working Dir</span>
      <span class="info-value mono" title="${escapeHtml(sys.workingDirectory)}">${escapeHtml(truncatePath(sys.workingDirectory))}</span>
    </div>
    <div class="info-item">
      <span class="info-label">Server Port</span>
      <span class="info-value mono">${sys.port}</span>
    </div>
  `;
}

function truncatePath(path, maxLength = 40) {
  if (path.length <= maxLength) return path;
  return '...' + path.slice(-(maxLength - 3));
}

function renderServerStatus(healthy) {
  const statusEl = elements.serverStatus;
  if (healthy) {
    statusEl.className = 'status-indicator online';
    statusEl.querySelector('.status-text').textContent = 'Online';
  } else {
    statusEl.className = 'status-indicator offline';
    statusEl.querySelector('.status-text').textContent = 'Offline';
  }
}

// Render ComfyUI status
function renderComfyUIStatus(status) {
  if (!status || !elements.comfyuiCard) return;

  // Update status badge
  if (elements.comfyuiStatusBadge) {
    if (!status.installPath) {
      elements.comfyuiStatusBadge.textContent = 'Not Installed';
      elements.comfyuiStatusBadge.className = 'status-badge not-installed';
    } else if (!status.enabled) {
      elements.comfyuiStatusBadge.textContent = 'Disabled';
      elements.comfyuiStatusBadge.className = 'status-badge disabled';
    } else if (status.running) {
      elements.comfyuiStatusBadge.textContent = 'Running';
      elements.comfyuiStatusBadge.className = 'status-badge running';
    } else {
      elements.comfyuiStatusBadge.textContent = 'Stopped';
      elements.comfyuiStatusBadge.className = 'status-badge stopped';
    }
  }

  // Update status text
  if (elements.comfyuiStatus) {
    if (!status.installPath) {
      elements.comfyuiStatus.textContent = 'Not installed - run setup-comfyui.bat';
    } else if (!status.enabled) {
      elements.comfyuiStatus.textContent = 'Disabled';
    } else if (status.running) {
      elements.comfyuiStatus.textContent = 'Running';
    } else {
      elements.comfyuiStatus.textContent = 'Stopped';
    }
  }

  // Update URL
  if (elements.comfyuiUrl) {
    elements.comfyuiUrl.textContent = status.url || 'http://127.0.0.1:8188';
  }

  // Update uptime
  if (elements.comfyuiUptimeRow && elements.comfyuiUptime) {
    if (status.uptime) {
      elements.comfyuiUptimeRow.style.display = 'flex';
      elements.comfyuiUptime.textContent = formatUptime(Math.floor(status.uptime / 1000));
    } else {
      elements.comfyuiUptimeRow.style.display = 'none';
    }
  }

  // Update error
  if (elements.comfyuiErrorRow && elements.comfyuiError) {
    if (status.error) {
      elements.comfyuiErrorRow.style.display = 'flex';
      elements.comfyuiError.textContent = status.error;
    } else {
      elements.comfyuiErrorRow.style.display = 'none';
    }
  }

  // Update button states
  if (elements.comfyuiStartBtn) {
    elements.comfyuiStartBtn.disabled = !status.enabled || status.running || !status.installPath;
  }
  if (elements.comfyuiStopBtn) {
    elements.comfyuiStopBtn.disabled = !status.enabled || !status.running;
  }
  if (elements.comfyuiRestartBtn) {
    elements.comfyuiRestartBtn.disabled = !status.enabled || !status.installPath;
  }

  // Show/hide install notice based on whether ComfyUI is installed
  if (elements.comfyuiInstallNotice) {
    elements.comfyuiInstallNotice.style.display = status.installPath ? 'none' : 'block';
  }
}

function renderCategories(tools) {
  const categories = {};

  // Group tools by category
  tools.forEach(tool => {
    const category = getToolCategory(tool.name);
    if (!categories[category]) {
      categories[category] = { name: category, count: 0, icon: getCategoryIcon(category) };
    }
    categories[category].count++;
  });

  elements.categoryGrid.innerHTML = Object.values(categories).map(cat => `
    <div class="category-card" data-category="${cat.name}">
      <div class="category-icon">${cat.icon}</div>
      <div class="category-info">
        <div class="category-name">${cat.name}</div>
        <div class="category-count">${cat.count} tools</div>
      </div>
    </div>
  `).join('');

  // Add click handlers
  document.querySelectorAll('.category-card').forEach(card => {
    card.addEventListener('click', () => {
      const category = card.dataset.category;
      navigateToSection('tools');
      elements.toolSearch.value = category.toLowerCase();
      filterTools();
    });
  });
}

function getToolCategory(name) {
  if (name.includes('file') || name.includes('directory') || name.includes('read') || name.includes('write') || name.includes('copy') || name.includes('move') || name.includes('delete') || name.includes('search') || name.includes('append')) {
    return 'File System';
  }
  if (name.includes('execute') || name.includes('spawn') || name.includes('process') || name.includes('script') || name.includes('kill')) {
    return 'Shell';
  }
  if (name.includes('sqlite') || name.includes('db_') || name.includes('postgres') || name.includes('mysql')) {
    return 'Database';
  }
  if (name.includes('system') || name.includes('environment') || name.includes('network') || name.includes('time') || name.includes('uuid') || name.includes('hash') || name.includes('base64') || name.includes('sleep') || name.includes('disk') || name.includes('working')) {
    return 'System';
  }
  return 'Other';
}

function getCategoryIcon(category) {
  const icons = {
    'File System': '📁',
    'Shell': '💻',
    'Database': '🗄️',
    'System': '⚙️',
    'Other': '🔧',
  };
  return icons[category] || '🔧';
}

function getCategoryColor(category) {
  const colors = {
    'File System': 'rgba(59, 130, 246, 0.15)',
    'Shell': 'rgba(139, 92, 246, 0.15)',
    'Database': 'rgba(34, 197, 94, 0.15)',
    'System': 'rgba(245, 158, 11, 0.15)',
    'Other': 'rgba(107, 114, 128, 0.15)',
  };
  return colors[category] || colors['Other'];
}

function renderTools(tools) {
  state.tools = tools;

  elements.toolsGrid.innerHTML = tools.map(tool => {
    const category = getToolCategory(tool.name);
    return `
      <div class="tool-card" data-tool="${tool.name}">
        <div class="tool-header">
          <div class="tool-icon" style="background: ${getCategoryColor(category)}">${getCategoryIcon(category)}</div>
          <div class="tool-name">${tool.name}</div>
        </div>
        <div class="tool-description">${escapeHtml(tool.description)}</div>
        <span class="tool-category">${category}</span>
      </div>
    `;
  }).join('');

  // Add click handlers
  document.querySelectorAll('.tool-card').forEach(card => {
    card.addEventListener('click', () => {
      const toolName = card.dataset.tool;
      const tool = state.tools.find(t => t.name === toolName);
      if (tool) openToolModal(tool);
    });
  });
}

function filterTools() {
  const search = elements.toolSearch.value.toLowerCase();
  const cards = document.querySelectorAll('.tool-card');

  cards.forEach(card => {
    const name = card.dataset.tool.toLowerCase();
    const description = card.querySelector('.tool-description').textContent.toLowerCase();
    const category = card.querySelector('.tool-category').textContent.toLowerCase();

    const matches = name.includes(search) || description.includes(search) || category.includes(search);
    card.style.display = matches ? '' : 'none';
  });
}

function renderLogs(logs) {
  if (!logs || logs.length === 0) {
    elements.logsList.innerHTML = `
      <div class="log-entry info">
        <span class="log-time">--:--:--</span>
        <span class="log-level">INFO</span>
        <span class="log-message">No logs available</span>
      </div>
    `;
    return;
  }

  const filterLevel = elements.logLevel.value;

  const filteredLogs = filterLevel === 'all'
    ? logs
    : logs.filter(log => log.level === filterLevel);

  elements.logsList.innerHTML = filteredLogs.map(log => `
    <div class="log-entry ${log.level}">
      <span class="log-time">${formatTime(log.timestamp)}</span>
      <span class="log-level">${log.level.toUpperCase()}</span>
      <span class="log-message">${escapeHtml(log.message)}</span>
    </div>
  `).join('');

  // Auto-scroll to bottom
  elements.logsList.scrollTop = elements.logsList.scrollHeight;
}

function renderConfig(config) {
  if (!config) return;

  elements.serverConfig.innerHTML = `
    <div class="config-item">
      <span class="config-label">Host</span>
      <div class="config-value">${config.server?.host || '127.0.0.1'}</div>
    </div>
    <div class="config-item">
      <span class="config-label">Port</span>
      <div class="config-value">${config.server?.port || 3100}</div>
    </div>
    <div class="config-item">
      <span class="config-label">CORS Enabled</span>
      <div class="config-value">${config.cors?.enabled ? 'Yes' : 'No'}</div>
    </div>
    <div class="config-item">
      <span class="config-label">CORS Origins</span>
      <div class="config-value">${(config.cors?.origins || []).join(', ') || 'None'}</div>
    </div>
  `;

  elements.securityConfig.innerHTML = `
    <div class="config-item">
      <span class="config-label">Allow All Paths</span>
      <div class="config-value">${config.security?.allowAllPaths ? 'Yes' : 'No'}</div>
    </div>
    <div class="config-item">
      <span class="config-label">Max File Size</span>
      <div class="config-value">${formatBytes(config.security?.maxFileSize || 0)}</div>
    </div>
    <div class="config-item">
      <span class="config-label">Command Timeout</span>
      <div class="config-value">${(config.security?.commandTimeout || 0) / 1000}s</div>
    </div>
    <div class="config-item">
      <span class="config-label">SQLite Enabled</span>
      <div class="config-value">${config.database?.sqlite?.enabled ? 'Yes' : 'No'}</div>
    </div>
  `;

  // Update endpoints
  const host = config.server?.host || 'localhost';
  const port = config.server?.port || 3100;
  elements.mcpEndpoint.textContent = `http://${host}:${port}/mcp`;
  elements.healthEndpoint.textContent = `http://${host}:${port}/health`;
}

function addActivity(title, type = 'info') {
  const activity = {
    title,
    type,
    time: new Date().toISOString(),
  };

  state.activities.unshift(activity);
  if (state.activities.length > 20) state.activities.pop();

  renderActivities();
}

function renderActivities() {
  if (state.activities.length === 0) {
    elements.activityList.innerHTML = '<div class="activity-empty">No recent activity</div>';
    return;
  }

  elements.activityList.innerHTML = state.activities.map(activity => `
    <div class="activity-item">
      <div class="activity-icon ${activity.type}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          ${activity.type === 'success'
            ? '<polyline points="20 6 9 17 4 12"/>'
            : activity.type === 'error'
            ? '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'
            : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'
          }
        </svg>
      </div>
      <div class="activity-content">
        <div class="activity-title">${escapeHtml(activity.title)}</div>
        <div class="activity-time">${formatTime(activity.time)}</div>
      </div>
    </div>
  `).join('');
}

// Modal Functions
function openToolModal(tool) {
  elements.modalToolName.textContent = tool.name;
  elements.modalToolDescription.textContent = tool.description;
  elements.modalToolSchema.textContent = JSON.stringify(tool.inputSchema, null, 2);
  elements.testToolInput.value = '';
  elements.testToolResult.className = 'test-result';
  elements.testToolResult.textContent = '';

  elements.toolModal.classList.add('active');
  elements.toolModal.dataset.tool = tool.name;
}

function closeToolModal() {
  elements.toolModal.classList.remove('active');
}

// Navigation
function navigateToSection(sectionId) {
  // Update nav links
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.section === sectionId);
  });

  // Update sections
  document.querySelectorAll('.section').forEach(section => {
    section.classList.toggle('active', section.id === sectionId);
  });
}

// Clipboard
function copyToClipboard(elementId) {
  const element = document.getElementById(elementId);
  if (!element) return;

  navigator.clipboard.writeText(element.textContent).then(() => {
    showToast('Copied to clipboard', 'success');
  }).catch(() => {
    showToast('Failed to copy', 'error');
  });
}

// Poll for updates
async function pollUpdates() {
  try {
    // Fetch stats
    const stats = await fetchStats();
    if (stats) {
      state.stats = stats;
      renderStats(stats);
      renderSystemInfo(stats);
      renderServerStatus(true);
    } else {
      renderServerStatus(false);
    }

    // Fetch logs periodically
    const logsData = await fetchLogs();
    if (logsData && logsData.logs) {
      state.logs = logsData.logs;
      renderLogs(logsData.logs);
    }

    // Fetch ComfyUI status
    const comfyuiStatus = await fetchComfyUIStatus();
    if (comfyuiStatus) {
      renderComfyUIStatus(comfyuiStatus);
    }
  } catch (error) {
    console.error('Poll error:', error);
    renderServerStatus(false);
  }
}

// Initialize
async function init() {
  console.log('ABOV3 Eden Dashboard initializing...');

  // Navigation
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigateToSection(link.dataset.section);
    });
  });

  // Tool search
  elements.toolSearch.addEventListener('input', filterTools);

  // Clear activity
  elements.clearActivity.addEventListener('click', () => {
    state.activities = [];
    renderActivities();
  });

  // Log level filter
  elements.logLevel.addEventListener('change', () => {
    renderLogs(state.logs);
  });

  // Clear logs
  elements.clearLogs.addEventListener('click', async () => {
    try {
      await fetch('/api/logs', { method: 'DELETE' });
      state.logs = [];
      renderLogs([]);
      showToast('Logs cleared', 'success');
    } catch (error) {
      showToast('Failed to clear logs', 'error');
    }
  });

  // Download logs
  elements.downloadLogs.addEventListener('click', () => {
    const content = state.logs.map(log =>
      `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`
    ).join('\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eden-logs-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Modal
  elements.closeModal.addEventListener('click', closeToolModal);
  elements.toolModal.querySelector('.modal-backdrop').addEventListener('click', closeToolModal);

  // Test tool execution
  elements.executeTestTool.addEventListener('click', async () => {
    const toolName = elements.toolModal.dataset.tool;
    let args = {};

    try {
      const inputValue = elements.testToolInput.value.trim();
      if (inputValue) {
        args = JSON.parse(inputValue);
      }
    } catch (error) {
      elements.testToolResult.className = 'test-result active error';
      elements.testToolResult.textContent = 'Invalid JSON: ' + error.message;
      return;
    }

    try {
      elements.executeTestTool.disabled = true;
      elements.executeTestTool.textContent = 'Executing...';

      const result = await executeTool(toolName, args);

      elements.testToolResult.className = 'test-result active' + (result.error ? ' error' : ' success');
      elements.testToolResult.textContent = JSON.stringify(result, null, 2);

      addActivity(`Executed: ${toolName}`, result.error ? 'error' : 'success');
    } catch (error) {
      elements.testToolResult.className = 'test-result active error';
      elements.testToolResult.textContent = 'Error: ' + error.message;
    } finally {
      elements.executeTestTool.disabled = false;
      elements.executeTestTool.textContent = 'Execute';
    }
  });

  // Copy buttons
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      copyToClipboard(btn.dataset.copy);
    });
  });

  // Setup tool management
  setupToolManagement();

  // Initial data fetch
  try {
    // Fetch health first
    const health = await fetchHealth();
    renderServerStatus(!!health);

    // Fetch all tools (including enabled states) for management UI
    const allToolsData = await fetchAllTools();
    if (allToolsData.tools) {
      state.tools = allToolsData.tools;
      renderTools(allToolsData.tools);
      renderCategories(allToolsData.tools);
      renderToolToggleList(allToolsData.tools);

      // Sync tool states from server
      allToolsData.tools.forEach(tool => {
        state.toolStates[tool.name] = tool.enabled !== false;
      });
      saveToolStates();
    }

    // Load custom tools from server
    try {
      const customToolsData = await fetch('/api/tools/custom').then(r => r.json());
      if (customToolsData.tools) {
        state.customTools = customToolsData.tools;
        saveCustomTools();
      }
    } catch (e) {
      console.log('Using local custom tools');
    }
    renderCustomToolsList();

    // Fetch stats
    const stats = await fetchStats();
    if (stats) {
      state.stats = stats;
      renderStats(stats);
      renderSystemInfo(stats);
    }

    // Fetch config
    const config = await fetchConfig();
    if (config) {
      state.config = config;
      renderConfig(config);
    }

    // Fetch ComfyUI status
    const comfyuiStatus = await fetchComfyUIStatus();
    if (comfyuiStatus) {
      renderComfyUIStatus(comfyuiStatus);
    }

    addActivity('Dashboard connected', 'success');
  } catch (error) {
    console.error('Init error:', error);
    addActivity('Failed to connect', 'error');
  }

  // Setup ComfyUI controls
  setupComfyUIControls();

  // Start polling
  state.pollInterval = setInterval(pollUpdates, 5000);
}

// Setup ComfyUI control event listeners
function setupComfyUIControls() {
  // Start button
  if (elements.comfyuiStartBtn) {
    elements.comfyuiStartBtn.addEventListener('click', async () => {
      try {
        elements.comfyuiStartBtn.disabled = true;
        elements.comfyuiStartBtn.textContent = 'Starting...';
        elements.comfyuiStatusBadge.textContent = 'Starting...';
        elements.comfyuiStatusBadge.className = 'status-badge starting';

        const result = await startComfyUI();
        if (result.success) {
          showToast('ComfyUI started successfully', 'success');
          addActivity('ComfyUI started', 'success');
        } else {
          showToast('Failed to start ComfyUI', 'error');
        }
        renderComfyUIStatus(result.status);
      } catch (error) {
        showToast('Failed to start ComfyUI: ' + error.message, 'error');
      } finally {
        elements.comfyuiStartBtn.textContent = 'Start';
      }
    });
  }

  // Stop button
  if (elements.comfyuiStopBtn) {
    elements.comfyuiStopBtn.addEventListener('click', async () => {
      try {
        elements.comfyuiStopBtn.disabled = true;
        elements.comfyuiStopBtn.textContent = 'Stopping...';

        const result = await stopComfyUI();
        if (result.success) {
          showToast('ComfyUI stopped', 'success');
          addActivity('ComfyUI stopped', 'info');
        }
        renderComfyUIStatus(result.status);
      } catch (error) {
        showToast('Failed to stop ComfyUI: ' + error.message, 'error');
      } finally {
        elements.comfyuiStopBtn.textContent = 'Stop';
      }
    });
  }

  // Restart button
  if (elements.comfyuiRestartBtn) {
    elements.comfyuiRestartBtn.addEventListener('click', async () => {
      try {
        elements.comfyuiRestartBtn.disabled = true;
        elements.comfyuiRestartBtn.textContent = 'Restarting...';
        elements.comfyuiStatusBadge.textContent = 'Restarting...';
        elements.comfyuiStatusBadge.className = 'status-badge starting';

        const result = await restartComfyUI();
        if (result.success) {
          showToast('ComfyUI restarted successfully', 'success');
          addActivity('ComfyUI restarted', 'success');
        } else {
          showToast('Failed to restart ComfyUI', 'error');
        }
        renderComfyUIStatus(result.status);
      } catch (error) {
        showToast('Failed to restart ComfyUI: ' + error.message, 'error');
      } finally {
        elements.comfyuiRestartBtn.textContent = 'Restart';
      }
    });
  }
}

// ========================================
// Tool Management Functions
// ========================================

// Load tool states from localStorage
function loadToolStates() {
  const saved = localStorage.getItem('edenToolStates');
  if (saved) {
    state.toolStates = JSON.parse(saved);
  }
}

// Save tool states to localStorage
function saveToolStates() {
  localStorage.setItem('edenToolStates', JSON.stringify(state.toolStates));
}

// Load custom tools from localStorage
function loadCustomTools() {
  const saved = localStorage.getItem('edenCustomTools');
  if (saved) {
    state.customTools = JSON.parse(saved);
  }
}

// Save custom tools to localStorage
function saveCustomTools() {
  localStorage.setItem('edenCustomTools', JSON.stringify(state.customTools));
}

// Render tool toggle list
function renderToolToggleList(tools) {
  if (!elements.toolToggleList) return;

  // Group tools by category using the same logic as the main UI
  const categories = {};
  tools.forEach(tool => {
    const cat = getToolCategory(tool.name);
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(tool);
  });

  let html = '';
  for (const [category, catTools] of Object.entries(categories)) {
    html += `<div class="tool-category-group">
      <div class="tool-category-header">${getCategoryIcon(category)} ${escapeHtml(category)}</div>`;

    catTools.forEach(tool => {
      // Check if tool has enabled state from server, otherwise use local state
      const isEnabled = tool.enabled !== undefined ? tool.enabled : (state.toolStates[tool.name] !== false);
      html += `
        <div class="tool-toggle-item ${isEnabled ? '' : 'disabled'}" data-tool="${escapeHtml(tool.name)}">
          <div class="tool-toggle-info">
            <span class="tool-toggle-name">${escapeHtml(tool.name)}</span>
            <span class="tool-toggle-desc">${escapeHtml(tool.description || '')}</span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" ${isEnabled ? 'checked' : ''} onchange="toggleTool('${escapeHtml(tool.name)}', this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </div>`;
    });

    html += '</div>';
  }

  elements.toolToggleList.innerHTML = html || '<div class="empty-state">No tools available</div>';
}

// Filter tool toggle list based on search
function filterToolToggleList() {
  const search = (elements.toolToggleSearch?.value || '').toLowerCase();
  const items = elements.toolToggleList?.querySelectorAll('.tool-toggle-item');
  const categoryGroups = elements.toolToggleList?.querySelectorAll('.tool-category-group');

  if (!items) return;

  items.forEach(item => {
    const name = (item.dataset.tool || '').toLowerCase();
    const desc = (item.querySelector('.tool-toggle-desc')?.textContent || '').toLowerCase();
    const matches = name.includes(search) || desc.includes(search);
    item.style.display = matches ? '' : 'none';
  });

  // Hide category headers if all tools in that category are hidden
  if (categoryGroups) {
    categoryGroups.forEach(group => {
      const visibleItems = group.querySelectorAll('.tool-toggle-item:not([style*="display: none"])');
      group.style.display = visibleItems.length > 0 ? '' : 'none';
    });
  }
}

// Filter custom tools list based on search
function filterCustomToolsList() {
  const search = (elements.customToolsSearch?.value || '').toLowerCase();
  const items = elements.customToolsList?.querySelectorAll('.custom-tool-item');

  if (!items) return;

  let visibleCount = 0;
  items.forEach(item => {
    const name = (item.querySelector('.custom-tool-name')?.textContent || '').toLowerCase();
    const desc = (item.querySelector('.tool-toggle-desc')?.textContent || '').toLowerCase();
    const type = (item.querySelector('.custom-tool-type')?.textContent || '').toLowerCase();
    const matches = name.includes(search) || desc.includes(search) || type.includes(search);
    item.style.display = matches ? '' : 'none';
    if (matches) visibleCount++;
  });

  // Show empty state if no matches
  const emptyState = elements.customToolsList?.querySelector('.empty-state');
  if (emptyState) {
    if (visibleCount === 0 && state.customTools.length > 0 && search) {
      emptyState.textContent = `No custom tools matching "${search}"`;
      emptyState.style.display = '';
    } else if (state.customTools.length === 0) {
      emptyState.textContent = 'No custom tools added yet';
      emptyState.style.display = '';
    } else {
      emptyState.style.display = 'none';
    }
  }
}

// Toggle a tool on/off
async function toggleTool(toolName, enabled) {
  state.toolStates[toolName] = enabled;
  saveToolStates();

  // Update UI
  const item = elements.toolToggleList.querySelector(`[data-tool="${toolName}"]`);
  if (item) {
    item.classList.toggle('disabled', !enabled);
  }

  // Send to server
  try {
    await fetch('/api/tools/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: toolName, enabled })
    });
    showToast(`Tool ${toolName} ${enabled ? 'enabled' : 'disabled'}`, 'success');
    addActivity(`Tool ${toolName} ${enabled ? 'enabled' : 'disabled'}`, enabled ? 'success' : 'info');
  } catch (error) {
    console.error('Failed to toggle tool:', error);
  }
}

// Enable/disable all tools
function setAllTools(enabled) {
  state.tools.forEach(tool => {
    state.toolStates[tool.name] = enabled;
  });
  saveToolStates();
  renderToolToggleList(state.tools);

  // Send to server
  fetch('/api/tools/toggle-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled })
  }).then(() => {
    showToast(`All tools ${enabled ? 'enabled' : 'disabled'}`, 'success');
  }).catch(error => {
    console.error('Failed to toggle all tools:', error);
  });
}

// Render custom tools list
function renderCustomToolsList() {
  if (!elements.customToolsList) return;

  if (state.customTools.length === 0) {
    elements.customToolsList.innerHTML = '<div class="empty-state">No custom tools added yet</div>';
    return;
  }

  let html = '';
  state.customTools.forEach((tool, index) => {
    html += `
      <div class="custom-tool-item" data-index="${index}">
        <div class="custom-tool-info">
          <span class="custom-tool-name">${escapeHtml(tool.name)}</span>
          <span class="custom-tool-type">${escapeHtml(tool.type)}</span>
          <span class="tool-toggle-desc">${escapeHtml(tool.description || '')}</span>
        </div>
        <div class="custom-tool-actions">
          <button class="btn btn-secondary" onclick="editCustomTool(${index})">Edit</button>
          <button class="btn btn-danger" onclick="deleteCustomTool(${index})">Delete</button>
        </div>
      </div>`;
  });

  elements.customToolsList.innerHTML = html;
}

// Open custom tool modal
function openCustomToolModal(tool = null) {
  state.currentToolForModal = tool;

  // Reset form
  elements.customToolForm.reset();

  if (tool) {
    // Reverse map type from API format to form format (command -> shell)
    const typeReverseMap = { 'command': 'shell', 'http': 'http', 'script': 'script' };
    const formType = typeReverseMap[tool.type] || tool.type;

    document.getElementById('customToolName').value = tool.name;
    document.getElementById('customToolDescription').value = tool.description;
    document.getElementById('customToolType').value = formType;
    document.getElementById('customToolCommand').value = tool.command || '';
    document.getElementById('customToolUrl').value = tool.url || '';
    document.getElementById('customToolMethod').value = tool.method || 'GET';
    document.getElementById('customToolScript').value = tool.script || '';

    // Convert parameters array back to object format for display
    const params = {};
    if (tool.parameters && Array.isArray(tool.parameters)) {
      tool.parameters.forEach(p => {
        params[p.name] = {
          type: p.type || 'string',
          description: p.description || '',
          required: p.required || false
        };
      });
    }
    document.getElementById('customToolParams').value = Object.keys(params).length > 0
      ? JSON.stringify(params, null, 2)
      : '';
  }

  // Show/hide type-specific fields
  updateCustomToolTypeFields();

  elements.customToolModal.classList.add('active');
}

// Close custom tool modal
function closeCustomToolModal() {
  elements.customToolModal.classList.remove('active');
  state.currentToolForModal = null;
}

// Update visible fields based on tool type
function updateCustomToolTypeFields() {
  const type = elements.customToolType.value;
  elements.shellCommandGroup.style.display = type === 'shell' ? 'block' : 'none';
  elements.httpGroup.style.display = type === 'http' ? 'block' : 'none';
  elements.scriptGroup.style.display = type === 'script' ? 'block' : 'none';
}

// Save custom tool
async function saveCustomTool(e) {
  e.preventDefault();

  // Map tool type to API format (shell -> command)
  const typeMap = { 'shell': 'command', 'http': 'http', 'script': 'script' };
  const formType = document.getElementById('customToolType').value;

  const tool = {
    name: document.getElementById('customToolName').value,
    description: document.getElementById('customToolDescription').value,
    type: typeMap[formType] || formType,
    command: document.getElementById('customToolCommand').value,
    url: document.getElementById('customToolUrl').value,
    method: document.getElementById('customToolMethod').value,
    script: document.getElementById('customToolScript').value,
    parameters: [],
  };

  // Parse params as JSON object and convert to parameters array format
  try {
    const paramsText = document.getElementById('customToolParams').value;
    if (paramsText.trim()) {
      const paramsObj = JSON.parse(paramsText);
      // Convert object format { name: { type, description, required } } to array
      if (typeof paramsObj === 'object' && !Array.isArray(paramsObj)) {
        tool.parameters = Object.entries(paramsObj).map(([name, config]) => ({
          name,
          type: config.type || 'string',
          description: config.description || '',
          required: config.required || false
        }));
      } else if (Array.isArray(paramsObj)) {
        tool.parameters = paramsObj;
      }
    }
  } catch (error) {
    showToast('Invalid JSON in parameters', 'error');
    return;
  }

  // Validate
  if (!tool.name || !tool.description) {
    showToast('Name and description are required', 'error');
    return;
  }

  // Check for duplicate names
  const existingIndex = state.customTools.findIndex(t => t.name === tool.name);
  if (existingIndex >= 0 && state.currentToolForModal?.name !== tool.name) {
    showToast('A tool with this name already exists', 'error');
    return;
  }

  // Save
  if (state.currentToolForModal) {
    // Update existing
    const index = state.customTools.findIndex(t => t.name === state.currentToolForModal.name);
    if (index >= 0) {
      state.customTools[index] = tool;
    }
  } else {
    // Add new
    state.customTools.push(tool);
  }

  saveCustomTools();
  renderCustomToolsList();
  closeCustomToolModal();

  // Send to server
  try {
    await fetch('/api/tools/custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tool)
    });
    showToast(`Custom tool "${tool.name}" saved`, 'success');
    addActivity(`Custom tool "${tool.name}" saved`, 'success');

    // Refresh tools list to include new custom tool
    const toolsData = await fetchAllTools();
    if (toolsData && toolsData.tools) {
      state.tools = toolsData.tools;
      renderTools(toolsData.tools);
      renderCategories(toolsData.tools);
      renderToolToggleList(toolsData.tools);
    }
  } catch (error) {
    console.error('Failed to save custom tool:', error);
    showToast('Tool saved locally, server sync failed', 'warning');
  }
}

// Edit custom tool
function editCustomTool(index) {
  const tool = state.customTools[index];
  if (tool) {
    openCustomToolModal(tool);
  }
}

// Delete custom tool
async function deleteCustomTool(index) {
  const tool = state.customTools[index];
  if (!tool) return;

  if (!confirm(`Delete custom tool "${tool.name}"?`)) return;

  state.customTools.splice(index, 1);
  saveCustomTools();
  renderCustomToolsList();

  // Send to server - use URL param for tool name
  try {
    await fetch(`/api/tools/custom/${encodeURIComponent(tool.name)}`, {
      method: 'DELETE'
    });
    showToast(`Custom tool "${tool.name}" deleted`, 'success');
    addActivity(`Custom tool "${tool.name}" deleted`, 'info');
  } catch (error) {
    console.error('Failed to delete custom tool:', error);
  }
}

// Setup tool management event listeners
function setupToolManagement() {
  // Tool toggle search
  if (elements.toolToggleSearch) {
    elements.toolToggleSearch.addEventListener('input', filterToolToggleList);
  }

  // Custom tools search
  if (elements.customToolsSearch) {
    elements.customToolsSearch.addEventListener('input', filterCustomToolsList);
  }

  // Enable/Disable all buttons
  if (elements.enableAllTools) {
    elements.enableAllTools.addEventListener('click', () => setAllTools(true));
  }
  if (elements.disableAllTools) {
    elements.disableAllTools.addEventListener('click', () => setAllTools(false));
  }

  // Add custom tool button
  if (elements.addCustomToolBtn) {
    elements.addCustomToolBtn.addEventListener('click', () => openCustomToolModal());
  }

  // Close custom tool modal
  if (elements.closeCustomToolModal) {
    elements.closeCustomToolModal.addEventListener('click', closeCustomToolModal);
  }
  if (elements.cancelCustomTool) {
    elements.cancelCustomTool.addEventListener('click', closeCustomToolModal);
  }

  // Custom tool modal backdrop close
  if (elements.customToolModal) {
    elements.customToolModal.querySelector('.modal-backdrop')?.addEventListener('click', closeCustomToolModal);
  }

  // Custom tool form submit
  if (elements.customToolForm) {
    elements.customToolForm.addEventListener('submit', saveCustomTool);
  }

  // Tool type change
  if (elements.customToolType) {
    elements.customToolType.addEventListener('change', updateCustomToolTypeFields);
  }

  // Load saved states
  loadToolStates();
  loadCustomTools();
}

// Start
document.addEventListener('DOMContentLoaded', init);
