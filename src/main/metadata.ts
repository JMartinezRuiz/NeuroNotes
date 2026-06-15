import { NOTE_CATEGORIES } from './types'

const CATEGORY_ALIASES = new Map<string, string>([
  ['entrada', 'Inbox'],
  ['bandeja', 'Inbox'],
  ['general', 'Inbox'],
  ['misc', 'Inbox'],
  ['sin categoria', 'Inbox'],
  ['sin clasificar', 'Inbox'],
  ['work', 'Trabajo'],
  ['job', 'Trabajo'],
  ['laboral', 'Trabajo'],
  ['oficina', 'Trabajo'],
  ['project', 'Proyecto'],
  ['product', 'Proyecto'],
  ['producto', 'Proyecto'],
  ['roadmap', 'Proyecto'],
  ['idea', 'Ideas'],
  ['brainstorming', 'Ideas'],
  ['propuesta', 'Ideas'],
  ['learning', 'Aprendizaje'],
  ['study', 'Aprendizaje'],
  ['estudio', 'Aprendizaje'],
  ['curso', 'Aprendizaje'],
  ['personal', 'Personal'],
  ['home', 'Personal'],
  ['hogar', 'Personal'],
  ['health', 'Salud'],
  ['medico', 'Salud'],
  ['medica', 'Salud'],
  ['wellness', 'Salud'],
  ['bienestar', 'Salud'],
  ['finance', 'Finanzas'],
  ['finances', 'Finanzas'],
  ['dinero', 'Finanzas'],
  ['presupuesto', 'Finanzas'],
  ['gastos', 'Finanzas'],
  ['pagos', 'Finanzas']
])

const CATEGORY_KEYWORDS: Array<{ category: string; pattern: RegExp }> = [
  { category: 'Finanzas', pattern: /\b(finanzas?|finance|finances|money|dinero|presupuesto|gastos?|pagos?)\b/ },
  { category: 'Salud', pattern: /\b(salud|health|medic[ao]|wellness|bienestar)\b/ },
  { category: 'Trabajo', pattern: /\b(work|job|laboral|oficina|cliente|equipo|reunion)\b/ },
  { category: 'Proyecto', pattern: /\b(project|producto|product|roadmap|lanzamiento)\b/ },
  { category: 'Ideas', pattern: /\b(idea|ideas|brainstorming|propuesta)\b/ },
  { category: 'Aprendizaje', pattern: /\b(learning|study|estudio|curso|libro|aprender)\b/ },
  { category: 'Personal', pattern: /\b(personal|vida|hogar|home|familia)\b/ }
]

export function normalizeNoteCategory(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    return 'Inbox'
  }

  const trimmed = value.trim()
  const exactCategory = NOTE_CATEGORIES.find((category) => normalizeCategoryKey(category) === normalizeCategoryKey(trimmed))

  if (exactCategory) {
    return exactCategory
  }

  const normalized = normalizeCategoryKey(trimmed)
  const alias = CATEGORY_ALIASES.get(normalized)

  if (alias) {
    return alias
  }

  const keyword = CATEGORY_KEYWORDS.find((item) => item.pattern.test(normalized))

  return keyword?.category ?? trimmed.slice(0, 80)
}

export function normalizeNoteTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(
    new Set(
      value
        .filter((tag): tag is string => typeof tag === 'string')
        .flatMap((tag) => tag.split(/[,#]/))
        .map(normalizeTag)
        .filter(Boolean)
    )
  ).slice(0, 10)
}

function normalizeTag(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function normalizeCategoryKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
