import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/client'
import type { Annotation, Asset, Collection, ProcessingStatus, Tag } from '@/api/client'

import { useAssetCatalogStore } from '../assetCatalog'
import type { AssetCatalogClient } from '../assetCatalog'

const workspaceId = '10000000-0000-4000-8000-000000000001'
const assetId = '20000000-0000-4000-8000-000000000002'
const secondAssetId = '30000000-0000-4000-8000-000000000003'
const collectionId = '40000000-0000-4000-8000-000000000004'
const secondCollectionId = '50000000-0000-4000-8000-000000000005'
const annotationId = '60000000-0000-4000-8000-000000000006'
const secondAnnotationId = '70000000-0000-4000-8000-000000000007'
const jobId = '80000000-0000-4000-8000-000000000008'
const tagId = '90000000-0000-4000-8000-000000000009'
const purgeJobId = 'a0000000-0000-4000-8000-00000000000a'
const now = '2026-07-16T08:00:00Z'

function asset(id = assetId, overrides: Partial<Asset> = {}): Asset {
  return {
    id,
    workspace_id: workspaceId,
    collection_id: null,
    title: id === assetId ? 'Field note' : 'Planning call',
    language: 'en-US',
    status: 'ready',
    duration_ms: 1_000,
    version: 3,
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

function collection(id: string, name: string): Collection {
  return {
    id,
    workspace_id: workspaceId,
    name,
    description: '',
    version: 1,
    asset_count: 0,
    created_at: now,
    updated_at: now,
  }
}

function annotation(id = annotationId, overrides: Partial<Annotation> = {}): Annotation {
  return {
    id,
    workspace_id: workspaceId,
    asset_id: assetId,
    kind: 'note',
    start_ms: 250,
    end_ms: 750,
    body: 'Decision',
    version: 1,
    created_by: workspaceId,
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

function tag(): Tag {
  return {
    id: tagId,
    workspace_id: workspaceId,
    name: 'Important',
    color: '#ff8800',
    asset_count: 1,
    created_at: now,
  }
}

function processingStatus(): ProcessingStatus {
  return {
    asset_id: assetId,
    asset_status: 'ready',
    active: false,
    jobs: [
      {
        id: jobId,
        kind: 'mock_transcribe',
        state: 'succeeded',
        attempts: 1,
        max_attempts: 3,
        last_error_code: null,
        result_revision_id: secondAnnotationId,
        created_at: now,
        updated_at: now,
      },
    ],
    updated_at: now,
  }
}

function createClient(): AssetCatalogClient {
  return {
    listAssets: vi.fn(async () => ({ items: [] })),
    getAsset: vi.fn(async () => asset()),
    updateAssetMetadata: vi.fn(async (_assetId, version, input) =>
      asset(assetId, {
        ...input,
        version: version + 1,
      }),
    ),
    trashAsset: vi.fn(async (_assetId, version) =>
      asset(assetId, { status: 'trashed', version: version + 1 }),
    ),
    restoreAsset: vi.fn(async (_assetId, version) =>
      asset(assetId, { status: 'ready', version: version + 1 }),
    ),
    requestAssetPurge: vi.fn(async (_assetId, version) => ({
      job_id: purgeJobId,
      asset_id: assetId,
      asset_version: version,
      state: 'queued' as const,
      requested_at: now,
    })),
    getAssetPurgeJob: vi.fn(async () => ({
      job_id: purgeJobId,
      asset_id: assetId,
      asset_version: 4,
      state: 'succeeded' as const,
      requested_at: now,
    })),
    listCollections: vi.fn(async () => ({ items: [] })),
    listTags: vi.fn(async () => ({ items: [] })),
    listAssetTags: vi.fn(async () => ({ items: [] })),
    addAssetTags: vi.fn(async () => ({ asset_id: assetId, tag_ids: [tagId], changed_count: 1 })),
    removeAssetTags: vi.fn(async () => ({ asset_id: assetId, tag_ids: [tagId], changed_count: 1 })),
    listAssetAnnotations: vi.fn(async () => ({ items: [] })),
    createAssetAnnotation: vi.fn(async (_assetId, input) => annotation(annotationId, input)),
    getAssetProcessingStatus: vi.fn(async () => processingStatus()),
    audioUrl: vi.fn((selectedAssetId) => `/api/v1/assets/${selectedAssetId}/audio`),
    waveformUrl: vi.fn((selectedAssetId) => `/api/v1/assets/${selectedAssetId}/waveform`),
  }
}

describe('asset catalog store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('loads a searched asset page, all collection pages, and the next asset page', async () => {
    const store = useAssetCatalogStore()
    const client = createClient()
    vi.mocked(client.listAssets)
      .mockResolvedValueOnce({ items: [asset()], next_cursor: 'asset-page-2' })
      .mockResolvedValueOnce({ items: [asset(secondAssetId)] })
    vi.mocked(client.listCollections)
      .mockResolvedValueOnce({
        items: [collection(secondCollectionId, 'Zulu')],
        next_cursor: 'collection-page-2',
      })
      .mockResolvedValueOnce({ items: [collection(collectionId, 'Alpha')] })

    await expect(store.load('  Field  ', client)).resolves.toBe(true)

    expect(client.listAssets).toHaveBeenNthCalledWith(1, { query: 'Field', limit: 20 })
    expect(client.listCollections).toHaveBeenNthCalledWith(1, {
      limit: 100,
      cursor: undefined,
    })
    expect(client.listCollections).toHaveBeenNthCalledWith(2, {
      limit: 100,
      cursor: 'collection-page-2',
    })
    expect(store.items.map((item) => item.id)).toEqual([assetId])
    expect(store.collections.map((item) => item.name)).toEqual(['Alpha', 'Zulu'])
    expect(store.query).toBe('Field')
    expect(store.nextCursor).toBe('asset-page-2')

    await expect(store.loadMore(client)).resolves.toBe(true)

    expect(client.listAssets).toHaveBeenNthCalledWith(2, {
      query: 'Field',
      limit: 20,
      cursor: 'asset-page-2',
    })
    expect(store.items.map((item) => item.id)).toEqual([assetId, secondAssetId])
    expect(store.nextCursor).toBeNull()
  })

  it('reads a selected asset and replaces metadata with its exact version', async () => {
    const store = useAssetCatalogStore()
    const client = createClient()
    vi.mocked(client.listAssets).mockResolvedValue({ items: [asset()] })
    vi.mocked(client.listAssetAnnotations)
      .mockResolvedValueOnce({
        items: [annotation(secondAnnotationId, { created_at: '2026-07-16T07:00:00Z' })],
        next_cursor: 'annotation-page-2',
      })
      .mockResolvedValueOnce({ items: [annotation()] })
    await store.load('', client)

    await expect(store.select(assetId, client)).resolves.toBe(true)
    await expect(
      store.saveMetadata(
        { title: 'Edited note', language: 'zh-CN', collection_id: collectionId },
        client,
      ),
    ).resolves.toBe(true)

    expect(client.getAsset).toHaveBeenCalledWith(assetId)
    expect(client.listAssetAnnotations).toHaveBeenNthCalledWith(1, assetId, {
      limit: 100,
      cursor: undefined,
    })
    expect(client.listAssetAnnotations).toHaveBeenNthCalledWith(2, assetId, {
      limit: 100,
      cursor: 'annotation-page-2',
    })
    expect(client.getAssetProcessingStatus).toHaveBeenCalledWith(assetId)
    expect(store.annotations.map((item) => item.id)).toEqual([annotationId, secondAnnotationId])
    expect(store.processingStatus?.jobs[0]?.state).toBe('succeeded')
    expect(store.audioSource).toBe(`/api/v1/assets/${assetId}/audio`)
    expect(store.waveformSource).toBe(`/api/v1/assets/${assetId}/waveform`)
    expect(client.updateAssetMetadata).toHaveBeenCalledWith(assetId, 3, {
      title: 'Edited note',
      language: 'zh-CN',
      collection_id: collectionId,
    })
    expect(store.selectedAsset).toMatchObject({
      title: 'Edited note',
      language: 'zh-CN',
      collection_id: collectionId,
      version: 4,
    })
    expect(store.items[0]).toEqual(store.selectedAsset)
    expect(store.notice).toBe('Saved metadata version 4.')
  })

  it('binds taxonomy, provider, speaker, status, and date filters to every asset page', async () => {
    const store = useAssetCatalogStore()
    const client = createClient()
    vi.mocked(client.listAssets)
      .mockResolvedValueOnce({ items: [asset()], next_cursor: 'filtered-page-2' })
      .mockResolvedValueOnce({ items: [] })
    store.setFilters({
      collectionId,
      tagId,
      status: 'ready',
      providerId: 'mock_asr',
      speaker: ' Alice ',
      createdFrom: '2026-07-01T00:00:00.000Z',
      createdBefore: '2026-08-01T00:00:00.000Z',
    })

    await store.load(' Field ', client)
    await store.loadMore(client)

    const filters = {
      query: 'Field',
      collectionId,
      tagId,
      status: 'ready' as const,
      providerId: 'mock_asr' as const,
      speaker: 'Alice',
      createdFrom: '2026-07-01T00:00:00.000Z',
      createdBefore: '2026-08-01T00:00:00.000Z',
      limit: 20,
    }
    expect(client.listAssets).toHaveBeenNthCalledWith(1, filters)
    expect(client.listAssets).toHaveBeenNthCalledWith(2, {
      ...filters,
      cursor: 'filtered-page-2',
    })
  })

  it('assigns and removes tags, then trashes and restores with exact versions', async () => {
    const store = useAssetCatalogStore()
    const client = createClient()
    vi.mocked(client.listAssets).mockResolvedValue({ items: [asset()] })
    vi.mocked(client.listTags).mockResolvedValue({ items: [tag()] })
    vi.mocked(client.listAssetTags)
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [tag()] })
      .mockResolvedValueOnce({ items: [] })
    await store.load('', client)
    await store.select(assetId, client)

    await expect(store.setTagAssignment(tagId, true, client)).resolves.toBe(true)
    expect(client.addAssetTags).toHaveBeenCalledWith(assetId, [tagId])
    expect(store.selectedTags.map((item) => item.id)).toEqual([tagId])
    await expect(store.setTagAssignment(tagId, false, client)).resolves.toBe(true)
    expect(client.removeAssetTags).toHaveBeenCalledWith(assetId, [tagId])
    expect(store.selectedTags).toEqual([])

    await expect(store.trashSelected(client)).resolves.toBe(true)
    expect(client.trashAsset).toHaveBeenCalledWith(assetId, 3)
    expect(store.selectedAsset).toMatchObject({ status: 'trashed', version: 4 })
    expect(store.items).toEqual([])
    await expect(store.restoreSelected(client)).resolves.toBe(true)
    expect(client.restoreAsset).toHaveBeenCalledWith(assetId, 4)
    expect(store.selectedAsset).toMatchObject({ status: 'ready', version: 5 })
    expect(store.notice).toBe('Restored asset as ready at version 5.')
  })

  it('continues a bulk trash operation after one optimistic-concurrency failure', async () => {
    const store = useAssetCatalogStore()
    const client = createClient()
    vi.mocked(client.listAssets).mockResolvedValue({
      items: [asset(), asset(secondAssetId, { version: 7 })],
    })
    vi.mocked(client.trashAsset).mockImplementation(async (selectedAssetId, version) => {
      if (selectedAssetId === secondAssetId) {
        throw new ApiError('Asset changed before the bulk operation.', {
          status: 409,
          code: 'conflict',
          requestId: 'request-bulk-conflict',
        })
      }
      return asset(selectedAssetId, { status: 'trashed', version: version + 1 })
    })
    await store.load('', client)

    expect(store.setBulkSelection(assetId, true)).toBe(true)
    expect(store.setBulkSelection(secondAssetId, true)).toBe(true)
    expect(store.bulkLifecycleAction).toBe('trash')
    await expect(store.changeBulkLifecycle(client)).resolves.toBe(false)

    expect(client.trashAsset).toHaveBeenNthCalledWith(1, assetId, 3)
    expect(client.trashAsset).toHaveBeenNthCalledWith(2, secondAssetId, 7)
    expect(store.items.map((item) => item.id)).toEqual([secondAssetId])
    expect(store.selectedAssetIds).toEqual([secondAssetId])
    expect(store.bulkLifecycleFailures).toEqual([
      {
        assetId: secondAssetId,
        title: 'Planning call',
        message: 'Asset changed before the bulk operation. Request ID: request-bulk-conflict.',
      },
    ])
    expect(store.notice).toBe('Moved 1 of 2 selected assets to trash.')
    expect(store.error).toBe('1 selected asset could not be moved to trash.')
  })

  it('requires an exact confirmation before starting and observing a permanent purge', async () => {
    const store = useAssetCatalogStore()
    const client = createClient()
    store.setFilters({ status: 'trashed' })
    vi.mocked(client.listAssets).mockResolvedValue({
      items: [asset(assetId, { status: 'trashed', version: 4 })],
    })
    await store.load('', client)
    await store.select(assetId, client)

    await expect(store.purgeSelected('wrong-id', 'purge-key', client)).resolves.toBeNull()
    expect(client.requestAssetPurge).not.toHaveBeenCalled()
    expect(store.error).toBe('Type the exact asset ID to confirm permanent deletion.')

    await expect(store.purgeSelected(assetId, 'purge-key', client)).resolves.toMatchObject({
      job_id: purgeJobId,
      state: 'queued',
    })
    expect(client.requestAssetPurge).toHaveBeenCalledWith(assetId, 4, assetId, 'purge-key')
    expect(store.items).toEqual([])
    expect(store.selectedAsset).toBeNull()
    expect(store.purgeJob).toMatchObject({ job_id: purgeJobId, state: 'queued' })

    await expect(store.refreshPurge(client)).resolves.toBe(true)
    expect(client.getAssetPurgeJob).toHaveBeenCalledWith(purgeJobId)
    expect(store.purgeJob?.state).toBe('succeeded')
    expect(store.notice).toBe(`Asset ${assetId} was permanently deleted.`)
  })

  it('requires a second exact confirmation to resume a terminal failed purge', async () => {
    const store = useAssetCatalogStore()
    const client = createClient()
    store.setFilters({ status: 'trashed' })
    vi.mocked(client.listAssets).mockResolvedValue({
      items: [asset(assetId, { status: 'trashed', version: 4 })],
    })
    vi.mocked(client.getAssetPurgeJob).mockResolvedValue({
      job_id: purgeJobId,
      asset_id: assetId,
      asset_version: 4,
      state: 'failed',
      requested_at: now,
    })
    await store.load('', client)
    await store.select(assetId, client)
    await store.purgeSelected(assetId, 'initial-purge-key', client)
    await store.refreshPurge(client)

    await expect(store.resumePurge('wrong-id', 'resume-key', client)).resolves.toBeNull()
    expect(store.error).toBe('Type the exact asset ID to resume permanent deletion.')

    await expect(store.resumePurge(assetId, 'resume-key', client)).resolves.toMatchObject({
      state: 'queued',
    })
    expect(client.requestAssetPurge).toHaveBeenNthCalledWith(2, assetId, 4, assetId, 'resume-key')
  })

  it('restores every selected trashed asset with its own exact version', async () => {
    const store = useAssetCatalogStore()
    const client = createClient()
    store.setFilters({ status: 'trashed' })
    vi.mocked(client.listAssets).mockResolvedValue({
      items: [
        asset(assetId, { status: 'trashed', version: 4 }),
        asset(secondAssetId, { status: 'trashed', version: 9 }),
      ],
    })
    vi.mocked(client.restoreAsset).mockImplementation(async (selectedAssetId, version) =>
      asset(selectedAssetId, { status: 'ready', version: version + 1 }),
    )
    await store.load('', client)

    expect(store.selectAllLoaded(true)).toBe(true)
    expect(store.bulkLifecycleAction).toBe('restore')
    await expect(store.changeBulkLifecycle(client)).resolves.toBe(true)

    expect(client.restoreAsset).toHaveBeenNthCalledWith(1, assetId, 4)
    expect(client.restoreAsset).toHaveBeenNthCalledWith(2, secondAssetId, 9)
    expect(store.items).toEqual([])
    expect(store.selectedAssetIds).toEqual([])
    expect(store.bulkLifecycleFailures).toEqual([])
    expect(store.notice).toBe('Restored 2 selected assets.')
    expect(store.error).toBeNull()
  })

  it('creates an audited annotation in the selected asset detail', async () => {
    const store = useAssetCatalogStore()
    const client = createClient()
    vi.mocked(client.listAssets).mockResolvedValue({ items: [asset()] })
    await store.load('', client)
    await store.select(assetId, client)

    await expect(
      store.createAnnotation(
        { kind: 'note', start_ms: 1_250, end_ms: 2_500, body: 'Follow up' },
        client,
      ),
    ).resolves.toBe(true)

    expect(client.createAssetAnnotation).toHaveBeenCalledWith(assetId, {
      kind: 'note',
      start_ms: 1_250,
      end_ms: 2_500,
      body: 'Follow up',
    })
    expect(store.annotations[0]).toMatchObject({
      id: annotationId,
      start_ms: 1_250,
      end_ms: 2_500,
      body: 'Follow up',
    })
    expect(store.notice).toBe('Created note at 1250 ms.')
  })

  it('reports an optimistic-concurrency conflict without replacing the selected asset', async () => {
    const store = useAssetCatalogStore()
    const client = createClient()
    vi.mocked(client.listAssets).mockResolvedValue({ items: [asset()] })
    vi.mocked(client.updateAssetMetadata).mockRejectedValue(
      new ApiError('Asset metadata changed.', {
        status: 409,
        code: 'conflict',
        requestId: 'request-conflict',
      }),
    )
    await store.load('', client)
    await store.select(assetId, client)

    await expect(
      store.saveMetadata({ title: 'Stale edit', language: 'en-US', collection_id: null }, client),
    ).resolves.toBe(false)

    expect(store.selectedAsset?.title).toBe('Field note')
    expect(store.error).toBe('Asset metadata changed. Request ID: request-conflict.')
    expect(store.notice).toBeNull()
  })
})
