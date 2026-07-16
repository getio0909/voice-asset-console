import { readFile } from 'node:fs/promises'

const recorded = (await readFile(new URL('../CONTRACT_VERSION', import.meta.url), 'utf8')).trim()
const source = await readFile(new URL('../src/config/contract.ts', import.meta.url), 'utf8')
const compiled = source.match(/CONTRACT_VERSION\s*=\s*'([^']+)'/)?.[1]

if (!compiled || compiled !== recorded) {
  throw new Error(
    `Contract pin mismatch: CONTRACT_VERSION=${recorded || '<empty>'}, client=${compiled || '<missing>'}`,
  )
}

console.log(`Contract version ${recorded} is pinned consistently.`)
