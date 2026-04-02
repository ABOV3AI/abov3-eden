# ABOV3 Eden

Local MCP (Model Context Protocol) Server for ABOV3 Exodus.

ABOV3 Eden provides powerful local tools that AI models can use to interact with your file system, execute commands, query databases, and perform system operations.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server (with hot reload)
npm run dev

# Start production server
npm start
```

The server will start on `http://127.0.0.1:3100` by default.

## Connecting to ABOV3 Exodus

1. Open ABOV3 Exodus
2. Go to **Settings → Tools → MCP Servers**
3. Click **Add Server**
4. Enter the URL: `http://localhost:3100/mcp`
5. Enable the server
6. All Eden tools are now available to AI models

## Available Tools

### File System Tools

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents (text or base64 for binary) |
| `write_file` | Write/create files |
| `append_file` | Append content to a file |
| `list_directory` | List files and folders with metadata |
| `create_directory` | Create directories (recursive) |
| `delete_file` | Delete files or empty directories |
| `move_file` | Move or rename files/directories |
| `copy_file` | Copy files |
| `file_info` | Get detailed file metadata |
| `search_files` | Search files using glob patterns |
| `read_multiple` | Read multiple files at once |

### Shell/Command Tools

| Tool | Description |
|------|-------------|
| `execute_command` | Run a shell command and get output |
| `execute_script` | Run script files (.sh, .bat, .ps1, .py, .js) |
| `spawn_process` | Start a background process |
| `list_processes` | List spawned background processes |
| `kill_process` | Terminate a background process |
| `get_process_output` | Check background process status |

### Database Tools

| Tool | Description |
|------|-------------|
| `sqlite_query` | Execute SELECT queries on SQLite databases |
| `sqlite_execute` | Execute INSERT/UPDATE/DELETE on SQLite |
| `sqlite_create_database` | Create a new SQLite database |
| `db_list_tables` | List all tables in a database |
| `db_describe_table` | Get table schema/structure |

### System Tools

| Tool | Description |
|------|-------------|
| `system_info` | Get OS, CPU, memory, uptime info |
| `environment_vars` | Get/filter environment variables |
| `network_info` | Get network interfaces and IPs |
| `current_time` | Get current date/time in various formats |
| `working_directory` | Get server working directory |
| `disk_usage` | Get disk usage information |
| `sleep` | Wait for specified milliseconds |
| `generate_uuid` | Generate random UUIDs |
| `hash` | Calculate MD5/SHA hashes |
| `base64` | Encode/decode Base64 strings |

## Configuration

Edit `config.json` to customize the server:

```json
{
  "server": {
    "port": 3100,
    "host": "127.0.0.1"
  },
  "cors": {
    "enabled": true,
    "origins": ["http://localhost:3000"]
  },
  "security": {
    "allowedPaths": [],
    "allowAllPaths": true,
    "blockedCommands": [],
    "maxFileSize": 104857600,
    "commandTimeout": 30000
  },
  "database": {
    "sqlite": { "enabled": true },
    "postgres": { "enabled": false },
    "mysql": { "enabled": false }
  },
  "logging": {
    "level": "info"
  }
}
```

### Environment Variables

Override configuration with environment variables:

| Variable | Description |
|----------|-------------|
| `EDEN_PORT` | Server port |
| `EDEN_HOST` | Server host |
| `EDEN_CORS_ORIGINS` | Comma-separated list of allowed origins |
| `EDEN_LOG_LEVEL` | Logging level (debug, info, warn, error) |
| `EDEN_MAX_FILE_SIZE` | Max file size (e.g., "100MB") |
| `EDEN_COMMAND_TIMEOUT` | Command timeout in ms |
| `EDEN_ALLOWED_PATHS` | Comma-separated allowed paths |
| `POSTGRES_URL` | PostgreSQL connection string |
| `MYSQL_URL` | MySQL connection string |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp` | POST | MCP JSON-RPC endpoint |
| `/health` | GET | Health check |
| `/tools` | GET | List available tools |

## Security

By default, ABOV3 Eden:
- Only binds to localhost (127.0.0.1)
- Allows all file system paths (configurable)
- Blocks dangerous shell commands
- Limits file sizes to 100MB
- Times out commands after 30 seconds

### Restricting Access

To restrict file system access to specific directories:

```json
{
  "security": {
    "allowAllPaths": false,
    "allowedPaths": [
      "C:\\Users\\username\\Projects",
      "/home/username/projects"
    ]
  }
}
```

### Blocking Commands

Add patterns to block specific commands:

```json
{
  "security": {
    "blockedCommands": [
      "rm -rf",
      "format",
      "DROP TABLE"
    ]
  }
}
```

## Development

```bash
# Type check
npm run typecheck

# Build for production
npm run build

# Run production build
npm start
```

## License

MIT License
