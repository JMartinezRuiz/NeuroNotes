import { describe, expect, it } from 'vitest'
import { buildRagContext, buildRagContextBundle, rankRelatedNotes, synchronizeRelatedGraph } from '../linking'
import { NoteRecord } from '../types'

function note(overrides: Partial<NoteRecord> & Pick<NoteRecord, 'id' | 'content'>): NoteRecord {
  const now = '2026-06-15T00:00:00.000Z'

  return {
    title: overrides.id,
    summary: '',
    category: 'Inbox',
    tags: [],
    related: [],
    suggestedActions: [],
    analysisStatus: 'idle',
    createdAt: now,
    updatedAt: now,
    ...overrides
  }
}

describe('rankRelatedNotes', () => {
  it('prioritizes notes with matching tags, category, and vocabulary', () => {
    const source = note({
      id: 'source',
      category: 'Proyecto',
      tags: ['qwen', 'notas'],
      content: 'Qwen resume notas y enlaza ideas dentro de Neuronotes.'
    })
    const related = note({
      id: 'related',
      title: 'Motor Qwen',
      category: 'Proyecto',
      tags: ['qwen', 'notas'],
      content: 'El modelo Qwen ayuda a categorizar notas y encontrar ideas relacionadas.'
    })
    const unrelated = note({
      id: 'unrelated',
      title: 'Compra mensual',
      category: 'Finanzas',
      tags: ['factura'],
      content: 'Pagar la factura del proveedor y revisar el presupuesto mensual.'
    })

    const ranked = rankRelatedNotes(source, [source, unrelated, related])

    expect(ranked[0]).toMatchObject({
      noteId: 'related',
      title: 'Motor Qwen'
    })
    expect(ranked.some((item) => item.noteId === 'source')).toBe(false)
  })

  it('normalizes accents and prioritizes specific phrase matches', () => {
    const source = note({
      id: 'source',
      category: 'Personal',
      content: 'Recordar reunion manana sobre permisos MCP locales.'
    })
    const accentMatch = note({
      id: 'accent-match',
      title: 'Reunion de manana',
      category: 'Personal',
      content: 'La reunión de mañana define permisos MCP locales para Neuronotes.'
    })
    const genericReminder = note({
      id: 'generic-reminder',
      title: 'Agenda personal',
      category: 'Personal',
      content: 'Recordar revisar agenda personal y pendientes generales.'
    })

    const ranked = rankRelatedNotes(source, [source, genericReminder, accentMatch])

    expect(ranked[0]).toMatchObject({
      noteId: 'accent-match',
      reason: 'Comparte frases y conceptos especificos.'
    })
  })

  it('connects notes through bilingual concept aliases', () => {
    const source = note({
      id: 'source',
      category: 'Proyecto',
      content: 'Preparar automatizacion para una alerta del cliente desde Neuronotes.'
    })
    const conceptMatch = note({
      id: 'concept-match',
      title: 'Workflow customer reminder',
      category: 'Proyecto',
      content: 'MCP workflow para crear reminder del customer y dejarlo como accion aprobable.'
    })
    const unrelated = note({
      id: 'unrelated',
      title: 'Ajustes visuales',
      category: 'Proyecto',
      content: 'Revisar iconos, espacios y contraste de la interfaz minimalista.'
    })

    const ranked = rankRelatedNotes(source, [source, unrelated, conceptMatch])

    expect(ranked[0]).toMatchObject({
      noteId: 'concept-match',
      reason: 'Comparte conceptos equivalentes y vocabulario relevante.'
    })
    expect(ranked.some((item) => item.noteId === 'unrelated')).toBe(false)
  })

  it('does not link notes that only share a category', () => {
    const source = note({
      id: 'source',
      category: 'Proyecto',
      content: 'Configurar Ollama Qwen para analisis RAG local.'
    })
    const sameCategory = note({
      id: 'same-category',
      category: 'Proyecto',
      content: 'Factura trimestral, impuestos y presupuesto operativo.'
    })

    expect(rankRelatedNotes(source, [source, sameCategory])).toEqual([])
  })
})

describe('buildRagContext', () => {
  it('builds focused context from the strongest related notes', () => {
    const source = note({
      id: 'source',
      category: 'Proyecto',
      tags: ['qwen'],
      content: 'Analizar notas con Qwen y construir contexto recuperado.'
    })
    const candidate = note({
      id: 'candidate',
      title: 'RAG local',
      category: 'Proyecto',
      tags: ['qwen'],
      content: 'El contexto recuperado debe incluir extractos cortos de notas relacionadas.'
    })

    const context = buildRagContext(source, [source, candidate])

    expect(context).toContain('ID: candidate')
    expect(context).toContain('Titulo: RAG local')
    expect(context).toContain('Puntuacion:')
    expect(context).toContain('Motivo:')
    expect(context).toContain('Extracto:')

    const bundle = buildRagContextBundle(source, [source, candidate])

    expect(bundle.noteIds).toEqual(['candidate'])
    expect(bundle.items[0]).toMatchObject({
      noteId: 'candidate',
      title: 'RAG local',
      category: 'Proyecto',
      tags: ['qwen']
    })
    expect(bundle.items[0].excerpt).toContain('El contexto recuperado')
  })

  it('limits RAG context size with explicit options', () => {
    const source = note({
      id: 'source',
      category: 'Proyecto',
      tags: ['qwen'],
      content: 'Qwen necesita contexto RAG local para resumir notas relacionadas.'
    })
    const first = note({
      id: 'first',
      title: 'RAG local uno',
      category: 'Proyecto',
      tags: ['qwen'],
      content: 'Qwen usa contexto RAG local con extractos largos de notas relacionadas para resumir mejor.'
    })
    const second = note({
      id: 'second',
      title: 'RAG local dos',
      category: 'Proyecto',
      tags: ['qwen'],
      content: 'Otra nota relacionada con Qwen, contexto RAG local y resumen automatico.'
    })

    const bundle = buildRagContextBundle(source, [source, first, second], {
      maxNotes: 1,
      excerptLength: 180
    })

    expect(bundle.items).toHaveLength(1)
    expect(bundle.noteIds).toHaveLength(1)
    expect(bundle.items[0].excerpt.length).toBeLessThanOrEqual(180)
  })

  it('prioritizes manual links as RAG context before lexical matches', () => {
    const source = note({
      id: 'source',
      category: 'Proyecto',
      tags: ['qwen'],
      content: 'Qwen necesita contexto RAG local para resumir notas relacionadas.',
      related: [
        {
          noteId: 'manual',
          title: 'Titulo anterior',
          score: 0.72,
          reason: 'Enlace manual.'
        }
      ]
    })
    const manual = note({
      id: 'manual',
      title: 'Decision curada',
      category: 'Ideas',
      tags: ['arquitectura'],
      content: 'Esta nota fue enlazada manualmente porque contiene una decision importante del usuario.'
    })
    const lexical = note({
      id: 'lexical',
      title: 'Qwen RAG local',
      category: 'Proyecto',
      tags: ['qwen'],
      content: 'Qwen con RAG local resume notas relacionadas y genera enlaces automaticos.'
    })

    const bundle = buildRagContextBundle(source, [source, lexical, manual], {
      maxNotes: 1
    })

    expect(bundle.noteIds).toEqual(['manual'])
    expect(bundle.items[0]).toMatchObject({
      noteId: 'manual',
      title: 'Decision curada',
      reason: 'Enlace manual.'
    })
    expect(bundle.text).toContain('ID: manual')
    expect(bundle.text).not.toContain('ID: lexical')
  })

  it('can disable RAG context while keeping analysis local', () => {
    const source = note({
      id: 'source',
      category: 'Proyecto',
      tags: ['qwen'],
      content: 'Qwen con RAG local.'
    })
    const candidate = note({
      id: 'candidate',
      category: 'Proyecto',
      tags: ['qwen'],
      content: 'Nota candidata sobre Qwen y RAG local.'
    })

    const bundle = buildRagContextBundle(source, [source, candidate], {
      maxNotes: 0
    })

    expect(bundle.items).toEqual([])
    expect(bundle.noteIds).toEqual([])
    expect(bundle.text).toBe('No hay notas relacionadas todavia.')
  })
})

describe('synchronizeRelatedGraph', () => {
  it('normalizes direct links and creates reciprocal links', () => {
    const source = note({
      id: 'source',
      title: 'Nota nueva',
      content: 'Resumen y enlaces automaticos',
      related: [
        {
          noteId: 'target',
          title: 'Titulo viejo',
          score: 0.2,
          reason: 'Relacion detectada por Qwen.'
        },
        {
          noteId: 'target',
          title: 'Titulo duplicado',
          score: 0.8,
          reason: 'Relacion mas fuerte.'
        },
        {
          noteId: 'missing',
          title: 'No existe',
          score: 0.9,
          reason: 'Debe eliminarse.'
        }
      ]
    })
    const target = note({
      id: 'target',
      title: 'Nota destino',
      content: 'Debe recibir backlink automatico',
      trainingReviewedAt: '2026-06-15T00:02:00.000Z'
    })
    const notes = [source, target]
    const graphUpdatedAt = '2026-06-15T00:05:00.000Z'

    const affectedIds = synchronizeRelatedGraph(notes, source.id, graphUpdatedAt)

    expect(affectedIds).toEqual(['source', 'target'])
    expect(source.related).toEqual([
      {
        noteId: 'target',
        title: 'Nota destino',
        score: 0.8,
        reason: 'Relacion mas fuerte.'
      }
    ])
    expect(source.updatedAt).toBe(graphUpdatedAt)
    expect(target.related).toHaveLength(1)
    expect(target.related[0]).toMatchObject({
      noteId: 'source',
      title: 'Nota nueva',
      reason: 'Enlace reciproco: Relacion mas fuerte.'
    })
    expect(target.updatedAt).toBe(graphUpdatedAt)
    expect(target.trainingReviewedAt).toBeUndefined()
  })

  it('removes stale automatic backlinks without deleting manual direct links', () => {
    const source = note({
      id: 'source',
      title: 'Nota fuente',
      content: 'Sin enlaces directos ahora',
      related: []
    })
    const target = note({
      id: 'target',
      title: 'Nota destino',
      content: 'Tiene un backlink anterior',
      related: [
        {
          noteId: 'source',
          title: 'Nota fuente',
          score: 0.6,
          reason: 'Enlace reciproco: relacion anterior'
        },
        {
          noteId: 'manual',
          title: 'Nota manual',
          score: 0.7,
          reason: 'Relacion manual o directa.'
        }
      ],
      trainingReviewedAt: '2026-06-15T00:02:00.000Z'
    })
    const manual = note({
      id: 'manual',
      title: 'Nota manual',
      content: 'Debe conservarse'
    })
    const notes = [source, target, manual]
    const graphUpdatedAt = '2026-06-15T00:06:00.000Z'

    const affectedIds = synchronizeRelatedGraph(notes, source.id, graphUpdatedAt)

    expect(affectedIds).toEqual(['target'])
    expect(target.related).toEqual([
      {
        noteId: 'manual',
        title: 'Nota manual',
        score: 0.7,
        reason: 'Relacion manual o directa.'
      }
    ])
    expect(target.updatedAt).toBe(graphUpdatedAt)
    expect(target.trainingReviewedAt).toBeUndefined()
  })

  it('leaves reviewed notes untouched when reciprocal links are already synchronized', () => {
    const source = note({
      id: 'source',
      title: 'Nota fuente',
      content: 'Enlace ya sincronizado',
      related: [
        {
          noteId: 'target',
          title: 'Nota destino',
          score: 0.5,
          reason: 'Relacion detectada por Qwen.'
        }
      ],
      trainingReviewedAt: '2026-06-15T00:02:00.000Z'
    })
    const target = note({
      id: 'target',
      title: 'Nota destino',
      content: 'Backlink ya sincronizado',
      related: [
        {
          noteId: 'source',
          title: 'Nota fuente',
          score: 0.45,
          reason: 'Enlace reciproco: Relacion detectada por Qwen.'
        }
      ],
      trainingReviewedAt: '2026-06-15T00:03:00.000Z'
    })
    const notes = [source, target]

    const affectedIds = synchronizeRelatedGraph(notes, source.id, '2026-06-15T00:07:00.000Z')

    expect(affectedIds).toEqual([])
    expect(source.updatedAt).toBe('2026-06-15T00:00:00.000Z')
    expect(source.trainingReviewedAt).toBe('2026-06-15T00:02:00.000Z')
    expect(target.updatedAt).toBe('2026-06-15T00:00:00.000Z')
    expect(target.trainingReviewedAt).toBe('2026-06-15T00:03:00.000Z')
  })
})
