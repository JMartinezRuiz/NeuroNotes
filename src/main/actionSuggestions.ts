import { SuggestedAction } from './types'

export function inferSuggestedActions(content: string): SuggestedAction[] {
  const text = normalizeActionText(content)
  const actions: SuggestedAction[] = []
  const hasEmail = /\b(email|e-mail|correo|mail)\b/.test(text) || /enviar.+\b(correo|mail)\b/.test(text)
  const hasMessage = /\b(whatsapp|mensaje|slack|teams|telegram|dm)\b/.test(text)
  const hasCall = /\b(llamar|llamada|call|telefono|phone)\b/.test(text)
  const hasCalendar = /\b(reunion|meeting|cita|evento|calendario|calendar|agenda|agendar)\b/.test(text)

  if (hasEmail) {
    actions.push({
      kind: 'task',
      title: 'Preparar correo',
      detail: 'La nota pide redactar o enviar un correo; puede revisarse para un handoff MCP de email.',
      toolHint: 'email.compose',
      confidence: 0.72
    })
  } else if (hasMessage) {
    actions.push({
      kind: 'task',
      title: 'Preparar mensaje',
      detail: 'La nota pide enviar un mensaje; puede revisarse para una herramienta de mensajeria.',
      toolHint: 'message.send',
      confidence: 0.7
    })
  } else if (hasCall) {
    actions.push({
      kind: 'task',
      title: 'Preparar llamada',
      detail: 'La nota pide llamar a alguien; puede revisarse para una accion de llamada o seguimiento.',
      toolHint: 'phone.call',
      confidence: 0.68
    })
  } else if (/(pendiente|tarea|task|todo|hacer|preparar|crear|revisar|enviar|follow up)/.test(text)) {
    actions.push({
      kind: 'task',
      title: 'Crear tarea desde la nota',
      detail: 'La nota contiene lenguaje accionable que puede convertirse en una tarea local o MCP.',
      toolHint: 'task.create',
      confidence: 0.7
    })
  }

  if (hasCalendar) {
    actions.push({
      kind: 'reminder',
      title: 'Crear evento de calendario',
      detail: 'La nota menciona reunion, cita o evento; puede revisarse para crear un evento de calendario.',
      toolHint: 'calendar.create_event',
      confidence: 0.72
    })
  } else if (/(recordar|recordatorio|reminder|alerta|manana|fecha|deadline|vencimiento)/.test(text)) {
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
