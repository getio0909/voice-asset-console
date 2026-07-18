import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { createWav } from './wav'

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required for the live E2E.`)
  }
  return value
}

async function prepareManualMockProfile(page: Page): Promise<void> {
  const correctionProfile = page.getByRole('listitem').filter({ hasText: 'Mock correction' })
  if ((await correctionProfile.count()) === 0) {
    await page.getByRole('button', { name: 'Create enabled Mock profile' }).click()
  }
  await expect(correctionProfile).toContainText('mock_llm · enabled')

  await page.getByRole('link', { name: 'LLM providers' }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'LLM providers & glossaries' }),
  ).toBeVisible()
  const manualProfile = page.getByRole('listitem').filter({ hasText: 'Mock correction' })
  await expect(manualProfile).toBeVisible()
  const requireManualReview = page.getByRole('button', {
    name: 'Require manual review for Mock correction',
  })
  if ((await requireManualReview.count()) > 0) {
    await requireManualReview.click()
  }
  await expect(manualProfile).toContainText('policy: never')
  await page.getByRole('link', { name: 'Corrections' }).click()
}

test.describe('live Server Phase 3 workflow', () => {
  // eslint-disable-next-line playwright/no-skipped-test -- This destructive integration is explicit and ephemeral.
  test.skip(
    process.env.VOICEASSET_LIVE_E2E !== '1',
    'Set VOICEASSET_LIVE_E2E=1 with ephemeral owner credentials and a running Server.',
  )

  test('uses real upload, ASR, correction, review, and approval services', async ({ page }) => {
    test.setTimeout(120_000)
    const email = requiredEnvironment('VOICEASSET_LIVE_OWNER_EMAIL')
    const password = requiredEnvironment('VOICEASSET_LIVE_OWNER_PASSWORD')

    await page.goto('/')
    await expect(
      page.getByText('API connection').locator('..').getByText('available'),
    ).toBeVisible()
    await page.getByRole('link', { name: 'Assets' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Sign in' })).toBeVisible()
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(password)
    await expect(page.getByRole('button', { name: 'Sign in securely' })).toBeEnabled()
    await page.getByRole('button', { name: 'Sign in securely' }).click()
    await expect(page.getByText(email)).toBeVisible()

    const wav = createWav(8_000)
    await page.getByLabel('WAV file').setInputFiles({
      name: 'live-phase1.wav',
      mimeType: 'audio/wav',
      buffer: wav,
    })
    await page.getByLabel('Asset title').fill('Live Phase 1 browser proof')
    await page.getByLabel('Language').fill('en-US')
    const audioResponse = page.waitForResponse(
      (response) => response.url().includes('/api/v1/assets/') && response.url().endsWith('/audio'),
      { timeout: 90_000 },
    )
    await page.getByRole('button', { name: 'Upload and transcribe' }).click()

    await expect(
      page.getByRole('heading', { level: 2, name: 'Live Phase 1 browser proof' }),
    ).toBeVisible({ timeout: 90_000 })
    await expect(page.getByText('normalized', { exact: true })).toBeVisible()
    await expect(page.locator('.transcript-segment p').first()).toHaveText(/\S+/)
    const playback = await audioResponse
    expect([200, 206]).toContain(playback.status())
    expect(playback.headers()['content-type']).toContain('audio/wav')
    const assetId = new URL(playback.url()).pathname.match(
      /^\/api\/v1\/assets\/([^/]+)\/audio$/,
    )?.[1]
    expect(assetId).toBeTruthy()
    await expect
      .poll(
        () =>
          page.evaluate(
            async (path) =>
              (await fetch(path, { method: 'HEAD', credentials: 'same-origin' })).status,
            `/api/v1/assets/${assetId}/waveform`,
          ),
        { timeout: 90_000 },
      )
      .toBe(200)
    const waveformProbe = await page.evaluate(async (path) => {
      const response = await fetch(path, { credentials: 'same-origin' })
      const bytes = new Uint8Array(await response.arrayBuffer())
      return {
        contentType: response.headers.get('content-type'),
        signature: Array.from(bytes.slice(0, 8)),
        status: response.status,
      }
    }, `/api/v1/assets/${assetId}/waveform`)
    expect(waveformProbe).toEqual({
      contentType: 'image/png',
      signature: [137, 80, 78, 71, 13, 10, 26, 10],
      status: 200,
    })

    await page.getByRole('link', { name: 'Assets' }).click()
    await page.getByLabel('Search assets').fill('VoiceAsset')
    await page.getByLabel('Filter by ASR provider').selectOption('mock_asr')
    await page.getByLabel('Filter by speaker').fill('speaker-1')
    await page.getByRole('button', { name: 'Apply filters' }).click()
    const searchResult = page
      .locator('.asset-summary')
      .filter({ hasText: 'Live Phase 1 browser proof' })
      .first()
    await expect(searchResult).toBeVisible()
    await expect(searchResult.getByText('ASR: mock_asr')).toBeVisible()
    await expect(searchResult.locator('.asset-search-hit').first()).toContainText(
      '00:00.500–00:01.000',
    )
    await expect(searchResult.locator('.asset-search-hit').first()).toContainText('speaker-1')
    await expect(searchResult.locator('.asset-search-hit').first()).toContainText('VoiceAsset.')
    await searchResult.click()
    const waveform = page.getByRole('button', {
      name: 'Seek Live Phase 1 browser proof by waveform',
    })
    await expect(waveform).toBeVisible()
    await expect
      .poll(() =>
        waveform.locator('img').evaluate((image) => Number(Reflect.get(image, 'naturalWidth'))),
      )
      .toBeGreaterThan(0)
    await page.getByLabel('Playback speed').selectOption('1.5')
    await expect
      .poll(() =>
        page.locator('.asset-detail-grid audio').evaluate((player) => player.playbackRate),
      )
      .toBe(1.5)

    await page.getByRole('link', { name: 'Correct and review this revision' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Correction review' })).toBeVisible()
    await page.getByLabel('Set name').fill('Live Phase 3 corrections')
    await page.getByLabel('Canonical form').fill('VoiceAssets')
    await page.getByLabel('Aliases').fill('VoiceAsset')
    await page.getByLabel('Language').fill('en-US')
    await page.getByRole('button', { name: 'Create version 1' }).click()
    await expect(page.getByText('v1 · 1 entries')).toBeVisible()
    const sourceRevisionId = await page.getByLabel('Source revision ID').inputValue()
    await prepareManualMockProfile(page)
    await page.getByLabel('Source revision ID').fill(sourceRevisionId)

    await page.getByRole('button', { name: 'Queue Mock LLM correction' }).click()
    await expect(page.getByRole('heading', { name: 'Review 1 changes' })).toBeVisible({
      timeout: 90_000,
    })
    await expect(page.getByText('VoiceAssets.', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Accept', exact: true }).click()
    await expect(page.getByText('accepted', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Create approved revision' }).click()
    await expect(page.locator('.approval-result h2')).toHaveText('approved')

    await page.getByRole('link', { name: 'LLM providers' }).click()
    await expect(
      page.getByRole('heading', { level: 1, name: 'LLM providers & glossaries' }),
    ).toBeVisible()
    const mockProfile = page.getByRole('listitem').filter({ hasText: 'Mock correction' })
    await page
      .getByRole('button', { name: 'Enable glossary-only auto-approval for Mock correction' })
      .click()
    await expect(mockProfile).toContainText('policy: validated_glossary_only')

    await page.getByRole('link', { name: 'Corrections' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Correction review' })).toBeVisible()
    await page.getByRole('button', { name: 'Queue Mock LLM correction' }).click()
    await expect(page.getByText('Glossary-only auto-approval complete')).toBeVisible({
      timeout: 90_000,
    })
    await expect(page.locator('.approval-result h2')).toHaveText('approved')
    await expect(page.getByRole('heading', { name: 'Review 1 changes' })).toHaveCount(0)
    expect(
      await page.evaluate(() => ({
        local: Object.keys(localStorage),
        session: Object.keys(sessionStorage),
      })),
    ).toEqual({ local: [], session: [] })

    const accessibility = await new AxeBuilder({ page }).analyze()
    expect(accessibility.violations).toEqual([])

    await page.getByRole('link', { name: 'Assets' }).click()
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Sign in' })).toBeVisible()
  })
})
