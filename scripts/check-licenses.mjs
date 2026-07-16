import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const pnpmCli = process.env.npm_execpath

if (!pnpmCli) {
  throw new Error('Run this check through pnpm so the pinned package manager is used.')
}

const result = spawnSync(process.execPath, [pnpmCli, 'licenses', 'list', '--prod', '--json'], {
  encoding: 'utf8',
})

if (result.status !== 0) {
  process.stderr.write(result.stderr)
  process.exit(result.status ?? 1)
}

const inventory = JSON.parse(result.stdout)
const licenseNames = Object.keys(inventory)
const missingMetadata = licenseNames.filter((name) => /^(unknown|unlicensed)$/i.test(name.trim()))

if (missingMetadata.length > 0) {
  console.error(`Dependencies with missing license metadata: ${missingMetadata.join(', ')}`)
  process.exit(1)
}

const outputFlag = process.argv.indexOf('--output')
if (outputFlag >= 0) {
  const outputPath = process.argv[outputFlag + 1]
  if (!outputPath) {
    throw new Error('--output requires a file path')
  }
  writeFileSync(outputPath, `${JSON.stringify(inventory, null, 2)}\n`, 'utf8')
}

console.log(`Checked ${licenseNames.length} declared production license group(s).`)
