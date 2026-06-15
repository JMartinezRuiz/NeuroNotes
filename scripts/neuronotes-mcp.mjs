#!/usr/bin/env node

import { createInterface } from 'node:readline'
import { copyFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import path from 'node:path'

const SERVER_NAME = 'neuronotes'
const SERVER_VERSION = '0.1.0'
const PROTOCOL_VERSION = '2025-06-18'
const DATABASE_FILE = 'neuronotes.json'
const DATABASE_BACKUP_FILE = `${DATABASE_FILE}.bak`
const DEFAULT_LIMIT = 10
const MAX_LIMIT = 25
const MAX_GRAPH_NODES = 100
const MAX_MCP_NOTE_CONTENT_LENGTH = 20000
const RESOURCE_URIS = {
  summary: 'neuronotes://library/summary',
  noteGraph: 'neuronotes://graph/links',
  openActions: 'neuronotes://actions/open',
  mcpHandoff: 'neuronotes://actions/handoff',
  analysisQueue: 'neuronotes://analysis/queue',
  qwenSetup: 'neuronotes://qwen/setup',
  fineTuneReadiness: 'neuronotes://finetune/readiness'
}

const READ_ONLY_TOOLS = [
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
          description: 'Optional text to search in notes, tags, related context, suggested actions, saved actions, and RAG audit data.'
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
    name: 'neuronotes_note_graph',
    description: 'Inspect the local Neuronotes link graph with deduplicated edges, backlinks, and isolated notes.',
    annotations: {
      readOnlyHint: true
    },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        category: {
          type: 'string',
          description: 'Optional exact category filter for graph nodes.'
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_GRAPH_NODES,
          description: `Maximum graph nodes to return. Default: ${MAX_GRAPH_NODES}.`
        }
      }
    }
  },
  {
    name: 'neuronotes_analysis_queue',
    description: 'List notes pending local analysis or Qwen upgrade, without modifying the library.',
    annotations: {
      readOnlyHint: true
    },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        mode: {
          type: 'string',
          enum: ['qwen', 'local'],
          description: 'Queue to inspect. qwen includes local fallback notes that can be upgraded. Default: qwen.'
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
    name: 'neuronotes_mcp_handoff',
    description: 'Build a read-only Neuronotes MCP handoff package with open action drafts, approval state, source note context, and RAG snippets.',
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
    name: 'neuronotes_qwen_setup',
    description: 'Read Qwen/Ollama setup guidance, configured RAG limits, and the latest stored Qwen diagnostic without executing setup.',
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

const WRITE_TOOLS = [
  {
    name: 'neuronotes_create_note',
    description:
      'Create a new local Neuronotes note from an authorized MCP host. Requires the server to be started with NEURONOTES_MCP_WRITE=1 or --write.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false
    },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['content'],
      properties: {
        content: {
          type: 'string',
          maxLength: MAX_MCP_NOTE_CONTENT_LENGTH,
          description: 'Note body to save locally. The note is stored as pending analysis for Neuronotes/Qwen.'
        },
        title: {
          type: 'string',
          maxLength: 160,
          description: 'Optional note title. When omitted, Neuronotes derives it from the first content line.'
        },
        category: {
          type: 'string',
          maxLength: 80,
          description: 'Optional local category. Defaults to Inbox.'
        },
        tags: {
          type: 'array',
          maxItems: 10,
          items: {
            type: 'string',
            maxLength: 40
          },
          description: 'Optional tags to normalize and attach to the new note.'
        }
      }
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
    name: 'neuronotes_review_mcp_handoff',
    title: 'Review MCP Handoff',
    description: 'Review the generated Neuronotes MCP handoff package before any user-approved tool execution.',
    arguments: []
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
    writeEnabled: process.env.NEURONOTES_MCP_WRITE === '1',
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
    } else if (arg === '--write') {
      options.writeEnabled = true
    } else if (arg === '--read-only') {
      options.writeEnabled = false
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

  if (name === 'neuronotes_create_note') {
    return createNoteFromMcp(database, args, context)
  }

  if (name === 'neuronotes_search_notes') {
    return searchNotes(database, args)
  }

  if (name === 'neuronotes_get_note') {
    return getNote(database, args)
  }

  if (name === 'neuronotes_note_graph') {
    return noteGraph(database, args)
  }

  if (name === 'neuronotes_analysis_queue') {
    return analysisQueue(database, args)
  }

  if (name === 'neuronotes_list_open_actions') {
    return listOpenActions(database, args)
  }

  if (name === 'neuronotes_mcp_handoff') {
    return mcpHandoff(database)
  }

  if (name === 'neuronotes_library_summary') {
    return librarySummary(database, context.dbPath, context)
  }

  if (name === 'neuronotes_qwen_setup') {
    return qwenSetup(database)
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

export async function writeNeuronotesDatabase(dbPath, database) {
  const normalized = normalizeDatabase(database)
  const directory = path.dirname(dbPath)
  const tempPath = `${dbPath}.tmp`
  const backupPath = path.basename(dbPath) === DATABASE_FILE ? path.join(directory, DATABASE_BACKUP_FILE) : `${dbPath}.bak`

  await mkdir(directory, { recursive: true })
  await writeFile(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')

  try {
    await rename(tempPath, dbPath)
    await copyFile(dbPath, backupPath)
  } catch (error) {
    await unlink(tempPath).catch(() => undefined)
    throw error
  }

  return normalized
}

function usage() {
  return `Neuronotes MCP stdio server

Usage:
  npm run mcp:stdio
  node scripts/neuronotes-mcp.mjs --db C:\\Users\\you\\AppData\\Roaming\\Neuronotes\\neuronotes.json

Environment:
  NEURONOTES_DB_PATH   Full path to neuronotes.json.
  NEURONOTES_USER_DATA Directory containing neuronotes.json.
  NEURONOTES_MCP_WRITE Set to 1 to enable opt-in write tools.

Options:
  --write      Enable opt-in write tools for trusted MCP hosts.
  --read-only  Force the default read-only posture even if NEURONOTES_MCP_WRITE=1.
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
      tools: toolsForContext(context)
    }
  }

  if (method === 'resources/list') {
    return listResources(await readNeuronotesDatabase(context.dbPath))
  }

  if (method === 'resources/read') {
    if (!isObject(params) || typeof params.uri !== 'string') {
      throw rpcError(-32602, 'resources/read requires a resource uri')
    }

    return readResource(params.uri, await readNeuronotesDatabase(context.dbPath), context)
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
      context
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

function toolsForContext(context = {}) {
  return isWriteEnabled(context) ? [...READ_ONLY_TOOLS, ...WRITE_TOOLS] : READ_ONLY_TOOLS
}

function isWriteEnabled(context = {}) {
  return context.writeEnabled === true
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
        uri: RESOURCE_URIS.noteGraph,
        name: 'note-graph',
        title: 'Neuronotes Note Graph',
        description: 'Deduplicated note links, backlinks, and isolated notes in the local graph.',
        mimeType: 'application/json',
        annotations: {
          audience: ['assistant'],
          priority: 0.87
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
        uri: RESOURCE_URIS.mcpHandoff,
        name: 'mcp-handoff',
        title: 'Neuronotes MCP Handoff',
        description: 'Open action drafts with approval state, source note context, and stored RAG snippets for external review.',
        mimeType: 'application/json',
        annotations: {
          audience: ['assistant'],
          priority: 0.855
        }
      },
      {
        uri: RESOURCE_URIS.analysisQueue,
        name: 'analysis-queue',
        title: 'Neuronotes Analysis Queue',
        description: 'Notes pending local fallback analysis and Qwen upgrade.',
        mimeType: 'application/json',
        annotations: {
          audience: ['assistant'],
          priority: 0.84
        }
      },
      {
        uri: RESOURCE_URIS.qwenSetup,
        name: 'qwen-setup',
        title: 'Qwen Local Setup',
        description: 'Configured model, RAG limits, setup commands, and latest stored Qwen diagnostic.',
        mimeType: 'application/json',
        annotations: {
          audience: ['assistant'],
          priority: 0.83
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

function readResource(uri, database, context = {}) {
  if (uri === RESOURCE_URIS.summary) {
    return jsonResource(uri, librarySummary(database, context.dbPath, context))
  }

  if (uri === RESOURCE_URIS.noteGraph) {
    return jsonResource(uri, noteGraph(database, { limit: MAX_GRAPH_NODES }))
  }

  if (uri === RESOURCE_URIS.openActions) {
    return jsonResource(uri, listOpenActions(database, { limit: MAX_LIMIT }))
  }

  if (uri === RESOURCE_URIS.mcpHandoff) {
    return jsonResource(uri, mcpHandoff(database))
  }

  if (uri === RESOURCE_URIS.analysisQueue) {
    return jsonResource(uri, analysisQueues(database))
  }

  if (uri === RESOURCE_URIS.qwenSetup) {
    return jsonResource(uri, qwenSetup(database))
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

function getPrompt(name, args, database, context = {}) {
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

  if (name === 'neuronotes_review_mcp_handoff') {
    return {
      description: 'Review the read-only MCP handoff package before any future tool routing.',
      messages: [
        textPromptMessage(
          [
            'Revisa este paquete de handoff MCP de Neuronotes antes de cualquier ejecucion futura.',
            'No ejecutes herramientas ni transformes estos drafts en llamadas reales. Trata el paquete como una propuesta que requiere aprobacion explicita del usuario.',
            '',
            'Criterios:',
            '- Verifica que cada accion tenga sourceNote, toolHint y argumentos suficientes.',
            '- Separa acciones aprobadas de las que todavia necesitan revision.',
            '- Senala riesgos de privacidad, contexto RAG insuficiente o herramienta MCP ambigua.',
            '- Propone el orden de revision humana, sin enviar datos a herramientas externas.',
            '',
            JSON.stringify(mcpHandoff(database), null, 2)
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
            JSON.stringify(librarySummary(database, context.dbPath, context), null, 2)
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
  const actionsByNoteId = groupActionsByNoteId(database.actions)

  const matches = database.notes
    .map((note) => ({
      note,
      score: scoreNote(note, query, tags, actionsByNoteId.get(note.id) ?? [])
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

function groupActionsByNoteId(actions) {
  const grouped = new Map()

  for (const action of actions) {
    grouped.set(action.noteId, [...(grouped.get(action.noteId) ?? []), action])
  }

  return grouped
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

async function createNoteFromMcp(database, args, context) {
  if (!isWriteEnabled(context)) {
    throw rpcError(
      -32003,
      'MCP write mode is disabled. Start the server with NEURONOTES_MCP_WRITE=1 or --write for trusted hosts.'
    )
  }

  if (!context.dbPath) {
    throw rpcError(-32602, 'Database path is required to create notes')
  }

  const content = typeof args.content === 'string' ? args.content.trim() : ''

  if (!content) {
    throw rpcError(-32602, 'content is required')
  }

  if (content.length > MAX_MCP_NOTE_CONTENT_LENGTH) {
    throw rpcError(-32602, `content must be ${MAX_MCP_NOTE_CONTENT_LENGTH} characters or fewer`)
  }

  const now = new Date().toISOString()
  const note = {
    id: randomUUID(),
    title: mcpNoteTitle(args.title, content),
    content,
    summary: '',
    category: excerpt(stringArg(args.category) || 'Inbox', 80),
    tags: uniqueNormalizedTags(args.tags).slice(0, 10),
    related: [],
    suggestedActions: [],
    analysisStatus: 'idle',
    createdAt: now,
    updatedAt: now
  }

  database.notes.unshift(note)

  const stored = await writeNeuronotesDatabase(context.dbPath, database)
  const created = stored.notes.find((item) => item.id === note.id) ?? note

  return {
    schema: 'neuronotes.mcp.write-note.v1',
    writeMode: 'enabled',
    message: 'Nota creada desde MCP y pendiente de analisis en Neuronotes.',
    databasePath: context.dbPath,
    note: {
      ...noteSummary(created, 1),
      content: created.content
    },
    next: {
      analysisStatus: created.analysisStatus,
      qwenQueue: 'pending',
      reason: 'La app puede analizar esta nota despues con Qwen/RAG o fallback local.'
    }
  }
}

function mcpNoteTitle(value, content) {
  const explicit = stringArg(value)

  if (explicit) {
    return excerpt(explicit, 120)
  }

  const firstLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)

  return excerpt(firstLine || 'Nota MCP', 120)
}

function uniqueNormalizedTags(values) {
  const unique = new Set()

  for (const tag of arrayArg(values).map(normalizeTag).filter(Boolean)) {
    unique.add(tag)
  }

  return [...unique]
}

function noteGraph(database, args = {}) {
  const category = stringArg(args.category)
  const limit = graphLimitArg(args.limit)
  const notes = database.notes
    .filter((note) => !category || note.category === category)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit)
  const notesById = new Map(notes.map((note) => [note.id, note]))
  const outgoing = new Map(notes.map((note) => [note.id, new Set()]))
  const incoming = new Map(notes.map((note) => [note.id, new Set()]))
  const edgesById = new Map()

  for (const source of notes) {
    for (const related of source.related) {
      const target = notesById.get(related.noteId)

      if (!target || target.id === source.id) {
        continue
      }

      outgoing.get(source.id).add(target.id)
      incoming.get(target.id).add(source.id)

      const [sourceId, targetId] = [source.id, target.id].sort()
      const id = `${sourceId}::${targetId}`
      const edge = edgesById.get(id) ?? {
        id,
        sourceId,
        targetId,
        sourceTitle: notesById.get(sourceId)?.title ?? source.title,
        targetTitle: notesById.get(targetId)?.title ?? target.title,
        score: 0,
        reasons: [],
        directedLinks: []
      }

      edge.score = Math.max(edge.score, related.score)
      if (!edge.reasons.includes(related.reason)) {
        edge.reasons.push(related.reason)
      }
      edge.directedLinks.push({
        sourceId: source.id,
        targetId: target.id,
        score: related.score,
        reason: related.reason
      })
      edgesById.set(id, edge)
    }
  }

  const nodes = notes.map((note) => {
    const directLinkIds = [...(outgoing.get(note.id) ?? [])].sort((a, b) => a.localeCompare(b))
    const backlinkIds = [...(incoming.get(note.id) ?? [])].sort((a, b) => a.localeCompare(b))
    const linkedNoteIds = [...new Set([...directLinkIds, ...backlinkIds])].sort((a, b) => a.localeCompare(b))

    return {
      ...noteSummary(note, 1),
      directLinkIds,
      backlinkIds,
      linkedNoteIds,
      directLinkCount: directLinkIds.length,
      backlinkCount: backlinkIds.length,
      linkedNoteCount: linkedNoteIds.length,
      isolated: linkedNoteIds.length === 0
    }
  })
  const edges = [...edgesById.values()]
    .map((edge) => ({
      ...edge,
      bidirectional: hasBothDirections(edge.directedLinks),
      relationCount: edge.directedLinks.length
    }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  const orphanNotes = nodes.filter((node) => node.isolated)

  return {
    schema: 'neuronotes.mcp.graph.v1',
    targetModel: database.settings.model,
    category: category || null,
    limit,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    orphanCount: orphanNotes.length,
    backlinkCount: nodes.reduce((total, node) => total + node.backlinkCount, 0),
    nodes,
    edges,
    orphanNotes,
    execution: {
      mode: 'read-only-context',
      canModifyNotes: false,
      canCreateLinks: false,
      canAnalyzeNotes: false
    }
  }
}

function hasBothDirections(directedLinks) {
  const directions = new Set(directedLinks.map((link) => `${link.sourceId}->${link.targetId}`))

  for (const link of directedLinks) {
    if (directions.has(`${link.targetId}->${link.sourceId}`)) {
      return true
    }
  }

  return false
}

function analysisQueues(database) {
  return {
    schema: 'neuronotes.mcp.analysis-queues.v1',
    targetModel: database.settings.model,
    qwen: analysisQueue(database, { mode: 'qwen', limit: MAX_LIMIT }),
    local: analysisQueue(database, { mode: 'local', limit: MAX_LIMIT }),
    execution: {
      mode: 'read-only-context',
      canAnalyzeNotes: false,
      canExecuteExternalTools: false
    }
  }
}

function analysisQueue(database, args) {
  const mode = normalizeAnalysisQueueMode(args.mode)
  const limit = limitArg(args.limit)
  const pending = database.notes
    .filter((note) => note.content.trim().length > 0 && isPendingAnalysisNote(note, mode))
    .sort(compareAnalysisQueueNotes)
  const statusCounts = countBy(pending, (note) => note.analysisStatus)

  return {
    schema: 'neuronotes.mcp.analysis-queue.v1',
    mode,
    targetModel: database.settings.model,
    pendingCount: pending.length,
    statusCounts,
    notes: pending.slice(0, limit).map((note) => ({
      ...noteSummary(note, 1),
      reason: analysisQueueReason(note, mode),
      ragNoteIds: note.analysisRun?.ragNoteIds ?? [],
      analysisError: note.analysisError ?? null
    }))
  }
}

function normalizeAnalysisQueueMode(value) {
  return value === 'local' ? 'local' : 'qwen'
}

function isPendingAnalysisNote(note, mode) {
  if (mode === 'local') {
    return note.analysisStatus === 'idle' || note.analysisStatus === 'error'
  }

  return note.analysisStatus !== 'qwen'
}

function compareAnalysisQueueNotes(a, b) {
  const priority = analysisQueuePriority(b) - analysisQueuePriority(a)
  return priority || b.updatedAt.localeCompare(a.updatedAt)
}

function analysisQueuePriority(note) {
  if (note.analysisStatus === 'error') {
    return 3
  }

  if (note.analysisStatus === 'fallback') {
    return 2
  }

  return 1
}

function analysisQueueReason(note, mode) {
  if (mode === 'local') {
    return note.analysisStatus === 'error'
      ? 'Previous analysis failed; local fallback can retry without Qwen.'
      : 'New or edited note waiting for local fallback analysis.'
  }

  if (note.analysisStatus === 'fallback') {
    return 'Local fallback result can be upgraded with Qwen and stored RAG context.'
  }

  if (note.analysisStatus === 'error') {
    return 'Previous analysis failed; Qwen can retry when the model is ready.'
  }

  return 'New or edited note waiting for Qwen analysis.'
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

function mcpHandoff(database) {
  const notesById = new Map(database.notes.map((note) => [note.id, note]))
  const openActions = database.actions
    .filter((action) => action.status === 'open' && notesById.has(action.noteId))
    .sort(compareActionItems)
  const actions = openActions.map((action) => {
    const note = notesById.get(action.noteId)

    return {
      id: action.id,
      kind: action.kind,
      status: action.status,
      title: action.title,
      detail: action.detail,
      toolHint: action.toolHint ?? null,
      confidence: action.confidence,
      approval: mcpApproval(action),
      toolCallDraft: buildToolCallDraft(action, note),
      createdAt: action.createdAt,
      updatedAt: action.updatedAt,
      sourceNote: {
        id: note.id,
        title: note.title,
        summary: note.summary,
        category: note.category,
        tags: note.tags,
        contentExcerpt: excerpt(note.content, 1200),
        relatedNoteIds: note.related.map((related) => related.noteId),
        analysis: note.analysisRun
          ? {
              provider: note.analysisRun.provider,
              model: note.analysisRun.model,
              analyzedAt: note.analysisRun.analyzedAt,
              ragNoteIds: note.analysisRun.ragNoteIds,
              ragContext: note.analysisRun.ragContext ?? []
            }
          : null
      }
    }
  })

  return {
    schema: 'neuronotes.mcp-handoff.v1',
    exportedAt: new Date().toISOString(),
    execution: {
      mode: 'manual-user-approved',
      requiresUserApproval: true,
      sideEffects: 'none-export-only'
    },
    model: database.settings.model,
    ollamaUrl: database.settings.ollamaUrl,
    actionCount: actions.length,
    approvedActionCount: actions.filter((action) => action.approval.state === 'approved').length,
    doneActionCount: database.actions.filter((action) => action.status === 'done').length,
    toolSummary: buildToolSummary(actions),
    kindSummary: buildKindSummary(actions),
    actions
  }
}

function compareActionItems(a, b) {
  if (a.status !== b.status) {
    return a.status === 'open' ? -1 : 1
  }

  return b.updatedAt.localeCompare(a.updatedAt)
}

function buildToolSummary(actions) {
  const summary = new Map()

  for (const action of actions) {
    const toolHint = action.toolHint ?? 'unassigned'
    const entry = summary.get(toolHint) ?? {
      kinds: new Set(),
      sourceNoteIds: new Set(),
      actionCount: 0
    }
    entry.actionCount += 1
    entry.kinds.add(action.kind)
    entry.sourceNoteIds.add(action.sourceNote.id)
    summary.set(toolHint, entry)
  }

  return [...summary.entries()]
    .map(([toolHint, entry]) => ({
      toolHint,
      actionCount: entry.actionCount,
      kinds: [...entry.kinds].sort((a, b) => a.localeCompare(b)),
      sourceNoteIds: [...entry.sourceNoteIds].sort((a, b) => a.localeCompare(b))
    }))
    .sort((a, b) => b.actionCount - a.actionCount || a.toolHint.localeCompare(b.toolHint))
}

function buildKindSummary(actions) {
  const summary = new Map()

  for (const action of actions) {
    summary.set(action.kind, (summary.get(action.kind) ?? 0) + 1)
  }

  return [...summary.entries()]
    .map(([kind, actionCount]) => ({ kind, actionCount }))
    .sort((a, b) => b.actionCount - a.actionCount || a.kind.localeCompare(b.kind))
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

function librarySummary(database, dbPath, context = {}) {
  const categoryCounts = countBy(database.notes, (note) => note.category)
  const statusCounts = countBy(database.notes, (note) => note.analysisStatus)
  const actionCounts = countBy(database.actions, (action) => action.status)
  const approvedActionCount = database.actions.filter((action) => action.status === 'open' && action.mcpApprovedAt).length
  const writeEnabled = isWriteEnabled(context)

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
    qwenSetup: qwenSetup(database, { includeCommands: false }),
    aiDiagnostics: database.aiDiagnostics ?? null,
    qwenAnalyzedCount: statusCounts.qwen ?? 0,
    fallbackAnalyzedCount: statusCounts.fallback ?? 0,
    categories: categoryCounts,
    analysisStatuses: statusCounts,
    actionStatuses: actionCounts,
    execution: {
      mode: writeEnabled ? 'write-enabled-notes' : 'read-only-context',
      canModifyNotes: writeEnabled,
      canCreateNotes: writeEnabled,
      canExecuteExternalTools: false,
      requiresUserApprovalForFollowUp: true
    }
  }
}

function qwenSetup(database, options = {}) {
  const settings = database.settings
  const diagnosticStatus = qwenDiagnosticStatus(settings, database.aiDiagnostics)
  const includeCommands = options.includeCommands !== false

  const payload = {
    schema: 'neuronotes.mcp.qwen-setup.v1',
    targetModel: settings.model,
    ollamaUrl: settings.ollamaUrl,
    ragSettings: {
      maxNotes: settings.ragMaxNotes,
      excerptLength: settings.ragExcerptLength
    },
    diagnosticStatus,
    aiDiagnostics: database.aiDiagnostics ?? null,
    mcpPosture: {
      readOnly: true,
      sideEffects: 'none',
      canInstallOllama: false,
      canPullModel: false,
      canRunDiagnostics: false
    }
  }

  if (includeCommands) {
    payload.commands = qwenSetupCommands(settings)
  }

  return payload
}

function qwenDiagnosticStatus(settings, diagnostics) {
  if (!diagnostics) {
    return 'missing'
  }

  if (
    diagnostics.model !== settings.model ||
    diagnostics.ollamaUrl !== settings.ollamaUrl ||
    diagnostics.ragMaxNotes !== settings.ragMaxNotes ||
    diagnostics.ragExcerptLength !== settings.ragExcerptLength
  ) {
    return 'stale'
  }

  return diagnostics.ok && diagnostics.status === 'qwen' ? 'verified' : 'failed'
}

function qwenSetupCommands(settings) {
  return {
    windowsRepo: [
      {
        label: 'Install Ollama, pull Qwen, and verify JSON/RAG from the repo',
        command: 'npm run setup:qwen:win:install'
      },
      {
        label: 'Pull the configured Qwen model from the repo',
        command: 'npm run setup:qwen:win:pull'
      },
      {
        label: 'Verify the configured Qwen runtime from the repo',
        command: 'npm run verify:qwen:start:json'
      }
    ],
    manual: [
      {
        label: 'Install Ollama with the official Windows script',
        command: 'irm https://ollama.com/install.ps1 | iex'
      },
      {
        label: 'Pull the configured Qwen model',
        command: `ollama pull ${settings.model}`
      },
      {
        label: 'Start Ollama for the configured endpoint',
        command: `$env:OLLAMA_HOST = '${ollamaHost(settings.ollamaUrl)}'; ollama serve`
      }
    ],
    verification: {
      endpoint: settings.ollamaUrl,
      model: settings.model,
      expectedContract: 'Neuronotes JSON analysis with summary, category, tags, related notes, suggested actions, and stored RAG context.'
    }
  }
}

function ollamaHost(ollamaUrl) {
  try {
    const url = new URL(ollamaUrl)
    const port = url.port || (url.protocol === 'https:' ? '443' : '11434')
    return `${url.hostname}:${port}`
  } catch {
    return '127.0.0.1:11434'
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

function scoreNote(note, query, tags, savedActions = []) {
  let score = tags.length > 0 ? tags.length * 0.3 : 0

  if (!query) {
    return score
  }

  const title = normalizeText(note.title)
  const summary = normalizeText(note.summary)
  const content = normalizeText(note.content)
  const category = normalizeText(note.category)
  const noteTags = normalizeText(note.tags.join(' '))
  const related = normalizeText(note.related.map((item) => `${item.title} ${item.reason}`).join(' '))
  const actions = normalizeText(
    note.suggestedActions
      .map((action) => `${action.kind} ${action.title} ${action.detail} ${action.toolHint ?? ''}`)
      .join(' ')
  )
  const savedActionsText = normalizeText(
    savedActions
      .map((action) => `${action.status} ${action.kind} ${action.title} ${action.detail} ${action.toolHint ?? ''}`)
      .join(' ')
  )
  const rag = normalizeText(
    [
      note.analysisRun?.provider ?? '',
      note.analysisRun?.model ?? '',
      note.analysisRun?.ragNoteIds?.join(' ') ?? '',
      ...(note.analysisRun?.ragContext ?? []).map(
        (item) => `${item.title} ${item.category} ${item.tags.join(' ')} ${item.reason} ${item.excerpt}`
      )
    ].join(' ')
  )
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
  if (actions.includes(query)) {
    score += 2.4
  }
  if (savedActionsText.includes(query)) {
    score += 2.2
  }
  if (related.includes(query) || rag.includes(query)) {
    score += 1.8
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
    if (actions.includes(term)) {
      score += 1.1
    }
    if (savedActionsText.includes(term)) {
      score += 1
    }
    if (related.includes(term) || rag.includes(term)) {
      score += 0.8
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
  const settings = normalizeSettings(source.settings)

  return {
    version: 1,
    notes: normalizedNotes,
    actions,
    settings,
    aiDiagnostics: normalizeAiDiagnostics(source.aiDiagnostics, settings)
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

function normalizeAiDiagnostics(value, settings) {
  if (!isObject(value)) {
    return undefined
  }

  const model = stringArg(value.model)
  const ollamaUrl = stringArg(value.ollamaUrl).replace(/\/$/, '')

  if (
    model !== settings.model ||
    ollamaUrl !== settings.ollamaUrl ||
    value.ragMaxNotes !== settings.ragMaxNotes ||
    value.ragExcerptLength !== settings.ragExcerptLength
  ) {
    return undefined
  }

  const status = normalizeAnalysisStatus(value.status)
  const diagnosedAt = stringArg(value.diagnosedAt)
  const message = stringArg(value.message)

  if (!diagnosedAt || !message) {
    return undefined
  }

  const result = {
    ok: Boolean(value.ok),
    status,
    message: excerpt(message, 240),
    model,
    ollamaUrl,
    ragMaxNotes: settings.ragMaxNotes,
    ragExcerptLength: settings.ragExcerptLength,
    diagnosedAt,
    durationMs: clampInteger(value.durationMs, 0, Number.MAX_SAFE_INTEGER, 0),
    category: excerpt(stringArg(value.category) || 'Inbox', 80),
    summary: excerpt(stringArg(value.summary), 320),
    related: clampInteger(value.related, 0, Number.MAX_SAFE_INTEGER, 0)
  }

  const error = stringArg(value.error)
  if (error) {
    result.error = excerpt(error, 240)
  }

  return result
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

function graphLimitArg(value) {
  return clampInteger(value, 1, MAX_GRAPH_NODES, MAX_GRAPH_NODES)
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
  const writeEnabled = options.writeEnabled === true
  const lines = createInterface({
    input: process.stdin,
    crlfDelay: Number.POSITIVE_INFINITY
  })

  process.stderr.write(`Neuronotes MCP stdio server reading ${dbPath}${writeEnabled ? ' with write tools enabled' : ''}\n`)

  for await (const line of lines) {
    const trimmed = line.trim()

    if (!trimmed) {
      continue
    }

    try {
      const response = await handleMcpMessage(JSON.parse(trimmed), { dbPath, writeEnabled })

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
