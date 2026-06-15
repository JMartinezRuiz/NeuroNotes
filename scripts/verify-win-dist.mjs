#!/usr/bin/env node

import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const productName = packageJson.build?.productName || packageJson.name || 'Neuronotes'
const version = packageJson.version
const releaseDir = path.join(root, packageJson.build?.directories?.output || 'release')

const requiredArtifacts = [
  {
    label: 'NSIS installer',
    relativePath: `${productName} Setup ${version}.exe`,
    minBytes: 10 * 1024 * 1024
  },
  {
    label: 'installer blockmap',
    relativePath: `${productName} Setup ${version}.exe.blockmap`,
    minBytes: 1024
  },
  {
    label: 'update metadata',
    relativePath: 'latest.yml',
    minBytes: 32
  },
  {
    label: 'unpacked executable',
    relativePath: path.join('win-unpacked', `${productName}.exe`),
    minBytes: 10 * 1024 * 1024
  },
  {
    label: 'asar bundle',
    relativePath: path.join('win-unpacked', 'resources', 'app.asar'),
    minBytes: 1024 * 1024
  },
  {
    label: 'MCP stdio server',
    relativePath: path.join('win-unpacked', 'resources', 'mcp', 'neuronotes-mcp.mjs'),
    minBytes: 8 * 1024,
    includes: [
      'neuronotes_search_notes',
      'neuronotes://library/summary',
      'neuronotes_review_rag_analysis'
    ]
  }
]

const results = []

for (const artifact of requiredArtifacts) {
  const fullPath = path.join(releaseDir, artifact.relativePath)

  try {
    const stats = await stat(fullPath)
    const contentOk = artifact.includes ? await fileIncludes(fullPath, artifact.includes) : true
    results.push({
      ...artifact,
      fullPath,
      size: stats.size,
      contentOk,
      ok: stats.isFile() && stats.size >= artifact.minBytes && contentOk
    })
  } catch {
    results.push({
      ...artifact,
      fullPath,
      size: 0,
      contentOk: false,
      ok: false
    })
  }
}

const failed = results.filter((result) => !result.ok)

if (failed.length > 0) {
  console.error('Neuronotes Windows distribution verification failed')
  for (const result of failed) {
    const reason = result.size >= result.minBytes && result.includes ? 'missing expected MCP content' : 'missing or too small'
    console.error(`- ${result.label}: ${reason} at ${result.fullPath}`)
  }
  process.exitCode = 1
} else {
  console.log('Neuronotes Windows distribution verification')
  for (const result of results) {
    console.log(`- ${result.label}: ${result.relativePath} (${result.size} bytes)`)
  }
}

async function fileIncludes(filePath, needles) {
  const content = await readFile(filePath, 'utf8')
  return needles.every((needle) => content.includes(needle))
}
