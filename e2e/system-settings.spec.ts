import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { CONTRACT_VERSION, REQUIRED_SERVER_FEATURES } from '../src/config/contract'

const workspaceId = '10000000-0000-4000-8000-000000000001'
const ownerId = '20000000-0000-4000-8000-000000000002'

test('reads the allowlisted deployment settings without exposing a mutation workflow', async ({
  page,
}) => {
  let settingsReads = 0
  const unsafeRequests: string[] = []

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()

    if (!['GET', 'HEAD'].includes(method)) unsafeRequests.push(`${method} ${path}`)

    if (method === 'GET' && path === '/api/v1/system/capabilities') {
      await route.fulfill({
        json: {
          server_version: '0.1.0-dev',
          api_version: 'v1',
          contract_version: CONTRACT_VERSION,
          features: [...REQUIRED_SERVER_FEATURES],
        },
      })
      return
    }
    if (method === 'GET' && path === '/api/v1/auth/session') {
      await route.fulfill({
        json: {
          user: {
            id: ownerId,
            workspace_id: workspaceId,
            role: 'owner',
            email: 'owner@example.com',
            scopes: ['admin:read', 'admin:write'],
          },
        },
      })
      return
    }
    if (method === 'GET' && path === '/api/v1/admin/system-settings') {
      settingsReads += 1
      await route.fulfill({
        json: {
          scope: 'deployment',
          management: 'operator_environment',
          mutable: false,
          brand_name: 'VoiceAsset',
          public_origin: 'https://voice.example.test:10443',
          storage_backend: 'local',
          cookie_secure: true,
          provider_credential_encryption_configured: true,
        },
      })
      return
    }
    await route.fulfill({ status: 404, json: { error: { code: 'not_found' } } })
  })

  await page.goto('/')
  await page.getByRole('link', { name: 'System Settings' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'System Settings' })).toBeVisible()
  const activeConfiguration = page.getByRole('region', { name: 'Active configuration' })
  await expect(activeConfiguration.getByText('VoiceAsset', { exact: true })).toBeVisible()
  await expect(page.getByText('https://voice.example.test:10443', { exact: true })).toBeVisible()
  await expect(page.getByText('Operator-managed environment')).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Read only' })).toBeVisible()
  await expect(page.locator('form')).toHaveCount(0)
  await expect(page.locator('input, textarea, select')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /save/i })).toHaveCount(0)
  expect(settingsReads).toBe(1)

  await page.getByRole('button', { name: 'Refresh settings' }).click()
  await expect.poll(() => settingsReads).toBe(2)
  expect(unsafeRequests).toEqual([])
  expect(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
  ).toEqual({ local: [], session: [] })

  const accessibility = await new AxeBuilder({ page }).analyze()
  expect(accessibility.violations).toEqual([])
})
