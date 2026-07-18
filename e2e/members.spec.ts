import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { CONTRACT_VERSION, REQUIRED_SERVER_FEATURES } from '../src/config/contract'

const workspaceId = '10000000-0000-4000-8000-000000000001'
const ownerId = '20000000-0000-4000-8000-000000000002'
const memberId = '30000000-0000-4000-8000-000000000003'
const now = '2026-07-17T12:00:00Z'

test('creates and conditionally updates a workspace member without retaining its password', async ({
  page,
}) => {
  const principal = {
    id: ownerId,
    workspace_id: workspaceId,
    role: 'owner',
    email: 'owner@example.com',
    scopes: ['admin:read', 'admin:write'],
  }
  let members = [
    {
      id: ownerId,
      workspace_id: workspaceId,
      email: principal.email,
      role: 'owner',
      status: 'active',
      version: 1,
      created_at: now,
      updated_at: now,
    },
  ]
  let createPayload: unknown
  let updatePayload: unknown
  let updateIfMatch: string | null = null
  const mutationAuthorizationHeaders: Array<string | null> = []

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()
    if (!['GET', 'HEAD'].includes(method)) {
      mutationAuthorizationHeaders.push(await request.headerValue('authorization'))
    }

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
    if (method === 'GET' && path === '/api/v1/admin/members') {
      await route.fulfill({ json: { items: members } })
      return
    }
    if (method === 'POST' && path === '/api/v1/admin/members') {
      createPayload = request.postDataJSON()
      const created = {
        id: memberId,
        workspace_id: workspaceId,
        email: 'new@example.com',
        role: 'viewer',
        status: 'active',
        version: 1,
        created_at: now,
        updated_at: '2026-07-17T13:00:00Z',
      }
      members = [created, ...members]
      await route.fulfill({ status: 201, json: created })
      return
    }
    if (method === 'PATCH' && path === `/api/v1/admin/members/${memberId}`) {
      updatePayload = request.postDataJSON()
      updateIfMatch = await request.headerValue('if-match')
      members = members.map((member) =>
        member.id === memberId
          ? {
              ...member,
              role: 'editor',
              status: 'disabled',
              version: 2,
              updated_at: '2026-07-17T14:00:00Z',
            }
          : member,
      )
      await route.fulfill({ json: members.find((member) => member.id === memberId) })
      return
    }
    await route.fulfill({ status: 404, json: { error: { code: 'not_found' } } })
  })

  await page.goto('/members')
  await expect(page.getByRole('heading', { level: 1, name: 'Members' })).toBeVisible()
  const inventory = page.getByRole('region', { name: 'Workspace members' })
  await expect(inventory.getByText('owner@example.com', { exact: true })).toBeVisible()

  await page.getByLabel('Email', { exact: true }).fill('new@example.com')
  const password = page.getByLabel('Initial password')
  await password.fill('long-test-password')
  await page.getByRole('button', { name: 'Create member' }).click()
  await expect(password).toHaveValue('')
  await expect(inventory.getByText('new@example.com', { exact: true })).toBeVisible()
  expect(createPayload).toEqual({
    email: 'new@example.com',
    password: 'long-test-password',
    role: 'viewer',
  })

  await page.getByLabel('Role for new@example.com').selectOption('editor')
  await page.getByLabel('Status for new@example.com').selectOption('disabled')
  await page.getByRole('button', { name: 'Save changes for new@example.com' }).click()
  await expect(page.getByText('Updated new@example.com.')).toBeVisible()
  expect(updatePayload).toEqual({ role: 'editor', status: 'disabled' })
  expect(updateIfMatch).toBe('"1"')
  expect(mutationAuthorizationHeaders).toEqual([null, null])
  expect(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
  ).toEqual({ local: [], session: [] })

  const accessibility = await new AxeBuilder({ page }).analyze()
  expect(accessibility.violations).toEqual([])
})
