import { randomUUID } from 'node:crypto'

import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

interface AssetRecord {
  id: string
  collection_id: string | null
  title: string
  language: string
  status: 'draft' | 'uploading' | 'processing' | 'ready' | 'failed' | 'trashed'
  version: number
  created_at: string
}

interface TagRecord {
  id: string
  name: string
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required for the deployed asset test.`)
  return value
}

function requiredAsset(items: AssetRecord[]): AssetRecord {
  const asset = items[0]
  if (!asset) throw new Error('The isolated deployment has no asset for the catalog test.')
  return asset
}

async function restoreMetadata(page: Page, original: AssetRecord | undefined): Promise<void> {
  if (!original) return
  const currentResponse = await page.context().request.get(`/api/v1/assets/${original.id}`)
  if (currentResponse.status() === 404) return
  if (!currentResponse.ok()) {
    throw new Error(`Asset cleanup read failed with status ${currentResponse.status()}.`)
  }
  const current = (await currentResponse.json()) as AssetRecord
  if (
    current.title === original.title &&
    current.language === original.language &&
    current.collection_id === original.collection_id
  ) {
    return
  }

  const response = await page.context().request.put(`/api/v1/assets/${original.id}/metadata`, {
    headers: {
      Origin: new URL(page.url()).origin,
      'If-Match': `"${current.version}"`,
    },
    data: {
      title: original.title,
      language: original.language,
      collection_id: original.collection_id,
    },
  })
  if (!response.ok()) {
    throw new Error(`Asset cleanup update failed with status ${response.status()}.`)
  }
}

async function findTrashedAsset(page: Page, assetId: string): Promise<AssetRecord | undefined> {
  let cursor: string | undefined
  for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
    const parameters = new URLSearchParams({ status: 'trashed', limit: '100' })
    if (cursor) parameters.set('cursor', cursor)
    const response = await page.context().request.get(`/api/v1/assets?${parameters.toString()}`)
    if (!response.ok()) {
      throw new Error(`Asset cleanup trash inventory failed with status ${response.status()}.`)
    }
    const result = (await response.json()) as {
      items: AssetRecord[]
      next_cursor?: string
    }
    const asset = result.items.find((item) => item.id === assetId)
    if (asset) return asset
    if (!result.next_cursor) return undefined
    cursor = result.next_cursor
  }
  throw new Error('Asset cleanup trash inventory exceeded the safe pagination boundary.')
}

async function restoreLifecycle(page: Page, original: AssetRecord | undefined): Promise<void> {
  if (!original) return
  const activeResponse = await page.context().request.get(`/api/v1/assets/${original.id}`)
  if (activeResponse.ok()) return
  if (activeResponse.status() !== 404) {
    throw new Error(`Asset cleanup lifecycle read failed with status ${activeResponse.status()}.`)
  }

  const trashed = await findTrashedAsset(page, original.id)
  if (!trashed) return
  const response = await page.context().request.post(`/api/v1/assets/${original.id}/restore`, {
    headers: {
      Origin: new URL(page.url()).origin,
      'If-Match': `"${trashed.version}"`,
    },
  })
  if (!response.ok()) {
    throw new Error(`Asset cleanup restore failed with status ${response.status()}.`)
  }
}

function utcDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid asset timestamp: ${value}`)
  return date.toISOString().slice(0, 10)
}

function nextUtcDate(value: string): string {
  const date = new Date(`${utcDate(value)}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

async function applyOriginalFilters(
  page: Page,
  original: AssetRecord,
  assignedTags: TagRecord[],
): Promise<void> {
  if (original.collection_id) {
    await page.getByLabel('Filter by collection').selectOption(original.collection_id)
  }
  if (assignedTags[0]) {
    await page.getByLabel('Filter by tag').selectOption(assignedTags[0].id)
  }
  await page.getByLabel('Filter by status').selectOption(original.status)
  await page.getByLabel('Created on or after (UTC)').fill(utcDate(original.created_at))
  await page.getByLabel('Created before (UTC)').fill(nextUtcDate(original.created_at))
}

test.use({ screenshot: 'off', trace: 'off', video: 'off' })

test.describe('deployed asset catalog lifecycle', () => {
  test.describe.configure({ retries: 0 })

  // eslint-disable-next-line playwright/no-skipped-test -- This isolated mutation restores original metadata.
  test.skip(
    process.env.VOICEASSET_DEPLOYED_ASSET_E2E !== '1',
    'Set VOICEASSET_DEPLOYED_ASSET_E2E=1 with isolated deployment credentials.',
  )

  test('filters, edits, bulk trashes, verifies, and restores one real asset', async ({ page }) => {
    const email = requiredEnvironment('VOICEASSET_LIVE_OWNER_EMAIL')
    const password = requiredEnvironment('VOICEASSET_LIVE_OWNER_PASSWORD')
    let original: AssetRecord | undefined

    try {
      await page.goto('/assets')
      await page.getByLabel('Email').fill(email)
      await page.getByLabel('Password').fill(password)
      await page.getByRole('button', { name: 'Sign in securely' }).click()
      await expect(page.getByText(email)).toBeVisible()

      const inventoryResponse = await page.context().request.get('/api/v1/assets?limit=1')
      expect(inventoryResponse.status()).toBe(200)
      const inventory = (await inventoryResponse.json()) as { items: AssetRecord[] }
      original = requiredAsset(inventory.items)

      const assignedTagsResponse = await page
        .context()
        .request.get(`/api/v1/assets/${original.id}/tags?limit=100`)
      expect(assignedTagsResponse.status()).toBe(200)
      const assignedTags = (await assignedTagsResponse.json()) as { items: TagRecord[] }

      await page.getByLabel('Search assets').fill(original.title)
      await applyOriginalFilters(page, original, assignedTags.items)
      await page.getByRole('button', { name: 'Apply filters' }).click()
      const summary = page.locator('.asset-summary').filter({ hasText: original.title }).first()
      await expect(summary).toBeVisible()
      await summary.click()
      await expect(page.getByLabel('Metadata title')).toHaveValue(original.title)
      await expect(page.getByRole('heading', { level: 3, name: 'Processing status' })).toBeVisible()
      await expect(page.getByRole('heading', { level: 3, name: 'Annotations' })).toBeVisible()

      const marker = `catalog-e2e-${randomUUID().slice(0, 8)}`
      const changedTitle = `${original.title.slice(0, 470)} ${marker}`
      const updateResponsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url())
        return (
          response.request().method() === 'PUT' &&
          url.pathname === `/api/v1/assets/${original?.id}/metadata`
        )
      })
      await page.getByLabel('Metadata title').fill(changedTitle)
      await page.getByRole('button', { name: 'Save metadata' }).click()
      const updateResponse = await updateResponsePromise
      expect(updateResponse.status()).toBe(200)
      const updated = (await updateResponse.json()) as AssetRecord
      expect(updated.version).toBe(original.version + 1)
      expect(updated.title).toBe(changedTitle)

      await page.getByLabel('Search assets').fill(marker)
      await page.getByRole('button', { name: 'Apply filters' }).click()
      await expect(page.locator('.asset-summary').filter({ hasText: marker })).toHaveCount(1)

      await page.getByLabel('Metadata title').fill(original.title)
      await page.getByRole('button', { name: 'Save metadata' }).click()
      await expect(page.getByText(`Saved metadata version ${updated.version + 1}.`)).toBeVisible()

      const trashResponsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url())
        return (
          response.request().method() === 'DELETE' &&
          url.pathname === `/api/v1/assets/${original?.id}`
        )
      })
      await page.getByRole('checkbox', { name: `Select ${original.title}` }).check()
      page.once('dialog', (dialog) => dialog.accept())
      await page.getByRole('button', { name: 'Move 1 selected asset to trash' }).click()
      const trashResponse = await trashResponsePromise
      expect(trashResponse.status()).toBe(200)
      const trashed = (await trashResponse.json()) as AssetRecord
      expect(trashed.status).toBe('trashed')
      expect(trashed.version).toBe(updated.version + 2)
      await expect(page.getByText('Moved 1 selected asset to trash.')).toBeVisible()
      await expect(page.locator('.asset-summary').filter({ hasText: original.title })).toHaveCount(
        0,
      )

      await page.getByLabel('Search assets').fill(original.title)
      await page.getByLabel('Filter by status').selectOption('trashed')
      await page.getByRole('button', { name: 'Apply filters' }).click()
      const trashedSummary = page
        .locator('.asset-summary')
        .filter({ hasText: original.title })
        .first()
      await expect(trashedSummary).toBeVisible()
      await page.getByRole('checkbox', { name: `Select ${original.title}` }).check()

      const restoreResponsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url())
        return (
          response.request().method() === 'POST' &&
          url.pathname === `/api/v1/assets/${original?.id}/restore`
        )
      })
      await page.getByRole('button', { name: 'Restore 1 selected asset' }).click()
      const restoreResponse = await restoreResponsePromise
      expect(restoreResponse.status()).toBe(200)
      const restored = (await restoreResponse.json()) as AssetRecord
      expect(restored.status).toBe(original.status)
      expect(restored.version).toBe(trashed.version + 1)
      await expect(page.getByText('Restored 1 selected asset.')).toBeVisible()

      await page.getByRole('button', { name: 'Clear' }).click()
      await page.getByLabel('Search assets').fill(original.title)
      await page.getByRole('button', { name: 'Apply filters' }).click()
      await expect(
        page.locator('.asset-summary').filter({ hasText: original.title }).first(),
      ).toBeVisible()

      expect(
        await page.evaluate(() => ({
          local: Object.keys(localStorage),
          session: Object.keys(sessionStorage),
        })),
      ).toEqual({ local: [], session: [] })
      const accessibility = await new AxeBuilder({ page }).analyze()
      expect(accessibility.violations).toEqual([])
    } finally {
      await restoreLifecycle(page, original)
      await restoreMetadata(page, original)
    }

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Sign in' })).toBeVisible()
  })
})
