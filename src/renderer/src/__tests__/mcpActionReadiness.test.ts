import { describe, expect, it } from 'vitest'
import { mcpActionReadiness, summarizeMcpActionReadiness } from '../mcpActionReadiness'
import { ActionItem } from '../types'

function action(overrides: Partial<ActionItem> = {}): ActionItem {
  return {
    id: 'action-1',
    noteId: 'note-1',
    noteTitle: 'Nota fuente',
    kind: 'task',
    title: 'Crear tarea',
    detail: 'Convertir esta nota en seguimiento.',
    toolHint: 'task.create',
    confidence: 0.82,
    status: 'open',
    createdAt: '2026-06-15T00:00:00.000Z',
    updatedAt: '2026-06-15T00:00:00.000Z',
    ...overrides
  }
}

describe('mcpActionReadiness', () => {
  it('marks an open approved action with a tool hint as exportable', () => {
    expect(
      mcpActionReadiness(
        action({
          mcpApprovedAt: '2026-06-15T00:01:00.000Z'
        })
      )
    ).toMatchObject({
      state: 'ready',
      label: 'Lista para handoff',
      toolName: 'task.create',
      exportable: true
    })
  })

  it('requires approval before exporting an action with a selected tool', () => {
    expect(mcpActionReadiness(action())).toMatchObject({
      state: 'needs-approval',
      label: 'Requiere aprobacion',
      toolName: 'task.create',
      exportable: false
    })
  })

  it('requires a tool hint before an action can be reviewed for MCP handoff', () => {
    expect(
      mcpActionReadiness(
        action({
          toolHint: '  ',
          mcpApprovedAt: '2026-06-15T00:01:00.000Z'
        })
      )
    ).toMatchObject({
      state: 'needs-tool',
      label: 'Falta herramienta',
      toolName: null,
      exportable: false
    })
  })

  it('keeps completed actions out of the MCP handoff', () => {
    expect(
      mcpActionReadiness(
        action({
          status: 'done',
          mcpApprovedAt: '2026-06-15T00:01:00.000Z'
        })
      )
    ).toMatchObject({
      state: 'done',
      label: 'No se exporta',
      toolName: 'task.create',
      exportable: false
    })
  })
})

describe('summarizeMcpActionReadiness', () => {
  it('counts ready, review, tool-selection, and completed states', () => {
    expect(
      summarizeMcpActionReadiness([
        action({ id: 'ready', mcpApprovedAt: '2026-06-15T00:01:00.000Z' }),
        action({ id: 'review' }),
        action({ id: 'tool', toolHint: undefined }),
        action({ id: 'done', status: 'done', mcpApprovedAt: '2026-06-15T00:01:00.000Z' })
      ])
    ).toEqual({
      total: 4,
      open: 3,
      ready: 1,
      needsApproval: 1,
      needsTool: 1,
      done: 1
    })
  })
})
