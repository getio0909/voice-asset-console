import { randomUUID } from 'node:crypto'

import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

interface CreatedAPIKeyResponse {
  api_key: {
    id: string
    name: string
    token_prefix: string
    scopes: string[]
    revoked_at: string | null
  }
  token: string
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required for the live E2E.`)
  }
  return value
}

async function cleanupAPIKey(page: Page, apiKeyId: string | undefined): Promise<void> {
  if (!apiKeyId) {
    return
  }

  const cleanupResponse = await page.context().request.delete(`/api/v1/api-keys/${apiKeyId}`, {
    headers: { Origin: new URL(page.url()).origin },
  })
  if (![200, 404].includes(cleanupResponse.status())) {
    throw new Error(`API-key cleanup failed with status ${cleanupResponse.status()}.`)
  }
}

test.use({ screenshot: 'off', trace: 'off', video: 'off' })

test.describe('live deployed API-key lifecycle', () => {
  test.describe.configure({ retries: 0 })

  // eslint-disable-next-line playwright/no-skipped-test -- This live mutation is explicit and self-cleaning.
  test.skip(
    process.env.VOICEASSET_LIVE_E2E !== '1',
    'Set VOICEASSET_LIVE_E2E=1 with ephemeral owner credentials and a deployed Console.',
  )

  test('creates, displays once, and revokes a least-privilege key', async ({ page }) => {
    const email = requiredEnvironment('VOICEASSET_LIVE_OWNER_EMAIL')
    const password = requiredEnvironment('VOICEASSET_LIVE_OWNER_PASSWORD')
    const keyName = `live-e2e-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`
    let cleanupKeyId: string | undefined

    try {
      await page.goto('/assets')
      await expect(page.getByRole('heading', { level: 2, name: 'Sign in' })).toBeVisible()
      await page.getByLabel('Email').fill(email)
      await page.getByLabel('Password').fill(password)
      await page.getByRole('button', { name: 'Sign in securely' }).click()
      await expect(page.getByText(email)).toBeVisible()

      await page.getByRole('link', { name: 'API keys' }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'API keys' })).toBeVisible()
      await page.getByLabel('Name').fill(keyName)
      await page.getByRole('checkbox', { name: /^assets:read\b/ }).check()

      const createResponsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url())
        return response.request().method() === 'POST' && url.pathname === '/api/v1/api-keys'
      })
      await page.getByRole('button', { name: 'Create one-time token' }).click()
      const createResponse = await createResponsePromise
      expect(createResponse.status()).toBe(201)

      const created = (await createResponse.json()) as CreatedAPIKeyResponse
      cleanupKeyId = created.api_key.id
      expect(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanupKeyId),
      ).toBe(true)
      expect(/^va_pat_[A-Za-z0-9_-]{43}$/.test(created.token)).toBe(true)
      expect(created.api_key.name).toBe(keyName)
      expect(created.api_key.scopes).toEqual(['assets:read'])
      expect(created.api_key.revoked_at).toBeNull()

      await expect(page.getByRole('heading', { name: 'Copy this token now' })).toBeVisible()
      const renderedToken = await page.getByLabel('Plaintext API token').inputValue()
      expect(renderedToken === created.token).toBe(true)
      expect(
        await page.evaluate(() => ({
          local: Object.keys(localStorage),
          session: Object.keys(sessionStorage),
        })),
      ).toEqual({ local: [], session: [] })

      await page.getByRole('button', { name: 'I have stored it; dismiss' }).click()
      await expect(page.getByLabel('Plaintext API token')).toHaveCount(0)

      const keyRow = page.locator('.api-key-list li').filter({ hasText: keyName })
      await expect(keyRow).toHaveCount(1)
      const revokeResponsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url())
        return (
          response.request().method() === 'DELETE' &&
          url.pathname === `/api/v1/api-keys/${cleanupKeyId}`
        )
      })
      await keyRow.getByRole('button', { name: `Revoke ${keyName}` }).click()
      const revokeResponse = await revokeResponsePromise
      expect(revokeResponse.status()).toBe(200)
      cleanupKeyId = undefined
      await expect(keyRow.getByText('Revoked', { exact: true })).toBeVisible()

      const accessibility = await new AxeBuilder({ page }).analyze()
      expect(accessibility.violations).toEqual([])
    } finally {
      await cleanupAPIKey(page, cleanupKeyId)
    }
  })
})
