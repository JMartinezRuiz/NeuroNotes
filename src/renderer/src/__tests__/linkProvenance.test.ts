import { describe, expect, it } from 'vitest'
import { linkProvenance } from '../linkProvenance'

describe('linkProvenance', () => {
  it('classifies user controlled links', () => {
    expect(linkProvenance('Enlace manual.')).toMatchObject({
      label: 'Manual',
      tone: 'manual'
    })
  })

  it('classifies explicit note references', () => {
    expect(linkProvenance('Referencia explicita en la nota.')).toMatchObject({
      label: 'Referencia',
      tone: 'explicit'
    })
  })

  it('classifies reciprocal and incoming links', () => {
    expect(linkProvenance('Enlace reciproco: Referencia explicita en la nota.')).toMatchObject({
      label: 'Backlink',
      tone: 'incoming'
    })
    expect(linkProvenance('Comparte vocabulario relevante.', 'backlink')).toMatchObject({
      label: 'Entrada',
      tone: 'incoming'
    })
    expect(linkProvenance('Comparte vocabulario relevante.', 'both')).toMatchObject({
      label: 'Mutua',
      tone: 'both'
    })
  })

  it('classifies RAG and local seeded links', () => {
    expect(linkProvenance('Contexto recuperado por RAG local.')).toMatchObject({
      label: 'RAG',
      tone: 'rag'
    })
    expect(linkProvenance('Relacion local inicial por etiquetas y contenido.')).toMatchObject({
      label: 'Local',
      tone: 'local'
    })
  })

  it('falls back to automatic provenance for lexical links', () => {
    expect(linkProvenance('Comparte etiquetas y vocabulario relevante.')).toMatchObject({
      label: 'Auto',
      tone: 'auto'
    })
  })
})
