#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_MODEL = 'qwen3.5:0.8b'
const DEFAULT_ENDPOINT = 'http://127.0.0.1:11434'
const DEFAULT_TIMEOUT_MS = 600000
const DEFAULT_START_TIMEOUT_MS = 15000

function parseArgs(argv) {
  const options = {
    endpoint: process.env.OLLAMA_URL || DEFAULT_ENDPOINT,
    model: process.env.NEURONOTES_MODEL || DEFAULT_MODEL,
    pull: false,
    start: false,
    json: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    startTimeoutMs: DEFAULT_START_TIMEOUT_MS,
    help: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--pull') {
      options.pull = true
    } else if (arg === '--start') {
      options.start = true
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
    } else if (arg === '--start-timeout-ms') {
      options.startTimeoutMs = Number(readValue(argv, index, arg))
      index += 1
    } else if (arg.startsWith('--start-timeout-ms=')) {
      options.startTimeoutMs = Number(arg.slice('--start-timeout-ms='.length))
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  options.endpoint = normalizeEndpoint(options.endpoint)
  options.model = options.model.trim() || DEFAULT_MODEL
  options.timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : DEFAULT_TIMEOUT_MS
  options.startTimeoutMs =
    Number.isFinite(options.startTimeoutMs) && options.startTimeoutMs > 0
      ? options.startTimeoutMs
      : DEFAULT_START_TIMEOUT_MS
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
  npm run verify:qwen:start
  npm run verify:qwen:pull
  npm run verify:qwen:json
  node scripts/verify-qwen.mjs --model qwen3.5:0.8b --endpoint http://127.0.0.1:11434

Options:
  --start             Try to start Ollama locally before verifying.
  --pull              Pull the configured model if it is missing.
  --model <name>      Ollama model to verify. Default: ${DEFAULT_MODEL}
  --endpoint <url>    Ollama endpoint. Default: ${DEFAULT_ENDPOINT}
  --timeout-ms <ms>   Request timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --start-timeout-ms <ms>
                      Time to wait for Ollama after --start. Default: ${DEFAULT_START_TIMEOUT_MS}
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
    `${endpoint}/api/chat`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(buildChatPayload(model))
    },
    timeoutMs
  )

  if (payload.error) {
    throw new Error(payload.error)
  }

  const content = payload.message?.content?.trim()

  if (!content) {
    throw new Error('Ollama returned no response content')
  }

  return {
    durationMs: Date.now() - startedAt,
    analysis: validateProbeAnalysis(parseJson(content))
  }
}

function buildChatPayload(model) {
  return {
    model,
    stream: false,
    think: false,
    format: 'json',
    options: {
      temperature: 0.2,
      num_predict: 320
    },
    messages: [
      {
        role: 'user',
        content: buildProbePrompt()
      }
    ]
  }
}

function buildProbePrompt() {
  return `Eres el motor local de Neuronotes. Devuelve solo JSON valido.
No incluyas razonamiento, texto fuera del JSON ni bloques <think>.

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
  const clean = text
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/```(?:json)?/gi, '')
    .trim()
  const start = clean.indexOf('{')
  const end = clean.lastIndexOf('}')

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('The model did not return a JSON object')
  }

  const candidate = clean.slice(start, end + 1)

  try {
    return JSON.parse(candidate)
  } catch {
    return JSON.parse(repairJsonCandidate(candidate))
  }
}

function repairJsonCandidate(value) {
  return value.replace(/,\s*([}\]])/g, '$1')
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
  let runtime

  if (options.start) {
    runtime = await ensureOllamaAvailable(options)

    if (!runtime.ok) {
      return withRecoveryHints({
        ok: false,
        stage: runtime.stage,
        message: runtime.message,
        endpoint: options.endpoint,
        model: options.model,
        runtimeStarted: runtime.started,
        runtimeExecutablePath: runtime.executablePath
      })
    }
  }

  let installedModels

  try {
    installedModels = await getInstalledModels(options.endpoint, options.timeoutMs)
  } catch (error) {
    return buildOllamaConnectionFailureResult(options, error)
  }

  const modelInstalled = installedModels.some((model) => model.toLowerCase() === options.model.toLowerCase())

  if (!modelInstalled) {
    if (!options.pull) {
      return withRecoveryHints({
        ok: false,
        stage: 'model-missing',
        message: `Model ${options.model} is not installed. Run: ollama pull ${options.model}`,
        endpoint: options.endpoint,
        model: options.model,
        installedModels
      })
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
    runtimeStarted: runtime?.started ?? false,
    runtimeExecutablePath: runtime?.executablePath,
    durationMs: probe.durationMs,
    analysis: probe.analysis
  }
}

function withRecoveryHints(result) {
  if (result.ok) {
    return result
  }

  return {
    ...result,
    nextSteps: recoveryNextSteps(result.stage, result.model),
    setupCommands: recoverySetupCommands(result.stage, result.model)
  }
}

function recoveryNextSteps(stage, model = DEFAULT_MODEL) {
  if (stage === 'ollama-not-installed') {
    return [
      'Install Ollama locally.',
      `Pull the configured Qwen model: ${model}.`,
      'Run npm run setup:qwen:win:install on Windows to install Ollama, pull Qwen, and verify JSON generation.'
    ]
  }

  if (stage === 'model-missing') {
    return [
      `Pull the configured Qwen model: ${model}.`,
      'Run npm run verify:qwen:start:json to confirm Neuronotes can generate valid JSON.'
    ]
  }

  if (stage === 'ollama-unavailable' || stage === 'ollama-start-failed') {
    return [
      'Start Ollama locally.',
      `Ensure the configured model is installed: ${model}.`,
      'Run npm run verify:qwen:start:json again.'
    ]
  }

  return ['Review the verifier message, then run npm run verify:qwen:start:json again.']
}

function recoverySetupCommands(stage, model = DEFAULT_MODEL) {
  if (stage === 'ollama-not-installed') {
    return [
      'npm run setup:qwen:win:install',
      'irm https://ollama.com/install.ps1 | iex',
      `ollama pull ${model}`,
      'npm run verify:qwen:start:json'
    ]
  }

  if (stage === 'model-missing') {
    return [`ollama pull ${model}`, 'npm run verify:qwen:start:json']
  }

  if (stage === 'ollama-unavailable' || stage === 'ollama-start-failed') {
    return ['npm run verify:qwen:start:json']
  }

  return ['npm run verify:qwen:start:json']
}

async function buildOllamaConnectionFailureResult(options, error) {
  const executablePath = await findOllamaExecutable()
  const stage = classifyOllamaConnectionFailure(options.endpoint, executablePath)
  const fallbackMessage = error instanceof Error ? error.message : 'Ollama verification failed'

  return withRecoveryHints({
    ok: false,
    stage,
    message:
      stage === 'ollama-not-installed'
        ? 'Ollama executable not found. Install Ollama or add it to PATH.'
        : fallbackMessage,
    endpoint: options.endpoint,
    model: options.model,
    runtimeExecutablePath: executablePath
  })
}

function classifyOllamaConnectionFailure(endpoint, executablePath) {
  if (executablePath) {
    return 'ollama-unavailable'
  }

  return isLocalEndpoint(endpoint) ? 'ollama-not-installed' : 'ollama-unavailable'
}

function isLocalEndpoint(endpoint) {
  try {
    const url = new URL(endpoint)
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)
  } catch {
    return false
  }
}

async function ensureOllamaAvailable(options) {
  if (await canReachOllama(options.endpoint)) {
    return {
      ok: true,
      started: false
    }
  }

  const executablePath = await findOllamaExecutable()

  if (!executablePath) {
    return {
      ok: false,
      stage: 'ollama-not-installed',
      started: false,
      message: 'Ollama executable not found. Install Ollama or add it to PATH.'
    }
  }

  try {
    const child = spawn(executablePath, ['serve'], {
      detached: true,
      env: {
        ...process.env,
        ...resolveOllamaHostEnv(options.endpoint)
      },
      stdio: 'ignore',
      windowsHide: true
    })

    child.unref()
  } catch (error) {
    return {
      ok: false,
      stage: 'ollama-start-failed',
      started: false,
      executablePath,
      message: error instanceof Error ? error.message : 'Failed to start Ollama.'
    }
  }

  const reachable = await waitForOllama(options.endpoint, options.startTimeoutMs)

  return {
    ok: reachable,
    stage: reachable ? 'ready' : 'ollama-unavailable',
    started: true,
    executablePath,
    message: reachable ? 'Ollama started.' : 'Ollama did not respond after starting.'
  }
}

async function canReachOllama(endpoint) {
  try {
    await getInstalledModels(endpoint, 3500)
    return true
  } catch {
    return false
  }
}

async function waitForOllama(endpoint, timeoutMs) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (await canReachOllama(endpoint)) {
      return true
    }

    await sleep(700)
  }

  return false
}

async function findOllamaExecutable() {
  const candidates = unique([
    ...(process.env.OLLAMA_PATH ? [process.env.OLLAMA_PATH] : []),
    ...pathCandidates('ollama'),
    ...windowsOllamaCandidates()
  ])

  for (const candidate of candidates) {
    if (await exists(candidate)) {
      return candidate
    }
  }

  return undefined
}

function pathCandidates(command) {
  const entries = (process.env.PATH ?? '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
  const names = process.platform === 'win32' ? [`${command}.exe`, command] : [command]

  return entries.flatMap((entry) => names.map((name) => path.join(entry, name)))
}

function windowsOllamaCandidates() {
  if (process.platform !== 'win32') {
    return []
  }

  return [
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Ollama', 'ollama.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Ollama', 'ollama.exe'),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Ollama', 'ollama.exe'),
    process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Ollama', 'ollama.exe')
  ].filter(Boolean)
}

async function exists(filePath) {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function resolveOllamaHostEnv(endpoint) {
  try {
    const url = new URL(endpoint)
    const port = url.port || (url.protocol === 'https:' ? '443' : '11434')

    return {
      OLLAMA_HOST: `${url.hostname}:${port}`
    }
  } catch {
    return {}
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
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
    if (result.nextSteps?.length) {
      console.log('Next steps:')
      for (const step of result.nextSteps) {
        console.log(`- ${step}`)
      }
    }
    if (result.setupCommands?.length) {
      console.log('Commands:')
      for (const command of result.setupCommands) {
        console.log(`  ${command}`)
      }
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
    const result = withRecoveryHints({
      ok: false,
      stage: 'ollama-unavailable',
      message: error instanceof Error ? error.message : 'Ollama verification failed',
      endpoint: options.endpoint,
      model: options.model
    })

    if (options.json) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      printHuman(result)
    }

    process.exitCode = 1
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main()
}

export {
  buildChatPayload,
  buildProbePrompt,
  parseArgs,
  parseJson,
  validateProbeAnalysis,
  classifyOllamaConnectionFailure,
  recoveryNextSteps,
  recoverySetupCommands,
  resolveOllamaHostEnv,
  verifyQwen
}
