import { SuggestedAction } from './types'

export function inferSuggestedActions(content: string): SuggestedAction[] {
  const text = normalizeActionText(content)
  const actions: SuggestedAction[] = []

  if (/(pendiente|tarea|task|todo|hacer|preparar|crear|revisar|enviar|llamar|follow up)/.test(text)) {
    actions.push({
      kind: 'task',
      title: 'Crear tarea desde la nota',
      detail: 'La nota contiene lenguaje accionable que puede convertirse en una tarea local o MCP.',
      toolHint: 'task.create',
      confidence: 0.7
    })
  }

  if (/(recordar|recordatorio|reminder|alerta|manana|cita|reunion|meeting|fecha|deadline|vencimiento)/.test(text)) {
    actions.push({
      kind: 'reminder',
      title: 'Preparar recordatorio',
      detail: 'La nota menciona tiempo, reunion o vencimiento; puede mapearse a una herramienta de recordatorios.',
      toolHint: 'reminder.create',
      confidence: 0.66
    })
  }

  if (/(investigar|buscar|leer|comparar|referencia|documento|paper|fuente|research|source)/.test(text)) {
    actions.push({
      kind: 'research',
      title: 'Buscar contexto adicional',
      detail: 'La nota parece necesitar investigacion o documentos relacionados.',
      toolHint: 'documents.search',
      confidence: 0.64
    })
  }

  if (/\b(mcp|workflow|automatizacion|automatizar|handoff|herramientas?|tools?)\b/.test(text)) {
    actions.push({
      kind: 'mcp',
      title: 'Preparar handoff MCP',
      detail: 'La nota menciona automatizacion o herramientas; puede revisarse para un handoff MCP aprobado por el usuario.',
      toolHint: 'mcp.workflow.prepare',
      confidence: 0.62
    })
  }

  return actions.slice(0, 4)
}

function normalizeActionText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}
