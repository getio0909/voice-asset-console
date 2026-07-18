import { randomUUID } from 'node:crypto'

import { expect, test } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'

import { createWav } from './wav'

interface AssetRecord {
  id: string
  status: string
  version: number
}

interface PurgeJob {
  job_id: string
  state: string
}

interface ProcessingStatus {
  active: boolean
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required for the deployed purge test.`)
  return value
}

async function waitForNoActiveJobs(request: APIRequestContext, assetId: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const response = await request.get(`/api/v1/assets/${assetId}/processing-status`)
        if (!response.ok()) return `http-${response.status()}`
        return ((await response.json()) as ProcessingStatus).active
      },
      { timeout: 90_000 },
    )
    .toBe(false)
}

async function cleanupAsset(
  request: APIRequestContext,
  assetId: string | undefined,
  alreadyPurged: boolean,
): Promise<void> {
  if (!assetId || alreadyPurged) return
  let response = await request.get(`/api/v1/assets/${assetId}`)
  if (response.status() === 404) return
  if (!response.ok()) throw new Error(`Cleanup could not read asset ${assetId}.`)

  let asset = (await response.json()) as AssetRecord
  if (asset.status === 'purging') return
  await waitForNoActiveJobs(request, assetId)
  if (asset.status !== 'trashed') {
    response = await request.delete(`/api/v1/assets/${assetId}`, {
      headers: { 'If-Match': `"${asset.version}"` },
    })
    if (response.status() === 404) return
    if (!response.ok()) throw new Error(`Cleanup could not trash asset ${assetId}.`)
    asset = (await response.json()) as AssetRecord
  }

  response = await request.post(`/api/v1/assets/${assetId}/purge`, {
    data: { confirmation: assetId },
    headers: {
      'Idempotency-Key': `deployed-purge-cleanup-${randomUUID()}`,
      'If-Match': `"${asset.version}"`,
    },
  })
  if (response.status() === 404) return
  if (!response.ok()) throw new Error(`Cleanup could not request purge for asset ${assetId}.`)
  const job = (await response.json()) as PurgeJob

  await expect
    .poll(
      async () => {
        const jobResponse = await request.get(`/api/v1/asset-purge-jobs/${job.job_id}`)
        if (!jobResponse.ok()) return `http-${jobResponse.status()}`
        return ((await jobResponse.json()) as PurgeJob).state
      },
      { timeout: 90_000 },
    )
    .toBe('succeeded')
}

test.use({ screenshot: 'off', trace: 'off', video: 'off' })

test.describe('deployed permanent-purge lifecycle', () => {
  test.describe.configure({ retries: 0 })

  // eslint-disable-next-line playwright/no-skipped-test -- This destructive test creates and purges only its own asset.
  test.skip(
    process.env.VOICEASSET_DEPLOYED_PURGE_E2E !== '1',
    'Set VOICEASSET_DEPLOYED_PURGE_E2E=1 with isolated deployment credentials.',
  )

  test('removes the purged asset from both Server storage and Console memory', async ({ page }) => {
    test.setTimeout(120_000)
    const email = requiredEnvironment('VOICEASSET_LIVE_OWNER_EMAIL')
    const password = requiredEnvironment('VOICEASSET_LIVE_OWNER_PASSWORD')
    const title = `Deployed purge proof ${Date.now()}`
    let assetId: string | undefined
    let assetPurged = false

    try {
      await page.goto('/assets')
      await page.getByLabel('Email').fill(email)
      await page.getByLabel('Password').fill(password)
      await page.getByRole('button', { name: 'Sign in securely' }).click()
      await expect(page.getByText(email)).toBeVisible()

      await page.getByLabel('WAV file').setInputFiles({
        name: 'deployed-purge-proof.wav',
        mimeType: 'audio/wav',
        buffer: createWav(8_000),
      })
      await page.getByLabel('Asset title').fill(title)
      await page.getByLabel('Language').fill('en-US')
      const audioResponsePromise = page.waitForResponse(
        (response) => response.url().endsWith('/audio') && response.status() < 400,
        { timeout: 90_000 },
      )
      await page.getByRole('button', { name: 'Upload and transcribe' }).click()
      await expect(page.getByText('Immutable result', { exact: true })).toBeVisible({
        timeout: 90_000,
      })
      const audioResponse = await audioResponsePromise
      assetId = new URL(audioResponse.url()).pathname.match(
        /^\/api\/v1\/assets\/([^/]+)\/audio$/,
      )?.[1]
      expect(assetId).toMatch(/^[0-9a-f-]{36}$/)
      await waitForNoActiveJobs(page.context().request, assetId!)

      page.once('dialog', async (dialog) => dialog.accept())
      await page.getByRole('button', { name: 'Move to trash', exact: true }).click()
      await page.getByLabel('Type the asset ID to confirm permanent deletion').fill(assetId!)
      await page.getByRole('button', { name: 'Permanently delete asset' }).click()
      await expect(page.getByRole('heading', { name: 'Last purge request' })).toBeVisible()
      await expect(page.getByText('Immutable result', { exact: true })).toBeVisible()

      await expect(async () => {
        await page.getByRole('button', { name: 'Check purge status' }).click()
        await expect(page.getByText('succeeded', { exact: true })).toBeVisible()
      }).toPass({ intervals: [250, 500, 1_000], timeout: 90_000 })

      await expect(page.getByText(`Asset ${assetId} was permanently deleted.`)).toBeVisible()
      await expect(page.getByText('Immutable result', { exact: true })).toHaveCount(0)
      await expect(
        page.getByRole('heading', { level: 2, name: 'Upload a WAV recording' }),
      ).toBeVisible()
      expect(
        await page.evaluate(async (id) => {
          const response = await fetch(`/api/v1/assets/${id}`, { credentials: 'same-origin' })
          return response.status
        }, assetId),
      ).toBe(404)
      assetPurged = true
      expect(
        await page.evaluate(() => ({
          local: Object.keys(localStorage),
          session: Object.keys(sessionStorage),
        })),
      ).toEqual({ local: [], session: [] })

      await page.getByRole('button', { name: 'Sign out' }).click()
      await expect(page.getByRole('heading', { level: 2, name: 'Sign in' })).toBeVisible()
      const cookieNames = (await page.context().cookies()).map((cookie) => cookie.name)
      expect(cookieNames).not.toContain('voiceasset_session')
      expect(cookieNames).not.toContain('voiceasset_refresh')
    } finally {
      await cleanupAsset(page.context().request, assetId, assetPurged)
    }
  })
})
