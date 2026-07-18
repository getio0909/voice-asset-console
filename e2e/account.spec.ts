import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { CONTRACT_VERSION, REQUIRED_SERVER_FEATURES } from '../src/config/contract'

const workspaceId = '10000000-0000-4000-8000-000000000001'
const ownerId = '20000000-0000-4000-8000-000000000002'

test('clears credentials on every attempt and forgets the locally revoked session', async ({
  page,
}) => {
  const principal = {
    id: ownerId,
    workspace_id: workspaceId,
    role: 'owner',
    email: 'owner@example.com',
    scopes: ['admin:read', 'admin:write'],
  }
  const payloads: unknown[] = []
  const authorizationHeaders: Array<string | null> = []
  const mutationPaths: string[] = []

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
    if (method === 'PATCH' && path === '/api/v1/auth/password') {
      mutationPaths.push(path)
      payloads.push(request.postDataJSON())
      authorizationHeaders.push(await request.headerValue('authorization'))
      if (payloads.length === 1) {
        await route.fulfill({
          status: 401,
          json: {
            error: {
              code: 'invalid_credentials',
              message: 'Current password is incorrect.',
              request_id: 'request-password',
            },
          },
        })
      } else {
        await route.fulfill({ status: 204, body: '' })
      }
      return
    }
    await route.fulfill({ status: 404, json: { error: { code: 'not_found' } } })
  })

  await page.goto('/account')
  await expect(page.getByRole('heading', { level: 1, name: 'Account' })).toBeVisible()

  const current = page.getByLabel('Current password')
  const next = page.getByLabel('New password', { exact: true })
  const confirmation = page.getByLabel('Confirm new password')
  await current.fill('wrong-password')
  await next.fill('new-password-456')
  await confirmation.fill('new-password-456')
  await page.getByRole('button', { name: 'Change password' }).click()

  await expect(page.getByRole('alert')).toContainText('Current password is incorrect.')
  await expect(current).toHaveValue('')
  await expect(next).toHaveValue('')
  await expect(confirmation).toHaveValue('')

  await current.fill('current-password')
  await next.fill('new-password-456')
  await confirmation.fill('new-password-456')
  await page.getByRole('button', { name: 'Change password' }).click()

  await expect(page.getByText('Every existing session was revoked')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sign in to manage your account' })).toBeVisible()
  expect(payloads).toEqual([
    { current_password: 'wrong-password', new_password: 'new-password-456' },
    { current_password: 'current-password', new_password: 'new-password-456' },
  ])
  expect(mutationPaths).toEqual(['/api/v1/auth/password', '/api/v1/auth/password'])
  expect(authorizationHeaders).toEqual([null, null])
  expect(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
  ).toEqual({ local: [], session: [] })

  const accessibility = await new AxeBuilder({ page }).analyze()
  expect(accessibility.violations).toEqual([])
})
