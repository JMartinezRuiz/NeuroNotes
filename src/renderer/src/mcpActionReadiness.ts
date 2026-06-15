import { ActionItem } from './types'

export type McpActionReadinessState = 'ready' | 'needs-approval' | 'needs-tool' | 'done'

export interface McpActionReadiness {
  state: McpActionReadinessState
  label: string
  detail: string
  toolName: string | null
  exportable: boolean
}

type McpActionInput = Pick<ActionItem, 'status' | 'toolHint' | 'mcpApprovedAt'>

export interface McpActionReadinessSummary {
  total: number
  open: number
  ready: number
  needsApproval: number
  needsTool: number
  done: number
}

export function mcpActionReadiness(action: McpActionInput): McpActionReadiness {
  const toolName = action.toolHint?.trim() || null

  if (action.status === 'done') {
    return {
      state: 'done',
      label: 'No se exporta',
      detail: 'Las acciones completadas no entran en el handoff MCP.',
      toolName,
      exportable: false
    }
  }

  if (!toolName) {
    return {
      state: 'needs-tool',
      label: 'Falta herramienta',
      detail: 'La accion necesita un toolHint antes del handoff MCP.',
      toolName: null,
      exportable: false
    }
  }

  if (!action.mcpApprovedAt) {
    return {
      state: 'needs-approval',
      label: 'Requiere aprobacion',
      detail: `Revisa y aprueba manualmente ${toolName} antes de exportar.`,
      toolName,
      exportable: false
    }
  }

  return {
    state: 'ready',
    label: 'Lista para handoff',
    detail: `${toolName} aprobado para revision MCP externa.`,
    toolName,
    exportable: true
  }
}

export function summarizeMcpActionReadiness(actions: McpActionInput[]): McpActionReadinessSummary {
  const summary: McpActionReadinessSummary = {
    total: actions.length,
    open: 0,
    ready: 0,
    needsApproval: 0,
    needsTool: 0,
    done: 0
  }

  for (const action of actions) {
    const readiness = mcpActionReadiness(action)

    if (action.status === 'open') {
      summary.open += 1
    }

    if (readiness.state === 'ready') {
      summary.ready += 1
    } else if (readiness.state === 'needs-approval') {
      summary.needsApproval += 1
    } else if (readiness.state === 'needs-tool') {
      summary.needsTool += 1
    } else {
      summary.done += 1
    }
  }

  return summary
}
