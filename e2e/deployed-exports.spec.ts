import { createHash } from 'node:crypto'

import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'

interface AssetPage {
  items: Array<{ id: string }>
  next_cursor?: string
}

interface TranscriptSummary {
  latest_revision_id: string
  latest_kind: string
}

interface RevisionCandidate {
  id: string
  kind: string
}

interface TranscriptExport {
  id: string
  revision_id: string
  format: 'markdown'
  mime_type: string
  file_size: number
  sha256: string
  download_url: string
  created_at: string
  expires_at: string
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required for the deployed export test.`)
  return value
}

async function findExportableRevision(request: APIRequestContext): Promise<RevisionCandidate> {
  let cursor: string | undefined
  let fallback: RevisionCandidate | undefined
  const seenCursors = new Set<string>()
  for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
    const parameters = new URLSearchParams({ limit: '100' })
    if (cursor) parameters.set('cursor', cursor)
    const response = await request.get(`/api/v1/assets?${parameters}`)
    if (!response.ok()) {
      throw new Error(`Asset inventory read failed with status ${response.status()}.`)
    }
    const page = (await response.json()) as AssetPage
    for (const asset of page.items) {
      const transcriptResponse = await request.get(`/api/v1/assets/${asset.id}/transcripts`)
      if (!transcriptResponse.ok()) {
        throw new Error(
          `Transcript inventory read failed with status ${transcriptResponse.status()}.`,
        )
      }
      const transcripts = (await transcriptResponse.json()) as { items: TranscriptSummary[] }
      const approved = transcripts.items.find((item) => item.latest_kind === 'approved')
      if (approved) return { id: approved.latest_revision_id, kind: approved.latest_kind }
      const latest = transcripts.items[0]
      if (!fallback && latest) {
        fallback = { id: latest.latest_revision_id, kind: latest.latest_kind }
      }
    }
    if (!page.next_cursor) break
    if (seenCursors.has(page.next_cursor)) {
      throw new Error('Asset inventory repeated a cursor during export discovery.')
    }
    seenCursors.add(page.next_cursor)
    cursor = page.next_cursor
  }
  if (fallback) return fallback
  throw new Error('The isolated deployment has no immutable Revision for the export test.')
}

test.use({ screenshot: 'off', trace: 'off', video: 'off' })

test.describe('deployed transcript export lifecycle', () => {
  test.describe.configure({ retries: 0 })

  // eslint-disable-next-line playwright/no-skipped-test -- The artifact is bounded and expires automatically after one hour.
  test.skip(
    process.env.VOICEASSET_DEPLOYED_EXPORT_E2E !== '1',
    'Set VOICEASSET_DEPLOYED_EXPORT_E2E=1 with isolated deployment credentials.',
  )

  test('exports and verifies one existing immutable revision', async ({ page }) => {
    const email = requiredEnvironment('VOICEASSET_LIVE_OWNER_EMAIL')
    const password = requiredEnvironment('VOICEASSET_LIVE_OWNER_PASSWORD')

    await page.goto('/assets')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in securely' }).click()
    await expect(page.getByText(email)).toBeVisible()

    const candidate = await findExportableRevision(page.context().request)
    const revisionId = candidate.id
    await page.goto(`/corrections?revision=${revisionId}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Correction review' })).toBeVisible()
    await expect(page.getByLabel('Export revision ID')).toHaveValue(revisionId)

    const responsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return (
        response.request().method() === 'POST' &&
        url.pathname === `/api/v1/transcript-revisions/${revisionId}/exports`
      )
    })
    await page.getByRole('button', { name: 'Prepare download' }).click()
    const response = await responsePromise
    expect(response.status()).toBe(201)
    const artifact = (await response.json()) as TranscriptExport
    expect(artifact.revision_id).toBe(revisionId)
    expect(artifact.format).toBe('markdown')
    expect(artifact.download_url).toBe(`/api/v1/transcript-exports/${artifact.id}`)

    const link = page.getByRole('link', { name: 'Download Markdown' })
    await expect(link).toHaveAttribute('href', artifact.download_url)
    const downloadResponse = await page.context().request.get(artifact.download_url)
    expect(downloadResponse.status()).toBe(200)
    expect(downloadResponse.headers()['content-type']).toContain('text/markdown')
    const body = await downloadResponse.body()
    expect(body.byteLength).toBe(artifact.file_size)
    expect(createHash('sha256').update(body).digest('hex')).toBe(artifact.sha256)
    expect(body.toString('utf8')).toContain(`# Transcript ${revisionId}`)
    expect(['raw_asr', 'normalized', 'llm_corrected', 'human_edited', 'approved']).toContain(
      candidate.kind,
    )
    const lifetime = Date.parse(artifact.expires_at) - Date.parse(artifact.created_at)
    expect(lifetime).toBeGreaterThanOrEqual(60 * 60 * 1_000 - 1_000)
    expect(lifetime).toBeLessThanOrEqual(60 * 60 * 1_000)

    expect(
      await page.evaluate(() => ({
        local: Object.keys(localStorage),
        session: Object.keys(sessionStorage),
      })),
    ).toEqual({ local: [], session: [] })
    const accessibility = await new AxeBuilder({ page }).analyze()
    expect(accessibility.violations).toEqual([])
  })
})
