import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: vi.fn(() => 'C:\\Users\\you\\Neuronotes')
  }
}))

import { buildMcpConnectionConfig, resolveMcpServerPath } from '../mcpConfig'

describe('buildMcpConnectionConfig', () => {
  it('builds a host-ready MCP config for Neuronotes', () => {
    const config = buildMcpConnectionConfig({
      databasePath: 'C:\\Users\\you\\AppData\\Roaming\\Neuronotes\\neuronotes.json',
      serverPath: 'C:\\Program Files\\Neuronotes\\resources\\mcp\\neuronotes-mcp.mjs'
    })

    expect(config).toMatchObject({
      schema: 'neuronotes.mcp-config.v1',
      serverName: 'neuronotes',
      writeServerName: 'neuronotes-write',
      command: 'node',
      args: [
        'C:\\Program Files\\Neuronotes\\resources\\mcp\\neuronotes-mcp.mjs',
        '--db',
        'C:\\Users\\you\\AppData\\Roaming\\Neuronotes\\neuronotes.json'
      ],
      writeArgs: [
        'C:\\Program Files\\Neuronotes\\resources\\mcp\\neuronotes-mcp.mjs',
        '--db',
        'C:\\Users\\you\\AppData\\Roaming\\Neuronotes\\neuronotes.json',
        '--write'
      ],
      databasePath: 'C:\\Users\\you\\AppData\\Roaming\\Neuronotes\\neuronotes.json',
      serverPath: 'C:\\Program Files\\Neuronotes\\resources\\mcp\\neuronotes-mcp.mjs'
    })
    expect(JSON.parse(config.hostConfigJson)).toEqual({
      mcpServers: {
        neuronotes: {
          command: 'node',
          args: [
            'C:\\Program Files\\Neuronotes\\resources\\mcp\\neuronotes-mcp.mjs',
            '--db',
            'C:\\Users\\you\\AppData\\Roaming\\Neuronotes\\neuronotes.json'
          ]
        }
      }
    })
    expect(config.hostConfigJson.endsWith('\n')).toBe(true)
    expect(JSON.parse(config.writeHostConfigJson)).toEqual({
      mcpServers: {
        'neuronotes-write': {
          command: 'node',
          args: [
            'C:\\Program Files\\Neuronotes\\resources\\mcp\\neuronotes-mcp.mjs',
            '--db',
            'C:\\Users\\you\\AppData\\Roaming\\Neuronotes\\neuronotes.json',
            '--write'
          ]
        }
      }
    })
    expect(config.writeHostConfigJson.endsWith('\n')).toBe(true)
  })
})

describe('resolveMcpServerPath', () => {
  it('uses the repository script path while running from source', () => {
    expect(resolveMcpServerPath()).toBe('C:\\Users\\you\\Neuronotes\\scripts\\neuronotes-mcp.mjs')
  })
})
