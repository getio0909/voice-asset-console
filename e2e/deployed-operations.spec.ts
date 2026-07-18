import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

interface OperationsJobRecord {
  id: string
  kind: string
  state: 'queued' | 'running' | 'retry_wait' | 'succeeded' | 'failed' | 'cancelled'
  [key: string]: unknown
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required for the deployed operations test.`)
  return value
}

function expectExactKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  expect(Object.keys(value).sort()).toEqual(
    expect.arrayContaining(
      Object.keys(value)
        .filter((key) => allowed.includes(key))
        .sort(),
    ),
  )
  expect(Object.keys(value).every((key) => allowed.includes(key))).toBe(true)
}

function requiredJob(items: OperationsJobRecord[]): OperationsJobRecord {
  const item = items[0]
  if (!item) throw new Error('The isolated deployment has no job for the Job Center test.')
  return item
}

async function cleanupSession(page: Page): Promise<void> {
  if (page.isClosed()) return
  const origin = new URL(page.url()).origin
  await page.context().request.delete('/api/v1/auth/session', { headers: { Origin: origin } })
}

test.use({ screenshot: 'off', trace: 'off', video: 'off' })

test.describe('deployed administration read models', () => {
  test.describe.configure({ retries: 0 })

  // eslint-disable-next-line playwright/no-skipped-test -- This check requires the isolated deployment.
  test.skip(
    process.env.VOICEASSET_DEPLOYED_OPERATIONS_E2E !== '1',
    'Set VOICEASSET_DEPLOYED_OPERATIONS_E2E=1 with isolated deployment credentials.',
  )

  test('loads safe Job Center, Audit Log, and System Status data', async ({ page }) => {
    const email = requiredEnvironment('VOICEASSET_LIVE_OWNER_EMAIL')
    const password = requiredEnvironment('VOICEASSET_LIVE_OWNER_PASSWORD')
    const unexpectedWrites: string[] = []

    page.on('request', (request) => {
      const path = new URL(request.url()).pathname
      if (
        request.method() !== 'GET' &&
        path !== '/api/v1/auth/sessions' &&
        path !== '/api/v1/auth/session' &&
        path !== '/api/v1/auth/session/refresh'
      ) {
        unexpectedWrites.push(`${request.method()} ${path}`)
      }
    })

    try {
      await page.goto('/assets')
      await page.getByLabel('Email').fill(email)
      await page.getByLabel('Password').fill(password)
      await page.getByRole('button', { name: 'Sign in securely' }).click()
      await expect(page.getByText(email)).toBeVisible()

      const jobsResponse = await page.context().request.get('/api/v1/admin/jobs?limit=1')
      expect(jobsResponse.status()).toBe(200)
      const jobsPayload = (await jobsResponse.json()) as {
        items: OperationsJobRecord[]
        next_cursor?: string
      }
      const firstJob = requiredJob(jobsPayload.items)
      expectExactKeys(firstJob, [
        'id',
        'asset_id',
        'created_by',
        'kind',
        'state',
        'attempts',
        'max_attempts',
        'available_at',
        'lease_expires_at',
        'last_error_code',
        'result_revision_id',
        'created_at',
        'updated_at',
      ])
      expect(firstJob).not.toHaveProperty('payload')
      expect(firstJob).not.toHaveProperty('idempotency_key')
      expect(firstJob).not.toHaveProperty('lease_owner')

      await page.getByRole('link', { name: 'Job Center' }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'Job Center' })).toBeVisible()
      await page.getByLabel('State').selectOption(firstJob.state)
      await page.getByLabel('Kind').fill(firstJob.kind)
      await page.getByRole('button', { name: 'Apply filters' }).click()
      await expect(page.getByText(firstJob.id, { exact: true })).toBeVisible()
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])

      await page.getByRole('link', { name: 'Audit Log' }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'Audit Log' })).toBeVisible()
      const auditResponse = await page.context().request.get('/api/v1/admin/audit-logs?limit=1')
      expect(auditResponse.status()).toBe(200)
      const auditPayload = (await auditResponse.json()) as {
        items: Array<Record<string, unknown>>
      }
      expect(auditPayload.items.length).toBeGreaterThan(0)
      expectExactKeys(auditPayload.items[0]!, [
        'id',
        'actor_id',
        'actor_email',
        'actor_type',
        'action',
        'target_type',
        'target_id',
        'request_id',
        'metadata',
        'occurred_at',
      ])
      expect(auditPayload.items[0]?.metadata).toEqual(expect.any(Object))
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])

      await page.getByRole('link', { name: 'System Status' }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'System Status' })).toBeVisible()
      const statusResponse = await page.context().request.get('/api/v1/admin/system-status')
      expect(statusResponse.status()).toBe(200)
      const statusPayload = (await statusResponse.json()) as Record<string, unknown>
      expectExactKeys(statusPayload, [
        'generated_at',
        'active_users',
        'assets',
        'storage',
        'transcripts',
        'jobs',
        'providers',
      ])
      await expect(
        page.getByRole('heading', { level: 2, name: 'Assets and transcripts' }),
      ).toBeVisible()
      await expect(
        page.getByRole('heading', { level: 2, name: 'Jobs and providers' }),
      ).toBeVisible()
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
      expect(
        await page.evaluate(() => ({
          local: Object.keys(localStorage),
          session: Object.keys(sessionStorage),
        })),
      ).toEqual({ local: [], session: [] })
      expect(unexpectedWrites).toEqual([])
    } finally {
      await cleanupSession(page)
    }
  })
})
