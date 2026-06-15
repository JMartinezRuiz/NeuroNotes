#!/usr/bin/env node

import { fileURLToPath } from 'node:url'

const DEFAULT_MODEL = 'qwen3.5:0.8b'
const DEFAULT_ENDPOINT = 'http://127.0.0.1:11434'
const DEFAULT_TIMEOUT_MS = 600000

function parseArgs(argv) {
  const options = {
    endpoint: process.env.OLLAMA_URL || DEFAULT_ENDPOINT,
    model: process.env.NEURONOTES_MODEL || DEFAULT_MODEL,
    pull: false,
    json: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    help: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--pull') {
      options.pull = true
    } else if (arg === '--json') {
      options.json = true
    } else if (arg === '--endpoint') {
      options.endpoint = readValue(argv, index, arg)
      index += 1
    } else if (arg.startsWith('--endpoint=')) {
      options.endpoint = arg.slice('--endpoint='.length)
    } else if (arg === '--model') {
      options.model = readValue(argv, index, arg)
      index += 1
    } else if (arg.startsWith('--model=')) {
      options.model = arg.slice('--model='.length)
    } else if (arg === '--timeout-ms') {
      options.timeoutMs = Number(readValue(argv, index, arg))
      index += 1
    } else if (arg.startsWith('--timeout-ms=')) {
      options.timeoutMs = Number(arg.slice('--timeout-ms='.length))
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  options.endpoint = normalizeEndpoint(options.endpoint)
  options.model = options.model.trim() || DEFAULT_MODEL
  options.timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : DEFAULT_TIMEOUT_MS
  return options
}

function readValue(argv, index, name) {
  const value = argv[index + 1]

  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value`)
  }

  return value
}

function normalizeEndpoint(value) {
  return (value || DEFAULT_ENDPOINT).trim().replace(/\/$/, '')
}

function usage() {
  return `Neuronotes Qwen verifier

Usage:
  npm run verify:qwen
  npm run verify:qwen:pull
  npm run verify:qwen:json
  node scripts/verify-qwen.mjs --model qwen3.5:0.8b --endpoint http://127.0.0.1:11434

Options:
  --pull              Pull the configured model if it is missing.
  --model <name>      Ollama model to verify. Default: ${DEFAULT_MODEL}
  --endpoint <url>    Ollama endpoint. Default: ${DEFAULT_ENDPOINT}
  --timeout-ms <ms>   Request timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --json              Print machine-readable result JSON.
`
}

async function requestJson(url, init = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  let response

  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs)
    })
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Request failed')
  }

  const text = await response.text()

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`)
  }

  try {
    return text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`Invalid JSON from ${url}: ${text.slice(0, 300)}`)
  }
}

async function getInstalledModels(endpoint, timeoutMs) {
  const payload = await requestJson(`${endpoint}/api/tags`, { method: 'GET' }, timeoutMs)
  return (payload.models ?? [])
    .map((model) => model.name || model.model || '')
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
}

async function pullModel(endpoint, model, timeoutMs) {
  const payload = await requestJson(
    `${endpoint}/api/pull`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: model,
        stream: false
      })
    },
    timeoutMs
  )

  if (payload.error) {
    throw new Error(payload.error)
  }
}

async function generateProbe(endpoint, model, timeoutMs) {
  const startedAt = Date.now()
  const payload = await requestJson(
    `${endpoint}/api/generate`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        stream: false,
        format: 'json',
        options: {
          temperature: 0.2,
          num_predict: 320
        },
        prompt: buildProbePrompt()
      })
    },
    timeoutMs
  )

  if (payload.error) {
    throw new Error(payload.error)
  }

  if (!payload.response) {
    throw new Error('Ollama returned no response content')
  }

  return {
    durationMs: Date.now() - startedAt,
    analysis: validateProbeAnalysis(parseJson(payload.response))
  }
}

function buildProbePrompt() {
  return `Eres el motor local de Neuronotes. Devuelve solo JSON valido.

Analiza esta nota:
Proyecto Neuronotes: usar Qwen 0.8B con RAG local para resumir, categorizar y enlazar notas rapidas.

Contexto recuperado:
ID: context-note
Titulo: Roadmap RAG local
Categoria: Proyecto
Etiquetas: qwen, rag
Puntuacion: 82%
Motivo: Comparte el objetivo del producto.
Extracto: Neuronotes convierte notas rapidas en una base conectada con resumen, categorias y enlaces.

Forma exacta:
{
  "title": "maximo 8 palabras",
  "summary": "resumen en una frase",
  "category": "Proyecto",
  "tags": ["qwen", "rag"],
  "related": [{ "noteId": "context-note", "reason": "motivo breve" }],
  "suggestedActions": [{ "kind": "task", "title": "accion breve", "detail": "detalle breve", "confidence": 0.7 }]
}`
}

function parseJson(text) {
  const clean = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  const start = clean.indexOf('{')
  const end = clean.lastIndexOf('}')

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('The model did not return a JSON object')
  }

  return JSON.parse(clean.slice(start, end + 1))
}

function validateProbeAnalysis(payload) {
  const summary = typeof payload.summary === 'string' ? payload.summary.trim() : ''
  const category = typeof payload.category === 'string' ? payload.category.trim() : ''
  const tags = Array.isArray(payload.tags) ? payload.tags.filter((tag) => typeof tag === 'string') : []
  const related = Array.isArray(payload.related) ? payload.related : []

  if (!summary || !category || tags.length === 0) {
    throw new Error('The model JSON is missing summary, category, or tags')
  }

  return {
    title: typeof payload.title === 'string' ? payload.title.trim() : '',
    summary,
    category,
    tags,
    relatedCount: related.length,
    suggestedActionCount: Array.isArray(payload.suggestedActions) ? payload.suggestedActions.length : 0
  }
}

async function verifyQwen(options) {
  const installedModels = await getInstalledModels(options.endpoint, options.timeoutMs)
  const modelInstalled = installedModels.some((model) => model.toLowerCase() === options.model.toLowerCase())

  if (!modelInstalled) {
    if (!options.pull) {
      return {
        ok: false,
        stage: 'model-missing',
        message: `Model ${options.model} is not installed. Run: ollama pull ${options.model}`,
        endpoint: options.endpoint,
        model: options.model,
        installedModels
      }
    }

    await pullModel(options.endpoint, options.model, options.timeoutMs)
  }

  const probe = await generateProbe(options.endpoint, options.model, options.timeoutMs)

  return {
    ok: true,
    stage: 'ready',
    message: `${options.model} generated a valid Neuronotes analysis`,
    endpoint: options.endpoint,
    model: options.model,
    installedModels: modelInstalled ? installedModels : await getInstalledModels(options.endpoint, options.timeoutMs),
    durationMs: probe.durationMs,
    analysis: probe.analysis
  }
}

function printHuman(result) {
  console.log('Neuronotes Qwen verification')
  console.log(`Endpoint: ${result.endpoint}`)
  console.log(`Model: ${result.model}`)

  if (!result.ok) {
    console.log(`Status: ${result.stage}`)
    console.log(result.message)
    if (result.installedModels?.length) {
      console.log(`Installed models: ${result.installedModels.join(', ')}`)
    }
    return
  }

  console.log('Status: ready')
  console.log(`Generation: ${result.durationMs} ms`)
  console.log(`Summary: ${result.analysis.summary}`)
  console.log(`Category: ${result.analysis.category}`)
  console.log(`Tags: ${result.analysis.tags.join(', ')}`)
  console.log(`Related: ${result.analysis.relatedCount}`)
  console.log(`Suggested actions: ${result.analysis.suggestedActionCount}`)
}

async function main() {
  let options

  try {
    options = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Invalid arguments')
    console.error('')
    console.error(usage())
    process.exitCode = 2
    return
  }

  if (options.help) {
    console.log(usage())
    return
  }

  try {
    const result = await verifyQwen(options)

    if (options.json) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      printHuman(result)
    }

    process.exitCode = result.ok ? 0 : 1
  } catch (error) {
    const result = {
      ok: false,
      stage: 'ollama-unavailable',
      message: error instanceof Error ? error.message : 'Ollama verification failed',
      endpoint: options.endpoint,
      model: options.model
    }

    if (options.json) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.error('Neuronotes Qwen verification')
      console.error(`Endpoint: ${result.endpoint}`)
      console.error(`Model: ${result.model}`)
      console.error('Status: ollama-unavailable')
      console.error(result.message)
      console.error(`Install/start Ollama, then run: ollama pull ${result.model}`)
    }

    process.exitCode = 1
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main()
}

export {
  buildProbePrompt,
  parseArgs,
  parseJson,
  validateProbeAnalysis,
  verifyQwen
}
