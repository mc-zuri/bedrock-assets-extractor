#!/usr/bin/env node
const path = require('path')
const { extract, plan } = require('..')

const args = process.argv.slice(2)
const options = {}
const versions = []
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--plan') options.plan = true
  else if (a.startsWith('--')) options[a.slice(2)] = args[++i]
  else versions.push(a)
}

const opts = {
  versions: versions.length ? versions : undefined,
  out: options.out && path.resolve(options.out),
  cacheDir: path.resolve(options.cache ?? process.env.BEDROCK_EXTRACTOR_CACHE ?? '.cache'),
  clientsDir: options.clients ?? process.env.BEDROCK_CLIENTS_DIR,
  kinds: options.sources?.split(',')
}

if (options.plan) {
  for (const p of plan(opts)) {
    console.log(`${p.version.padEnd(9)} ${p.source.kind} ${p.source.build} (${p.source.match})` +
      (p.supplement ? `, below it client ${p.supplement.build}` : ''))
  }
} else {
  extract(opts)
}
