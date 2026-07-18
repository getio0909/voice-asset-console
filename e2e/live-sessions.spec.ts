import { randomUUID } from 'node:crypto'

import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'

interface DeviceSession {
  id: string
  device_name: string
  current: boolean
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required for the live session E2E.`)
  return value
}

async function sessionCookies(context: BrowserContext) {
  const cookies = await context.cookies()
  const access = cookies.find((cookie) => cookie.name === 'voiceasset_session')
  const refresh = cookies.find((cookie) => cookie.name === 'voiceasset_refresh')
  if (!access || !refresh) throw new Error('The browser did not receive both session cookies.')
  if (
    !access.httpOnly ||
    !access.secure ||
    access.sameSite !== 'Strict' ||
    access.path !== '/api/v1'
  ) {
    throw new Error('The access cookie attributes do not match the contract.')
  }
  if (
    !refresh.httpOnly ||
    !refresh.secure ||
    refresh.sameSite !== 'Strict' ||
    refresh.path !== '/api/v1/auth'
  ) {
    throw new Error('The refresh cookie attributes do not match the contract.')
  }
  return { access, refresh }
}

function assertRotated(
  original: Awaited<ReturnType<typeof sessionCookies>>,
  rotated: Awaited<ReturnType<typeof sessionCookies>>,
): void {
  if (rotated.access.value === original.access.value) {
    throw new Error('Refresh did not rotate the access cookie.')
  }
  if (rotated.refresh.value === original.refresh.value) {
    throw new Error('Refresh did not rotate the refresh cookie.')
  }
}

async function cleanupSession(page: Page, sessionId: string | undefined): Promise<void> {
  if (!sessionId) return
  const origin = new URL(page.url()).origin
  let response = await page.context().request.delete(`/api/v1/auth/device-sessions/${sessionId}`, {
    headers: { Origin: origin },
  })
  if (response.status() === 401) {
    const refreshed = await page.context().request.post('/api/v1/auth/session/refresh', {
      headers: { Origin: origin },
    })
    if (refreshed.ok()) {
      response = await page.context().request.delete(`/api/v1/auth/device-sessions/${sessionId}`, {
        headers: { Origin: origin },
      })
    }
  }
  if (![204, 401, 404].includes(response.status())) {
    throw new Error(`Device-session cleanup failed with status ${response.status()}.`)
  }
}

test.use({ screenshot: 'off', trace: 'off', video: 'off' })

test.describe('live deployed refresh and device-session lifecycle', () => {
  test.describe.configure({ retries: 0 })

  // eslint-disable-next-line playwright/no-skipped-test -- This live mutation is explicit and self-cleaning.
  test.skip(
    process.env.VOICEASSET_LIVE_SESSION_E2E !== '1',
    'Set VOICEASSET_LIVE_SESSION_E2E=1 with the isolated deployment credentials.',
  )

  test('rotates HttpOnly cookies and revokes the current device family', async ({ page }) => {
    const email = requiredEnvironment('VOICEASSET_LIVE_OWNER_EMAIL')
    const password = requiredEnvironment('VOICEASSET_LIVE_OWNER_PASSWORD')
    const deviceName = `console-e2e-${randomUUID().slice(0, 12)}`
    let cleanupSessionId: string | undefined

    try {
      await page.goto('/assets')
      await page.getByLabel('Email').fill(email)
      await page.getByLabel('Password').fill(password)
      await page.getByLabel('Device name').fill(deviceName)
      await page.getByRole('button', { name: 'Sign in securely' }).click()
      await expect(page.getByText(email)).toBeVisible()

      const original = await sessionCookies(page.context())
      await page.getByRole('link', { name: 'Sessions' }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'Device sessions' })).toBeVisible()

      const inventoryResponse = await page.context().request.get('/api/v1/auth/device-sessions')
      expect(inventoryResponse.status()).toBe(200)
      const inventory = (await inventoryResponse.json()) as { items: DeviceSession[] }
      const matches = inventory.items.filter(
        (session) => session.current && session.device_name === deviceName,
      )
      expect(matches).toHaveLength(1)
      cleanupSessionId = matches[0]?.id

      await page.context().clearCookies({ name: 'voiceasset_session' })
      await page.reload()
      await expect(page.getByText(deviceName)).toBeVisible()
      const rotated = await sessionCookies(page.context())
      assertRotated(original, rotated)

      const accessibility = await new AxeBuilder({ page }).analyze()
      expect(accessibility.violations).toEqual([])

      await page.getByRole('button', { name: `Revoke ${deviceName}` }).click()
      cleanupSessionId = undefined
      await expect(page.getByRole('heading', { level: 2, name: 'Sign in' })).toBeVisible()
      const remainingCookieNames = (await page.context().cookies()).map((cookie) => cookie.name)
      expect(remainingCookieNames).not.toContain('voiceasset_session')
      expect(remainingCookieNames).not.toContain('voiceasset_refresh')
    } finally {
      await cleanupSession(page, cleanupSessionId)
    }
  })
})
