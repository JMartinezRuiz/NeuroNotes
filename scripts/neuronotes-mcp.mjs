#!/usr/bin/env node

import { createInterface } from 'node:readline'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import path from 'node:path'

const SERVER_NAME = 'neuronotes'
const SERVER_VERSION = '0.1.0'
const PROTOCOL_VERSION = '2025-06-18'
const DATABASE_FILE = 'neuronotes.json'
const DEFAULT_LIMIT = 10
const MAX_LIMIT = 25
const RESOURCE_URIS = {
  summary: 'neuronotes://library/summary',
  openActions: 'neuronotes://actions/open',
  fineTuneReadiness: 'neuronotes://finetune/readiness'
}

const TOOLS = [
  {
    name: 'neuronotes_search_notes',
    description: 'Search the local Neuronotes library by query, category, tag, or analysis status.',
    annotations: {
      readOnlyHint: true
    },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: {
          type: 'string',
          description: 'Optional text to search in title, summary, content, category, and tags.'
        },
        category: {
          type: 'string',
          description: 'Optional exact category filter.'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional tags that must all be present on the note.'
        },
        analysisStatus: {
          type: 'string',
          enum: ['idle', 'qwen', 'fallback', 'error'],
          description: 'Optional analysis status filter.'
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_LIMIT,
          description: `Maximum notes to return. Default: ${DEFAULT_LIMIT}.`
        }
      }
    }
  },
  {
    name: 'neuronotes_get_note',
    description: 'Read a local Neuronotes note with summary, tags, related notes, actions, and RAG audit metadata.',
    annotations: {
      readOnlyHint: true
    },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['noteId'],
      properties: {
        noteId: {
          type: 'string',
          description: 'Neuronotes note id.'
        },
        includeContent: {
          type: 'boolean',
          description: 'Include full note content. Defaults to true.'
        }
      }
    }
  },
  {
    name: 'neuronotes_list_open_actions',
    description: 'List open local action intents saved from Neuronotes notes for user-approved MCP follow-up.',
    annotations: {
      readOnlyHint: true
    },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: {
          type: 'string',
          enum: ['task', 'reminder', 'research', 'mcp'],
          description: 'Optional action kind filter.'
        },
        toolHint: {
          type: 'string',
          description: 'Optional exact tool hint filter, for example task.create.'
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_LIMIT,
          description: `Maximum actions to return. Default: ${DEFAULT_LIMIT}.`
        }
      }
    }
  },
  {
    name: 'neuronotes_library_summary',
    description: 'Summarize local Neuronotes counts, AI settings, categories, fine-tuning readiness, open actions, and MCP readiness.',
    annotations: {
      readOnlyHint: true
    },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {}
    }
  },
  {
    name: 'neuronotes_finetune_readiness',
    description: 'Summarize reviewed local Qwen fine-tuning examples and analyzed notes still awaiting approval.',
    annotations: {
      readOnlyHint: true
    },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {}
    }
  }
]

const PROMPTS = [
  {
    name: 'neuronotes_review_rag_analysis',
    title: 'Review Qwen RAG Analysis',
    description: 'Review one analyzed note, its stored RAG context, and whether the local Qwen output looks useful.',
    arguments: [
      {
        name: 'noteId',
        description: 'Neuronotes note id to review.',
        required: true
      }
    ]
  },
  {
    name: 'neuronotes_prepare_action_plan',
    title: 'Prepare Local Action Plan',
    description: 'Turn open Neuronotes action intents into a user-approved follow-up plan without executing tools.',
    arguments: [
      {
        name: 'kind',
        description: 'Optional action kind filter: task, reminder, research, or mcp.',
        required: false
      }
    ]
  },
  {
    name: 'neuronotes_library_brief',
    title: 'Neuronotes Library Brief',
    description: 'Summarize the local library, AI readiness, categories, and open action workload.',
    arguments: []
  }
]

export function parseCliArgs(argv) {
  const options = {
    dbPath: process.env.NEURONOTES_DB_PATH || '',
    userDataPath: process.env.NEURONOTES_USER_DATA || '',
    help: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--db') {
      options.dbPath = readArgValue(argv, index, arg)
      index += 1
    } else if (arg.startsWith('--db=')) {
      options.dbPath = arg.slice('--db='.length)
    } else if (arg === '--user-data') {
      options.userDataPath = readArgValue(argv, index, arg)
      index += 1
    } else if (arg.startsWith('--user-data=')) {
      options.userDataPath = arg.slice('--user-data='.length)
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  return options
}

export function resolveDatabasePath(options = {}) {
  if (options.dbPath?.trim()) {
    return path.resolve(options.dbPath.trim())
  }

  if (options.userDataPath?.trim()) {
    return path.join(path.resolve(options.userDataPath.trim()), DATABASE_FILE)
  }

  return path.join(defaultUserDataPath(), DATABASE_FILE)
}

export async function handleMcpMessage(message, context = {}) {
  if (!isObject(message) || message.jsonrpc !== '2.0') {
    return errorResponse(message?.id ?? null, -32600, 'Invalid JSON-RPC request')
  }

  if (!('id' in message)) {
    return undefined
  }

  try {
    const result = await routeRequest(message.method, message.params, context)
    return {
      jsonrpc: '2.0',
      id: message.id,
      result
    }
  } catch (error) {
    return errorResponse(
      message.id,
      error?.code ?? -32603,
      error instanceof Error ? error.message : 'Internal MCP server error'
    )
  }
}

export async function callTool(name, args = {}, context = {}) {
  const database = await readNeuronotesDatabase(context.dbPath)

  if (name === 'neuronotes_search_notes') {
    return searchNotes(database, args)
  }

  if (name === 'neuronotes_get_note') {
    return getNote(database, args)
  }

  if (name === 'neuronotes_list_open_actions') {
    return listOpenActions(database, args)
  }

  if (name === 'neuronotes_library_summary') {
    return librarySummary(database, context.dbPath)
  }

  if (name === 'neuronotes_finetune_readiness') {
    return fineTuneReadiness(database)
  }

  throw rpcError(-32602, `Unknown tool: ${name}`)
}

export async function readNeuronotesDatabase(dbPath) {
  const raw = await readFile(dbPath, 'utf8')
  return normalizeDatabase(JSON.parse(raw))
}

function usage() {
  return `Neuronotes MCP stdio server

Usage:
  npm run mcp:stdio
  node scripts/neuronotes-mcp.mjs --db C:\\Users\\you\\AppData\\Roaming\\Neuronotes\\neuronotes.json

Environment:
  NEURONOTES_DB_PATH   Full path to neuronotes.json.
  NEURONOTES_USER_DATA Directory containing neuronotes.json.
`
}

async function routeRequest(method, params, context) {
  if (method === 'initialize') {
    return {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {
        tools: {},
        resources: {},
        prompts: {}
      },
      serverInfo: {
        name: SERVER_NAME,
        version: SERVER_VERSION
      }
    }
  }

  if (method === 'ping') {
    return {}
  }

  if (method === 'tools/list') {
    return {
      tools: TOOLS
    }
  }

  if (method === 'resources/list') {
    return listResources(await readNeuronotesDatabase(context.dbPath))
  }

  if (method === 'resources/read') {
    if (!isObject(params) || typeof params.uri !== 'string') {
      throw rpcError(-32602, 'resources/read requires a resource uri')
    }

    return readResource(params.uri, await readNeuronotesDatabase(context.dbPath), context.dbPath)
  }

  if (method === 'prompts/list') {
    return {
      prompts: PROMPTS
    }
  }

  if (method === 'prompts/get') {
    if (!isObject(params) || typeof params.name !== 'string') {
      throw rpcError(-32602, 'prompts/get requires a prompt name')
    }

    return getPrompt(
      params.name,
      isObject(params.arguments) ? params.arguments : {},
      await readNeuronotesDatabase(context.dbPath),
      context.dbPath
    )
  }

  if (method === 'tools/call') {
    if (!isObject(params) || typeof params.name !== 'string') {
      throw rpcError(-32602, 'tools/call requires a tool name')
    }

    const payload = await callTool(params.name, isObject(params.arguments) ? params.arguments : {}, context)
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(payload)
        }
      ],
      structuredContent: payload
    }
  }

  throw rpcError(-32601, `Method not found: ${method}`)
}

function listResources(database) {
  return {
    resources: [
      {
        uri: RESOURCE_URIS.summary,
        name: 'library-summary',
        title: 'Neuronotes Library Summary',
        description: 'Counts, Qwen settings, RAG settings, categories, and MCP execution posture.',
        mimeType: 'application/json',
        annotations: {
          audience: ['assistant'],
          priority: 0.9
        }
      },
      {
        uri: RESOURCE_URIS.openActions,
        name: 'open-actions',
        title: 'Open Neuronotes Actions',
        description: 'Saved action intents awaiting user-approved follow-up.',
        mimeType: 'application/json',
        annotations: {
          audience: ['assistant'],
          priority: 0.85
        }
      },
      {
        uri: RESOURCE_URIS.fineTuneReadiness,
        name: 'fine-tune-readiness',
        title: 'Fine-Tuning Readiness',
        description: 'Reviewed JSONL examples and analyzed notes still awaiting training approval.',
        mimeType: 'application/json',
        annotations: {
          audience: ['assistant'],
          priority: 0.82
        }
      },
      ...database.notes
        .slice()
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 100)
        .map((note) => ({
          uri: noteResourceUri(note.id),
          name: `note-${note.id}`,
          title: note.title,
          description: `${note.category} - ${note.summary || excerpt(note.content, 120)}`,
          mimeType: 'application/json',
          annotations: {
            audience: ['assistant'],
            priority: note.analysisStatus === 'qwen' ? 0.75 : 0.55,
            lastModified: note.updatedAt
          }
        }))
    ]
  }
}

function readResource(uri, database, dbPath) {
  if (uri === RESOURCE_URIS.summary) {
    return jsonResource(uri, librarySummary(database, dbPath))
  }

  if (uri === RESOURCE_URIS.openActions) {
    return jsonResource(uri, listOpenActions(database, { limit: MAX_LIMIT }))
  }

  if (uri === RESOURCE_URIS.fineTuneReadiness) {
    return jsonResource(uri, fineTuneReadiness(database))
  }

  const noteId = parseNoteResourceUri(uri)

  if (noteId) {
    if (!database.notes.some((note) => note.id === noteId)) {
      throw rpcError(-32002, `Resource not found: ${uri}`)
    }

    return jsonResource(uri, getNote(database, { noteId }))
  }

  throw rpcError(-32002, `Resource not found: ${uri}`)
}

function getPrompt(name, args, database, dbPath) {
  if (name === 'neuronotes_review_rag_analysis') {
    const noteId = stringArg(args.noteId)

    if (!noteId) {
      throw rpcError(-32602, 'noteId is required')
    }

    const notePayload = getNote(database, { noteId })

    return {
      description: 'Review the stored local AI analysis and RAG context for one Neuronotes note.',
      messages: [
        textPromptMessage(
          [
            'Revisa esta nota de Neuronotes y evalua si el analisis local es util.',
            'No ejecutes herramientas externas. Si propones seguimiento MCP, dejalo como recomendacion que requiere aprobacion del usuario.',
            '',
            'Criterios:',
            '- El resumen debe reflejar la nota original.',
            '- La categoria y etiquetas deben ser especificas.',
            '- Los enlaces RAG deben estar justificados por el contenido.',
            '- Las acciones sugeridas deben ser concretas y no inventar permisos.',
            '',
            JSON.stringify(notePayload, null, 2)
          ].join('\n')
        )
      ]
    }
  }

  if (name === 'neuronotes_prepare_action_plan') {
    const actionsPayload = listOpenActions(database, {
      kind: args.kind,
      limit: MAX_LIMIT
    })

    return {
      description: 'Prepare a local action plan from saved Neuronotes action intents.',
      messages: [
        textPromptMessage(
          [
            'Convierte estas acciones abiertas de Neuronotes en un plan de seguimiento.',
            'No ejecutes herramientas. Agrupa por prioridad, tipo y herramienta MCP sugerida.',
            'Marca claramente que cualquier ejecucion futura requiere aprobacion del usuario.',
            '',
            JSON.stringify(actionsPayload, null, 2)
          ].join('\n')
        )
      ]
    }
  }

  if (name === 'neuronotes_library_brief') {
    return {
      description: 'Brief the user on Neuronotes library state and local AI readiness.',
      messages: [
        textPromptMessage(
          [
            'Resume el estado de la biblioteca local de Neuronotes.',
            'Incluye cobertura de Qwen, fallback local, acciones abiertas, categorias dominantes y riesgos para RAG/fine-tuning.',
            'No asumas que Qwen esta disponible si la evidencia no lo prueba.',
            '',
            JSON.stringify(librarySummary(database, dbPath), null, 2)
          ].join('\n')
        )
      ]
    }
  }

  throw rpcError(-32602, `Unknown prompt: ${name}`)
}

function jsonResource(uri, payload) {
  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(payload, null, 2)
      }
    ]
  }
}

function textPromptMessage(text) {
  return {
    role: 'user',
    content: {
      type: 'text',
      text
    }
  }
}

function noteResourceUri(noteId) {
  return `neuronotes://notes/${encodeURIComponent(noteId)}`
}

function parseNoteResourceUri(uri) {
  const prefix = 'neuronotes://notes/'

  if (!uri.startsWith(prefix)) {
    return ''
  }

  try {
    return decodeURIComponent(uri.slice(prefix.length)).trim()
  } catch {
    return ''
  }
}

function searchNotes(database, args) {
  const query = normalizeText(stringArg(args.query))
  const category = stringArg(args.category)
  const tags = arrayArg(args.tags).map(normalizeTag).filter(Boolean)
  const analysisStatus = stringArg(args.analysisStatus)
  const limit = limitArg(args.limit)

  const matches = database.notes
    .map((note) => ({
      note,
      score: scoreNote(note, query, tags)
    }))
    .filter(({ note, score }) => {
      if (query && score <= 0) {
        return false
      }
      if (category && note.category !== category) {
        return false
      }
      if (analysisStatus && note.analysisStatus !== analysisStatus) {
        return false
      }
      if (tags.length > 0 && !tags.every((tag) => note.tags.includes(tag))) {
        return false
      }
      return true
    })
    .sort((a, b) => b.score - a.score || b.note.updatedAt.localeCompare(a.note.updatedAt))
    .slice(0, limit)
    .map(({ note, score }) => noteSummary(note, score))

  return {
    schema: 'neuronotes.mcp.search.v1',
    count: matches.length,
    notes: matches
  }
}

function getNote(database, args) {
  const noteId = stringArg(args.noteId)

  if (!noteId) {
    throw rpcError(-32602, 'noteId is required')
  }

  const note = database.notes.find((item) => item.id === noteId)

  if (!note) {
    throw rpcError(-32602, `Note not found: ${noteId}`)
  }

  const includeContent = args.includeContent !== false
  const actions = database.actions.filter((action) => action.noteId === note.id)

  return {
    schema: 'neuronotes.mcp.note.v1',
    note: {
      ...noteSummary(note, 1),
      content: includeContent ? note.content : excerpt(note.content, 320),
      related: note.related,
      suggestedActions: note.suggestedActions,
      savedActions: actions,
      analysisRun: note.analysisRun ?? null
    }
  }
}

function listOpenActions(database, args) {
  const kind = stringArg(args.kind)
  const toolHint = stringArg(args.toolHint)
  const limit = limitArg(args.limit)
  const notesById = new Map(database.notes.map((note) => [note.id, note]))

  const actions = database.actions
    .filter((action) => action.status === 'open')
    .filter((action) => !kind || action.kind === kind)
    .filter((action) => !toolHint || action.toolHint === toolHint)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit)
    .map((action) => {
      const note = notesById.get(action.noteId)

      return {
        ...action,
        approval: mcpApproval(action),
        toolCallDraft: note ? buildToolCallDraft(action, note) : null,
        sourceNote: note
          ? {
              id: note.id,
              title: note.title,
              summary: note.summary,
              category: note.category,
              tags: note.tags,
              analysisStatus: note.analysisStatus
            }
          : null
      }
    })

  return {
    schema: 'neuronotes.mcp.actions.v1',
    count: actions.length,
    approvedCount: actions.filter((action) => action.approval.state === 'approved').length,
    actions
  }
}

function mcpApproval(action) {
  return {
    required: true,
    state: action.mcpApprovedAt ? 'approved' : 'needs-review',
    approvedAt: action.mcpApprovedAt ?? null
  }
}

function buildToolCallDraft(action, note) {
  return {
    status: action.toolHint ? 'ready-for-review' : 'needs-tool-selection',
    toolName: action.toolHint ?? null,
    arguments: {
      kind: action.kind,
      title: action.title,
      detail: action.detail,
      confidence: action.confidence,
      sourceNoteId: note.id,
      sourceNoteTitle: note.title,
      sourceNoteSummary: note.summary,
      sourceNoteCategory: note.category,
      sourceNoteTags: note.tags,
      relatedNoteIds: note.related.map((related) => related.noteId),
      ragContext: note.analysisRun?.ragContext ?? []
    }
  }
}

function librarySummary(database, dbPath) {
  const categoryCounts = countBy(database.notes, (note) => note.category)
  const statusCounts = countBy(database.notes, (note) => note.analysisStatus)
  const actionCounts = countBy(database.actions, (action) => action.status)
  const approvedActionCount = database.actions.filter((action) => action.status === 'open' && action.mcpApprovedAt).length

  return {
    schema: 'neuronotes.mcp.summary.v1',
    databasePath: dbPath,
    settings: database.settings,
    noteCount: database.notes.length,
    actionCount: database.actions.length,
    openActionCount: actionCounts.open ?? 0,
    mcpApprovedActionCount: approvedActionCount,
    reviewedFineTuneCount: database.notes.filter((note) => Boolean(note.trainingReviewedAt)).length,
    fineTune: fineTuneReadiness(database, { includeNotes: false }),
    qwenAnalyzedCount: statusCounts.qwen ?? 0,
    fallbackAnalyzedCount: statusCounts.fallback ?? 0,
    categories: categoryCounts,
    analysisStatuses: statusCounts,
    actionStatuses: actionCounts,
    execution: {
      mode: 'read-only-context',
      canModifyNotes: false,
      canExecuteExternalTools: false,
      requiresUserApprovalForFollowUp: true
    }
  }
}

function fineTuneReadiness(database, options = {}) {
  const includeNotes = options.includeNotes !== false
  const reviewableNotes = database.notes.filter(isTrainingReviewable)
  const reviewedNotes = reviewableNotes.filter((note) => Boolean(note.trainingReviewedAt))
  const pendingReviewNotes = reviewableNotes.filter((note) => !note.trainingReviewedAt)
  const reviewedQwenNotes = reviewedNotes.filter((note) => note.analysisStatus === 'qwen')
  const reviewedLocalNotes = reviewedNotes.filter((note) => note.analysisStatus === 'fallback')
  const pendingQwenNotes = pendingReviewNotes.filter((note) => note.analysisStatus === 'qwen')
  const pendingLocalNotes = pendingReviewNotes.filter((note) => note.analysisStatus === 'fallback')

  const payload = {
    schema: 'neuronotes.mcp.finetune-readiness.v1',
    targetModel: database.settings.model,
    reviewedExampleCount: reviewedNotes.length,
    pendingReviewCount: pendingReviewNotes.length,
    reviewableCount: reviewableNotes.length,
    reviewedQwenCount: reviewedQwenNotes.length,
    reviewedLocalCount: reviewedLocalNotes.length,
    pendingQwenCount: pendingQwenNotes.length,
    pendingLocalCount: pendingLocalNotes.length,
    status: reviewedNotes.length > 0 ? 'ready' : pendingReviewNotes.length > 0 ? 'needs-review' : 'empty'
  }

  if (includeNotes) {
    payload.reviewedExamples = reviewedNotes.slice(0, MAX_LIMIT).map(fineTuneNoteSummary)
    payload.pendingReview = pendingReviewNotes.slice(0, MAX_LIMIT).map(fineTuneNoteSummary)
  }

  return payload
}

function fineTuneNoteSummary(note) {
  return {
    id: note.id,
    title: note.title,
    category: note.category,
    tags: note.tags,
    analysisStatus: note.analysisStatus,
    analysisProvider: note.analysisRun?.provider ?? null,
    model: note.analysisRun?.model ?? null,
    analyzedAt: note.analysisRun?.analyzedAt ?? null,
    reviewedAt: note.trainingReviewedAt ?? null,
    ragNoteIds: note.analysisRun?.ragNoteIds ?? [],
    relatedCount: note.related.length,
    suggestedActionCount: note.suggestedActions.length,
    excerpt: excerpt(note.content, 220)
  }
}

function noteSummary(note, score = 0) {
  return {
    id: note.id,
    title: note.title,
    summary: note.summary,
    category: note.category,
    tags: note.tags,
    analysisStatus: note.analysisStatus,
    analysisProvider: note.analysisRun?.provider ?? null,
    model: note.analysisRun?.model ?? null,
    updatedAt: note.updatedAt,
    createdAt: note.createdAt,
    relatedCount: note.related.length,
    suggestedActionCount: note.suggestedActions.length,
    trainingReviewed: Boolean(note.trainingReviewedAt),
    excerpt: excerpt(note.content, 320),
    score: Number(score.toFixed(3))
  }
}

function scoreNote(note, query, tags) {
  let score = tags.length > 0 ? tags.length * 0.3 : 0

  if (!query) {
    return score
  }

  const title = normalizeText(note.title)
  const summary = normalizeText(note.summary)
  const content = normalizeText(note.content)
  const category = normalizeText(note.category)
  const noteTags = normalizeText(note.tags.join(' '))
  const terms = query.split(/\s+/).filter(Boolean)

  if (title.includes(query)) {
    score += 6
  }
  if (summary.includes(query)) {
    score += 4
  }
  if (content.includes(query)) {
    score += 2
  }
  if (category.includes(query) || noteTags.includes(query)) {
    score += 2
  }

  for (const term of terms) {
    if (title.includes(term)) {
      score += 2
    }
    if (summary.includes(term)) {
      score += 1.4
    }
    if (content.includes(term)) {
      score += 1
    }
    if (noteTags.includes(term)) {
      score += 1.2
    }
  }

  return score
}

function normalizeDatabase(raw) {
  const source = isObject(raw) ? raw : {}
  const notes = Array.isArray(source.notes) ? source.notes.map(normalizeNote).filter(Boolean) : []
  const noteIds = new Set(notes.map((note) => note.id))
  const notesById = new Map(notes.map((note) => [note.id, note]))
  const normalizedNotes = notes.map((note) => normalizeNoteReferences(note, notesById, noteIds))
  const normalizedNotesById = new Map(normalizedNotes.map((note) => [note.id, note]))
  const actions = Array.isArray(source.actions)
    ? source.actions
        .map(normalizeAction)
        .filter((action) => action && noteIds.has(action.noteId))
        .map((action) => normalizeActionReferences(action, normalizedNotesById))
    : []

  return {
    version: 1,
    notes: normalizedNotes,
    actions,
    settings: normalizeSettings(source.settings)
  }
}

function normalizeActionReferences(action, notesById) {
  const note = notesById.get(action.noteId)

  if (!note || action.noteTitle === note.title) {
    return action
  }

  return {
    ...action,
    noteTitle: note.title
  }
}

function normalizeNoteReferences(note, notesById, noteIds) {
  let changed = false
  const related = []

  for (const link of note.related) {
    const target = notesById.get(link.noteId)

    if (!target || target.id === note.id) {
      changed = true
      continue
    }

    related.push(link.title === target.title ? link : { ...link, title: target.title })
  }

  const analysisRunResult = normalizeAnalysisRunReferences(note.analysisRun, note.id, noteIds)
  changed = changed || analysisRunResult.changed

  const normalized = {
    ...note,
    related,
    analysisRun: analysisRunResult.analysisRun
  }

  return {
    ...normalized,
    trainingReviewedAt: changed || !isTrainingReviewable(normalized) ? undefined : note.trainingReviewedAt
  }
}

function normalizeAnalysisRunReferences(analysisRun, sourceNoteId, noteIds) {
  if (!analysisRun) {
    return {
      analysisRun: undefined,
      changed: false
    }
  }

  const ragNoteIds = uniqueValidReferenceIds(analysisRun.ragNoteIds, sourceNoteId, noteIds)
  const ragContext = (analysisRun.ragContext ?? []).filter(
    (item) => item.noteId !== sourceNoteId && noteIds.has(item.noteId)
  )
  const changed =
    ragNoteIds.length !== analysisRun.ragNoteIds.length ||
    ragContext.length !== (analysisRun.ragContext ?? []).length

  return {
    analysisRun: {
      ...analysisRun,
      ragNoteIds,
      ragContext
    },
    changed
  }
}

function uniqueValidReferenceIds(values, sourceNoteId, noteIds) {
  const unique = new Set()

  for (const value of values) {
    if (value === sourceNoteId || !noteIds.has(value)) {
      continue
    }

    unique.add(value)
  }

  return [...unique]
}

function isTrainingReviewable(note) {
  if (!note.content.trim() || (note.analysisStatus !== 'qwen' && note.analysisStatus !== 'fallback')) {
    return false
  }

  return Boolean(note.summary.trim() || note.tags.length > 0 || note.related.length > 0 || note.suggestedActions.length > 0)
}

function normalizeNote(value) {
  if (!isObject(value) || !stringArg(value.id)) {
    return undefined
  }

  return {
    id: stringArg(value.id),
    title: stringArg(value.title) || 'Nota sin titulo',
    content: typeof value.content === 'string' ? value.content : '',
    summary: stringArg(value.summary),
    category: stringArg(value.category) || 'Inbox',
    tags: arrayArg(value.tags).map(normalizeTag).filter(Boolean).slice(0, 10),
    related: Array.isArray(value.related) ? value.related.map(normalizeRelated).filter(Boolean).slice(0, 10) : [],
    suggestedActions: Array.isArray(value.suggestedActions)
      ? value.suggestedActions.map(normalizeSuggestedAction).filter(Boolean).slice(0, 8)
      : [],
    analysisStatus: normalizeAnalysisStatus(value.analysisStatus),
    analysisError: stringArg(value.analysisError) || undefined,
    analysisRun: normalizeAnalysisRun(value.analysisRun),
    trainingReviewedAt: stringArg(value.trainingReviewedAt) || undefined,
    createdAt: stringArg(value.createdAt) || new Date(0).toISOString(),
    updatedAt: stringArg(value.updatedAt) || new Date(0).toISOString()
  }
}

function normalizeAction(value) {
  if (!isObject(value) || !stringArg(value.id) || !stringArg(value.noteId)) {
    return undefined
  }

  const kind = normalizeActionKind(value.kind)
  if (!kind) {
    return undefined
  }

  const action = {
    id: stringArg(value.id),
    noteId: stringArg(value.noteId),
    noteTitle: stringArg(value.noteTitle) || 'Nota vinculada',
    kind,
    title: stringArg(value.title) || 'Accion',
    detail: stringArg(value.detail) || 'Accion guardada en Neuronotes.',
    confidence: clampNumber(value.confidence, 0, 1, 0),
    status: value.status === 'done' ? 'done' : 'open',
    createdAt: stringArg(value.createdAt) || new Date(0).toISOString(),
    updatedAt: stringArg(value.updatedAt) || new Date(0).toISOString()
  }

  const toolHint = stringArg(value.toolHint)
  if (toolHint) {
    action.toolHint = toolHint
  }

  const mcpApprovedAt = stringArg(value.mcpApprovedAt)
  if (mcpApprovedAt) {
    action.mcpApprovedAt = mcpApprovedAt
  }

  return action
}

function normalizeRelated(value) {
  if (!isObject(value) || !stringArg(value.noteId)) {
    return undefined
  }

  return {
    noteId: stringArg(value.noteId),
    title: stringArg(value.title) || 'Nota relacionada',
    score: clampNumber(value.score, 0, 1, 0),
    reason: stringArg(value.reason) || 'Relacion detectada por Neuronotes.'
  }
}

function normalizeSuggestedAction(value) {
  if (!isObject(value)) {
    return undefined
  }

  const kind = normalizeActionKind(value.kind)
  const title = stringArg(value.title)

  if (!kind || !title) {
    return undefined
  }

  const action = {
    kind,
    title,
    detail: stringArg(value.detail) || 'Accion sugerida por Neuronotes.',
    confidence: clampNumber(value.confidence, 0, 1, 0)
  }

  const toolHint = stringArg(value.toolHint)
  if (toolHint) {
    action.toolHint = toolHint
  }

  return action
}

function normalizeAnalysisRun(value) {
  if (!isObject(value) || (value.provider !== 'qwen' && value.provider !== 'local')) {
    return undefined
  }

  return {
    provider: value.provider,
    model: stringArg(value.model),
    analyzedAt: stringArg(value.analyzedAt),
    durationMs: Math.max(0, Number.isFinite(value.durationMs) ? Number(value.durationMs) : 0),
    ragNoteIds: arrayArg(value.ragNoteIds).map(stringArg).filter(Boolean).slice(0, 8),
    ragContext: Array.isArray(value.ragContext)
      ? value.ragContext.map(normalizeRagContextItem).filter(Boolean).slice(0, 5)
      : []
  }
}

function normalizeRagContextItem(value) {
  if (!isObject(value) || !stringArg(value.noteId)) {
    return undefined
  }

  return {
    noteId: stringArg(value.noteId),
    title: stringArg(value.title) || 'Contexto RAG',
    category: stringArg(value.category) || 'Inbox',
    tags: arrayArg(value.tags).map(normalizeTag).filter(Boolean).slice(0, 8),
    score: clampNumber(value.score, 0, 1, 0),
    reason: stringArg(value.reason) || 'Contexto recuperado por RAG local.',
    excerpt: excerpt(stringArg(value.excerpt), 550)
  }
}

function normalizeSettings(value) {
  const settings = isObject(value) ? value : {}

  return {
    model: stringArg(settings.model) || 'qwen3.5:0.8b',
    ollamaUrl: stringArg(settings.ollamaUrl).replace(/\/$/, '') || 'http://127.0.0.1:11434',
    autoAnalyze: typeof settings.autoAnalyze === 'boolean' ? settings.autoAnalyze : true,
    ragMaxNotes: clampInteger(settings.ragMaxNotes, 0, 6, 5),
    ragExcerptLength: clampInteger(settings.ragExcerptLength, 160, 1200, 550)
  }
}

function normalizeAnalysisStatus(value) {
  return value === 'qwen' || value === 'fallback' || value === 'error' ? value : 'idle'
}

function normalizeActionKind(value) {
  const kind = stringArg(value).toLowerCase()
  return kind === 'task' || kind === 'reminder' || kind === 'research' || kind === 'mcp' ? kind : undefined
}

function normalizeTag(value) {
  return normalizeText(stringArg(value).replace(/^#/, '')).trim()
}

function normalizeText(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function excerpt(value, maxLength) {
  const clean = String(value).replace(/\s+/g, ' ').trim()
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 3)}...` : clean
}

function countBy(values, selector) {
  return values.reduce((counts, value) => {
    const key = selector(value)
    counts[key] = (counts[key] ?? 0) + 1
    return counts
  }, {})
}

function limitArg(value) {
  return clampInteger(value, 1, MAX_LIMIT, DEFAULT_LIMIT)
}

function stringArg(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function arrayArg(value) {
  return Array.isArray(value) ? value : []
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback
}

function defaultUserDataPath() {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Neuronotes')
  }

  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Neuronotes')
  }

  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'Neuronotes')
}

function readArgValue(argv, index, name) {
  const value = argv[index + 1]

  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value`)
  }

  return value
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function rpcError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function errorResponse(id, code, message) {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message
    }
  }
}

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

async function runStdioServer(options) {
  const dbPath = resolveDatabasePath(options)
  const lines = createInterface({
    input: process.stdin,
    crlfDelay: Number.POSITIVE_INFINITY
  })

  process.stderr.write(`Neuronotes MCP stdio server reading ${dbPath}\n`)

  for await (const line of lines) {
    const trimmed = line.trim()

    if (!trimmed) {
      continue
    }

    try {
      const response = await handleMcpMessage(JSON.parse(trimmed), { dbPath })

      if (response) {
        writeMessage(response)
      }
    } catch (error) {
      writeMessage(errorResponse(null, -32700, error instanceof Error ? error.message : 'Invalid JSON'))
    }
  }
}

const isMain = path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)

if (isMain) {
  try {
    const options = parseCliArgs(process.argv.slice(2))

    if (options.help) {
      process.stdout.write(usage())
    } else {
      await runStdioServer(options)
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Neuronotes MCP server failed'}\n`)
    process.exitCode = 1
  }
}
