import path from 'node:path'
import { app } from 'electron'
import { McpConnectionConfig } from './types'

const MCP_CONFIG_SCHEMA = 'neuronotes.mcp-config.v1'
const MCP_SERVER_NAME = 'neuronotes'

export function buildMcpConnectionConfig(options: {
  databasePath: string
  serverPath: string
  command?: string
}): McpConnectionConfig {
  const command = options.command?.trim() || 'node'
  const args = [options.serverPath, '--db', options.databasePath]
  const hostConfig = {
    mcpServers: {
      [MCP_SERVER_NAME]: {
        command,
        args
      }
    }
  }

  return {
    schema: MCP_CONFIG_SCHEMA,
    serverName: MCP_SERVER_NAME,
    command,
    args,
    databasePath: options.databasePath,
    serverPath: options.serverPath,
    hostConfigJson: `${JSON.stringify(hostConfig, null, 2)}\n`
  }
}

export function resolveMcpServerPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'mcp', 'neuronotes-mcp.mjs')
  }

  return path.join(app.getAppPath(), 'scripts', 'neuronotes-mcp.mjs')
}
