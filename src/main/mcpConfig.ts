import path from 'node:path'
import { app } from 'electron'
import { McpConnectionConfig } from './types'

const MCP_CONFIG_SCHEMA = 'neuronotes.mcp-config.v1'
const MCP_SERVER_NAME = 'neuronotes'
const MCP_WRITE_SERVER_NAME = 'neuronotes-write'

export function buildMcpConnectionConfig(options: {
  databasePath: string
  serverPath: string
  command?: string
}): McpConnectionConfig {
  const command = options.command?.trim() || 'node'
  const args = [options.serverPath, '--db', options.databasePath]
  const writeArgs = [...args, '--write']
  const hostConfig = buildHostConfig(MCP_SERVER_NAME, command, args)
  const writeHostConfig = buildHostConfig(MCP_WRITE_SERVER_NAME, command, writeArgs)

  return {
    schema: MCP_CONFIG_SCHEMA,
    serverName: MCP_SERVER_NAME,
    writeServerName: MCP_WRITE_SERVER_NAME,
    command,
    args,
    writeArgs,
    databasePath: options.databasePath,
    serverPath: options.serverPath,
    hostConfigJson: `${JSON.stringify(hostConfig, null, 2)}\n`,
    writeHostConfigJson: `${JSON.stringify(writeHostConfig, null, 2)}\n`
  }
}

function buildHostConfig(serverName: string, command: string, args: string[]): { mcpServers: Record<string, unknown> } {
  return {
    mcpServers: {
      [serverName]: {
        command,
        args
      }
    }
  }
}

export function resolveMcpServerPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'mcp', 'neuronotes-mcp.mjs')
  }

  return path.join(app.getAppPath(), 'scripts', 'neuronotes-mcp.mjs')
}
