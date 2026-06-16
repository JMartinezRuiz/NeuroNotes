import { buildRagContextBundle } from './linking'
import { DatabaseFile, RagPreviewResult } from './types'

export function previewRagContextForNote(database: DatabaseFile, noteId: string): RagPreviewResult {
  const note = database.notes.find((item) => item.id === noteId)

  if (!note) {
    throw new Error('Nota no encontrada')
  }

  const bundle = buildRagContextBundle(note, database.notes, {
    maxNotes: database.settings.ragMaxNotes,
    excerptLength: database.settings.ragExcerptLength
  })

  return {
    schema: 'neuronotes.rag-preview.v1',
    noteId: note.id,
    model: database.settings.model,
    ragMaxNotes: database.settings.ragMaxNotes,
    ragExcerptLength: database.settings.ragExcerptLength,
    noteIds: bundle.noteIds,
    related: bundle.related,
    items: bundle.items,
    text: bundle.text
  }
}
