import { describe, expect, it } from 'vitest'
import { inferSuggestedActions } from '../actionSuggestions'

describe('inferSuggestedActions', () => {
  it('keeps generic tasks and reminders for simple follow-up notes', () => {
    expect(inferSuggestedActions('Preparar tarea y recordar seguimiento manana')).toEqual([
      expect.objectContaining({ kind: 'task', toolHint: 'task.create' }),
      expect.objectContaining({ kind: 'reminder', toolHint: 'reminder.create' })
    ])
  })

  it('uses richer MCP tool hints for calendar and communication intents', () => {
    const actions = inferSuggestedActions('Agendar reunion con Cliente manana y enviar correo con resumen')

    expect(actions).toEqual([
      expect.objectContaining({ kind: 'task', title: 'Preparar correo', toolHint: 'email.compose' }),
      expect.objectContaining({ kind: 'reminder', title: 'Crear evento de calendario', toolHint: 'calendar.create_event' })
    ])
  })

  it('maps messages and calls to specific handoff hints instead of only task.create', () => {
    expect(inferSuggestedActions('Mandar WhatsApp al cliente con el avance')[0]).toMatchObject({
      title: 'Preparar mensaje',
      toolHint: 'message.send'
    })
    expect(inferSuggestedActions('Llamar al doctor por resultados')[0]).toMatchObject({
      title: 'Preparar llamada',
      toolHint: 'phone.call'
    })
  })
})
