import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { CONTRACT_VERSION, REQUIRED_SERVER_FEATURES } from '../src/config/contract'

const workspaceId = '10000000-0000-4000-8000-000000000001'
const ownerId = '20000000-0000-4000-8000-000000000002'
const now = '2026-07-17T12:00:00Z'

test('renames the authenticated workspace with its exact version and no bearer token', async ({
  page,
}) => {
  const principal = {
    id: ownerId,
    workspace_id: workspaceId,
    role: 'owner',
    email: 'owner@example.com',
    scopes: ['admin:read', 'admin:write'],
  }
  let workspace = {
    id: workspaceId,
    name: 'Primary',
    version: 3,
    created_at: now,
    updated_at: now,
  }
  let updatePayload: unknown
  let updateIfMatch: string | null = null
  let updateAuthorization: string | null = null

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()

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
      await route.fulfill({ json: { user: principal } })
      return
    }
    if (method === 'GET' && path === '/api/v1/admin/workspace') {
      await route.fulfill({ json: workspace })
      return
    }
    if (method === 'PATCH' && path === '/api/v1/admin/workspace') {
      updatePayload = request.postDataJSON()
      updateIfMatch = await request.headerValue('if-match')
      updateAuthorization = await request.headerValue('authorization')
      workspace = {
        ...workspace,
        name: 'Renamed',
        version: 4,
        updated_at: '2026-07-17T13:00:00Z',
      }
      await route.fulfill({ json: workspace })
      return
    }
    await route.fulfill({ status: 404, json: { error: { code: 'not_found' } } })
  })

  await page.goto('/workspace')
  await expect(page.getByRole('heading', { level: 1, name: 'Workspace' })).toBeVisible()
  await expect(page.getByLabel('Workspace name')).toHaveValue('Primary')

  await page.getByLabel('Workspace name').fill('Renamed')
  await page.getByRole('button', { name: 'Save workspace' }).click()

  await expect(page.getByText('Workspace version is now 4.')).toBeVisible()
  await expect(page.getByText('Version 4', { exact: true })).toBeVisible()
  expect(updatePayload).toEqual({ name: 'Renamed' })
  expect(updateIfMatch).toBe('"3"')
  expect(updateAuthorization).toBeNull()
  expect(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
  ).toEqual({ local: [], session: [] })

  const accessibility = await new AxeBuilder({ page }).analyze()
  expect(accessibility.violations).toEqual([])
})
