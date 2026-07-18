import { defineConfig, devices } from '@playwright/test'

const port = Number.parseInt(process.env.VOICEASSET_CONSOLE_PORT ?? '4173', 10)
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new Error('VOICEASSET_CONSOLE_PORT must be a valid TCP port.')
}

function deploymentOrigin(value: string | undefined): string | undefined {
  const candidate = value?.trim()
  if (!candidate) return undefined

  const url = new URL(candidate)
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('VOICEASSET_CONSOLE_BASE_URL must be an HTTP(S) origin.')
  }
  return url.origin
}

const deploymentBaseURL = deploymentOrigin(process.env.VOICEASSET_CONSOLE_BASE_URL)
const baseURL = deploymentBaseURL ?? `http://127.0.0.1:${port}`
const allowInternalCA = process.env.VOICEASSET_E2E_ALLOW_INTERNAL_CA === '1'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    ignoreHTTPSErrors: allowInternalCA,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: deploymentBaseURL
    ? undefined
    : {
        command: `pnpm exec vite preview --host 127.0.0.1 --port ${port}`,
        url: baseURL,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
      },
})
