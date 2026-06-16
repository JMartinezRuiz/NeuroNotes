export type LinkDirection = 'direct' | 'backlink' | 'both'

export type LinkProvenanceTone = 'manual' | 'explicit' | 'incoming' | 'both' | 'local' | 'rag' | 'auto'

export interface LinkProvenance {
  label: string
  title: string
  tone: LinkProvenanceTone
}

export function linkProvenance(reason: string, direction?: LinkDirection): LinkProvenance {
  if (direction === 'both') {
    return {
      label: 'Mutua',
      title: 'Ambas notas se enlazan entre si.',
      tone: 'both'
    }
  }

  if (direction === 'backlink') {
    return {
      label: 'Entrada',
      title: 'Otra nota apunta a esta nota.',
      tone: 'incoming'
    }
  }

  const normalized = normalizeReason(reason)

  if (normalized.startsWith('enlace reciproco')) {
    return {
      label: 'Backlink',
      title: 'Enlace reciproco creado desde otra relacion.',
      tone: 'incoming'
    }
  }

  if (normalized.includes('enlace manual')) {
    return {
      label: 'Manual',
      title: 'Enlace creado o corregido por el usuario.',
      tone: 'manual'
    }
  }

  if (normalized.includes('referencia explicita')) {
    return {
      label: 'Referencia',
      title: 'La nota menciona explicitamente este destino.',
      tone: 'explicit'
    }
  }

  if (normalized.includes('rag') || normalized.includes('qwen') || normalized.includes('contexto recuperado')) {
    return {
      label: 'RAG',
      title: 'Relacion usada o recuperada como contexto RAG local.',
      tone: 'rag'
    }
  }

  if (normalized.includes('relacion local inicial')) {
    return {
      label: 'Local',
      title: 'Relacion local sembrada antes del analisis Qwen.',
      tone: 'local'
    }
  }

  return {
    label: 'Auto',
    title: 'Relacion detectada automaticamente por Neuronotes.',
    tone: 'auto'
  }
}

function normalizeReason(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}
