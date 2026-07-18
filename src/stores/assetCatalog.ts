import { computed, readonly, ref } from 'vue'
import { defineStore } from 'pinia'

import { ApiError, apiClient } from '@/api/client'
import type {
  Annotation,
  AnnotationList,
  Asset,
  AssetList,
  AssetPurgeJob,
  AssetStatus,
  ASRProviderId,
  Collection,
  CollectionList,
  CreateAnnotationRequest,
  ListAssetsOptions,
  ListAnnotationsOptions,
  ListCollectionsOptions,
  ListTagsOptions,
  ProcessingStatus,
  Tag,
  TagList,
  UpdateAssetMetadataRequest,
} from '@/api/client'

const ASSET_PAGE_SIZE = 20
const COLLECTION_PAGE_SIZE = 100
const MAX_COLLECTION_PAGES = 100
const TAG_PAGE_SIZE = 100
const MAX_TAG_PAGES = 100
const ANNOTATION_PAGE_SIZE = 100
const MAX_ANNOTATION_PAGES = 100
const MAX_BULK_ASSETS = 100

export interface BulkLifecycleFailure {
  assetId: string
  title: string
  message: string
}

export interface AssetCatalogClient {
  listAssets(options?: ListAssetsOptions): Promise<AssetList>
  getAsset(assetId: string): Promise<Asset>
  updateAssetMetadata(
    assetId: string,
    version: number,
    input: UpdateAssetMetadataRequest,
  ): Promise<Asset>
  trashAsset(assetId: string, version: number): Promise<Asset>
  restoreAsset(assetId: string, version: number): Promise<Asset>
  requestAssetPurge(
    assetId: string,
    version: number,
    confirmation: string,
    idempotencyKey: string,
  ): Promise<AssetPurgeJob>
  getAssetPurgeJob(jobId: string): Promise<AssetPurgeJob>
  listCollections(options?: ListCollectionsOptions): Promise<CollectionList>
  listTags(options?: ListTagsOptions): Promise<TagList>
  listAssetTags(assetId: string, options?: ListTagsOptions): Promise<TagList>
  addAssetTags(assetId: string, tagIds: string[]): Promise<unknown>
  removeAssetTags(assetId: string, tagIds: string[]): Promise<unknown>
  listAssetAnnotations(assetId: string, options?: ListAnnotationsOptions): Promise<AnnotationList>
  createAssetAnnotation(assetId: string, input: CreateAnnotationRequest): Promise<Annotation>
  getAssetProcessingStatus(assetId: string): Promise<ProcessingStatus>
  audioUrl(assetId: string): string
  waveformUrl(assetId: string): string
}

export interface AssetCatalogFilters {
  collectionId?: string
  tagId?: string
  status?: AssetStatus | ''
  providerId?: ASRProviderId | ''
  speaker?: string
  createdFrom?: string
  createdBefore?: string
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const request = error.requestId ? ` Request ID: ${error.requestId}.` : ''
    return `${error.message}${request}`
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  return 'The asset catalog operation could not be completed.'
}

function replaceAsset(items: Asset[], updated: Asset): Asset[] {
  return items.map((item) => (item.id === updated.id ? updated : item))
}

async function readCollections(client: AssetCatalogClient): Promise<Collection[]> {
  const byId = new Map<string, Collection>()
  const seenCursors = new Set<string>()
  let cursor: string | undefined

  for (let page = 0; page < MAX_COLLECTION_PAGES; page += 1) {
    const result = await client.listCollections({ limit: COLLECTION_PAGE_SIZE, cursor })
    for (const collection of result.items) {
      byId.set(collection.id, collection)
    }
    if (!result.next_cursor) {
      return [...byId.values()].sort(
        (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
      )
    }
    if (seenCursors.has(result.next_cursor)) {
      throw new TypeError('Server returned a repeated collection cursor.')
    }
    seenCursors.add(result.next_cursor)
    cursor = result.next_cursor
  }

  throw new TypeError('Collection inventory exceeded the safe pagination boundary.')
}

async function readTags(
  reader: (options: ListTagsOptions) => Promise<TagList>,
  repeatedCursorMessage: string,
  boundaryMessage: string,
): Promise<Tag[]> {
  const byId = new Map<string, Tag>()
  const seenCursors = new Set<string>()
  let cursor: string | undefined

  for (let page = 0; page < MAX_TAG_PAGES; page += 1) {
    const result = await reader({ limit: TAG_PAGE_SIZE, cursor })
    for (const tag of result.items) byId.set(tag.id, tag)
    if (!result.next_cursor) {
      return [...byId.values()].sort(
        (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
      )
    }
    if (seenCursors.has(result.next_cursor)) throw new TypeError(repeatedCursorMessage)
    seenCursors.add(result.next_cursor)
    cursor = result.next_cursor
  }

  throw new TypeError(boundaryMessage)
}

function readWorkspaceTags(client: AssetCatalogClient): Promise<Tag[]> {
  return readTags(
    (options) => client.listTags(options),
    'Server returned a repeated tag cursor.',
    'Tag inventory exceeded the safe pagination boundary.',
  )
}

function readAssignedTags(client: AssetCatalogClient, assetId: string): Promise<Tag[]> {
  return readTags(
    (options) => client.listAssetTags(assetId, options),
    'Server returned a repeated assigned-tag cursor.',
    'Assigned-tag inventory exceeded the safe pagination boundary.',
  )
}

async function readAnnotations(client: AssetCatalogClient, assetId: string): Promise<Annotation[]> {
  const byId = new Map<string, Annotation>()
  const seenCursors = new Set<string>()
  let cursor: string | undefined

  for (let page = 0; page < MAX_ANNOTATION_PAGES; page += 1) {
    const result = await client.listAssetAnnotations(assetId, {
      limit: ANNOTATION_PAGE_SIZE,
      cursor,
    })
    for (const annotation of result.items) {
      byId.set(annotation.id, annotation)
    }
    if (!result.next_cursor) {
      return [...byId.values()].sort(
        (left, right) =>
          right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id),
      )
    }
    if (seenCursors.has(result.next_cursor)) {
      throw new TypeError('Server returned a repeated annotation cursor.')
    }
    seenCursors.add(result.next_cursor)
    cursor = result.next_cursor
  }

  throw new TypeError('Annotation inventory exceeded the safe pagination boundary.')
}

export const useAssetCatalogStore = defineStore('asset-catalog', () => {
  const items = ref<Asset[]>([])
  const collections = ref<Collection[]>([])
  const tags = ref<Tag[]>([])
  const query = ref('')
  const collectionFilter = ref('')
  const tagFilter = ref('')
  const statusFilter = ref<AssetStatus | ''>('')
  const providerFilter = ref<ASRProviderId | ''>('')
  const speakerFilter = ref('')
  const createdFromFilter = ref('')
  const createdBeforeFilter = ref('')
  const nextCursor = ref<string | null>(null)
  const selectedAsset = ref<Asset | null>(null)
  const selectedTags = ref<Tag[]>([])
  const annotations = ref<Annotation[]>([])
  const processingStatus = ref<ProcessingStatus | null>(null)
  const audioSource = ref<string | null>(null)
  const waveformSource = ref<string | null>(null)
  const loading = ref(false)
  const loadingMore = ref(false)
  const selecting = ref(false)
  const saving = ref(false)
  const creatingAnnotation = ref(false)
  const changingLifecycle = ref(false)
  const changingBulkLifecycle = ref(false)
  const changingTags = ref(false)
  const purging = ref(false)
  const refreshingPurge = ref(false)
  const purgeJob = ref<AssetPurgeJob | null>(null)
  const selectedAssetIds = ref<string[]>([])
  const bulkLifecycleFailures = ref<BulkLifecycleFailure[]>([])
  const error = ref<string | null>(null)
  const notice = ref<string | null>(null)
  let operationEpoch = 0

  const bulkSelectedAssets = computed(() => {
    const selected = new Set(selectedAssetIds.value)
    return items.value.filter((item) => selected.has(item.id))
  })
  const bulkLifecycleAction = computed<'trash' | 'restore' | null>(() => {
    if (!bulkSelectedAssets.value.length) return null
    if (bulkSelectedAssets.value.every((item) => item.status === 'trashed')) return 'restore'
    if (bulkSelectedAssets.value.every((item) => item.status !== 'trashed')) return 'trash'
    return null
  })

  const isBusy = computed(
    () =>
      loading.value ||
      loadingMore.value ||
      selecting.value ||
      saving.value ||
      creatingAnnotation.value ||
      changingLifecycle.value ||
      changingBulkLifecycle.value ||
      changingTags.value ||
      purging.value ||
      refreshingPurge.value,
  )

  function clearSelectedDetail(): void {
    selectedAsset.value = null
    selectedTags.value = []
    annotations.value = []
    processingStatus.value = null
    audioSource.value = null
    waveformSource.value = null
  }

  function setFilters(filters: AssetCatalogFilters): void {
    collectionFilter.value = filters.collectionId?.trim() ?? ''
    tagFilter.value = filters.tagId?.trim() ?? ''
    statusFilter.value = filters.status ?? ''
    providerFilter.value = filters.providerId ?? ''
    speakerFilter.value = filters.speaker?.trim() ?? ''
    createdFromFilter.value = filters.createdFrom?.trim() ?? ''
    createdBeforeFilter.value = filters.createdBefore?.trim() ?? ''
  }

  function listOptions(cursor?: string): ListAssetsOptions {
    return {
      query: query.value,
      ...(collectionFilter.value ? { collectionId: collectionFilter.value } : {}),
      ...(tagFilter.value ? { tagId: tagFilter.value } : {}),
      ...(statusFilter.value ? { status: statusFilter.value } : {}),
      ...(providerFilter.value ? { providerId: providerFilter.value } : {}),
      ...(speakerFilter.value ? { speaker: speakerFilter.value } : {}),
      ...(createdFromFilter.value ? { createdFrom: createdFromFilter.value } : {}),
      ...(createdBeforeFilter.value ? { createdBefore: createdBeforeFilter.value } : {}),
      limit: ASSET_PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    }
  }

  async function load(
    search = query.value,
    client: AssetCatalogClient = apiClient,
  ): Promise<boolean> {
    if (isBusy.value) {
      return false
    }
    const epoch = ++operationEpoch
    loading.value = true
    error.value = null
    notice.value = null
    const normalizedSearch = search.trim()
    try {
      query.value = normalizedSearch
      const [assetPage, collectionItems, tagItems] = await Promise.all([
        client.listAssets(listOptions()),
        readCollections(client),
        readWorkspaceTags(client),
      ])
      if (epoch !== operationEpoch) {
        return false
      }
      items.value = assetPage.items
      selectedAssetIds.value = []
      bulkLifecycleFailures.value = []
      collections.value = collectionItems
      tags.value = tagItems
      nextCursor.value = assetPage.next_cursor ?? null
      if (selectedAsset.value) {
        const selected = assetPage.items.find((item) => item.id === selectedAsset.value?.id)
        if (selected) {
          selectedAsset.value = selected
        } else {
          clearSelectedDetail()
        }
      }
      return true
    } catch (reason) {
      if (epoch === operationEpoch) {
        error.value = safeErrorMessage(reason)
      }
      return false
    } finally {
      if (epoch === operationEpoch) {
        loading.value = false
      }
    }
  }

  async function loadMore(client: AssetCatalogClient = apiClient): Promise<boolean> {
    if (!nextCursor.value || isBusy.value) {
      return false
    }
    const epoch = operationEpoch
    const cursor = nextCursor.value
    loadingMore.value = true
    error.value = null
    notice.value = null
    try {
      const page = await client.listAssets({
        ...listOptions(cursor),
      })
      if (epoch !== operationEpoch) {
        return false
      }
      const known = new Set(items.value.map((item) => item.id))
      items.value = [...items.value, ...page.items.filter((item) => !known.has(item.id))]
      nextCursor.value = page.next_cursor ?? null
      return true
    } catch (reason) {
      if (epoch === operationEpoch) {
        error.value = safeErrorMessage(reason)
      }
      return false
    } finally {
      if (epoch === operationEpoch) {
        loadingMore.value = false
      }
    }
  }

  async function select(assetId: string, client: AssetCatalogClient = apiClient): Promise<boolean> {
    if (isBusy.value) {
      return false
    }
    const epoch = operationEpoch
    selecting.value = true
    error.value = null
    notice.value = null
    const summary = items.value.find((item) => item.id === assetId)
    if (summary?.status === 'trashed') {
      selectedAsset.value = summary
      selectedTags.value = []
      annotations.value = []
      processingStatus.value = null
      audioSource.value = null
      waveformSource.value = null
      selecting.value = false
      return true
    }
    try {
      const [asset, annotationItems, status, assignedTags] = await Promise.all([
        client.getAsset(assetId),
        readAnnotations(client, assetId),
        client.getAssetProcessingStatus(assetId),
        readAssignedTags(client, assetId),
      ])
      if (epoch !== operationEpoch) {
        return false
      }
      selectedAsset.value = asset
      selectedTags.value = assignedTags
      annotations.value = annotationItems
      processingStatus.value = status
      audioSource.value = client.audioUrl(asset.id)
      waveformSource.value = client.waveformUrl(asset.id)
      items.value = replaceAsset(items.value, asset)
      return true
    } catch (reason) {
      if (epoch === operationEpoch) {
        error.value = safeErrorMessage(reason)
      }
      return false
    } finally {
      if (epoch === operationEpoch) {
        selecting.value = false
      }
    }
  }

  async function changeLifecycle(
    restore: boolean,
    client: AssetCatalogClient = apiClient,
  ): Promise<boolean> {
    const current = selectedAsset.value
    if (!current) {
      error.value = 'Select an asset before changing its lifecycle.'
      return false
    }
    if (isBusy.value) return false
    changingLifecycle.value = true
    error.value = null
    notice.value = null
    try {
      const updated = restore
        ? await client.restoreAsset(current.id, current.version)
        : await client.trashAsset(current.id, current.version)
      selectedAsset.value = updated
      if (updated.status === 'trashed') {
        selectedTags.value = []
        annotations.value = []
        processingStatus.value = null
        audioSource.value = null
        waveformSource.value = null
      }
      if ((statusFilter.value === 'trashed') !== (updated.status === 'trashed')) {
        items.value = items.value.filter((item) => item.id !== updated.id)
      } else {
        items.value = replaceAsset(items.value, updated)
      }
      selectedAssetIds.value = selectedAssetIds.value.filter((assetId) => assetId !== updated.id)
      bulkLifecycleFailures.value = bulkLifecycleFailures.value.filter(
        (failure) => failure.assetId !== updated.id,
      )
      notice.value = restore
        ? `Restored asset as ${updated.status} at version ${updated.version}.`
        : `Moved asset to trash at version ${updated.version}.`
      return true
    } catch (reason) {
      error.value = safeErrorMessage(reason)
      return false
    } finally {
      changingLifecycle.value = false
    }
  }

  async function purgeSelected(
    confirmation: string,
    idempotencyKey: string,
    client: AssetCatalogClient = apiClient,
  ): Promise<AssetPurgeJob | null> {
    const current = selectedAsset.value
    if (!current || current.status !== 'trashed') {
      error.value = 'Select a trashed asset before requesting permanent deletion.'
      return null
    }
    if (confirmation !== current.id) {
      error.value = 'Type the exact asset ID to confirm permanent deletion.'
      return null
    }
    if (isBusy.value) return null
    purging.value = true
    error.value = null
    notice.value = null
    try {
      const requested = await client.requestAssetPurge(
        current.id,
        current.version,
        confirmation,
        idempotencyKey,
      )
      purgeJob.value = requested
      items.value = items.value.filter((item) => item.id !== current.id)
      selectedAssetIds.value = selectedAssetIds.value.filter((assetId) => assetId !== current.id)
      bulkLifecycleFailures.value = bulkLifecycleFailures.value.filter(
        (failure) => failure.assetId !== current.id,
      )
      clearSelectedDetail()
      notice.value = `Permanent deletion started. Purge job ${requested.job_id} is ${requested.state}.`
      return requested
    } catch (reason) {
      error.value = safeErrorMessage(reason)
      return null
    } finally {
      purging.value = false
    }
  }

  async function refreshPurge(client: AssetCatalogClient = apiClient): Promise<boolean> {
    const current = purgeJob.value
    if (!current || isBusy.value) return false
    refreshingPurge.value = true
    error.value = null
    try {
      const updated = await client.getAssetPurgeJob(current.job_id)
      purgeJob.value = updated
      notice.value =
        updated.state === 'succeeded'
          ? `Asset ${updated.asset_id} was permanently deleted.`
          : `Purge job ${updated.job_id} is ${updated.state}.`
      return true
    } catch (reason) {
      error.value = safeErrorMessage(reason)
      return false
    } finally {
      refreshingPurge.value = false
    }
  }

  async function resumePurge(
    confirmation: string,
    idempotencyKey: string,
    client: AssetCatalogClient = apiClient,
  ): Promise<AssetPurgeJob | null> {
    const current = purgeJob.value
    if (!current || current.state !== 'failed') {
      error.value = 'Only a terminal failed purge can be resumed.'
      return null
    }
    if (confirmation !== current.asset_id) {
      error.value = 'Type the exact asset ID to resume permanent deletion.'
      return null
    }
    if (isBusy.value) return null
    purging.value = true
    error.value = null
    notice.value = null
    try {
      const resumed = await client.requestAssetPurge(
        current.asset_id,
        current.asset_version,
        confirmation,
        idempotencyKey,
      )
      purgeJob.value = resumed
      notice.value = `Permanent deletion resumed. Purge job ${resumed.job_id} is ${resumed.state}.`
      return resumed
    } catch (reason) {
      error.value = safeErrorMessage(reason)
      return null
    } finally {
      purging.value = false
    }
  }

  function setBulkSelection(assetId: string, selected: boolean): boolean {
    if (isBusy.value) return false
    const candidate = items.value.find((item) => item.id === assetId)
    if (!candidate) {
      error.value = 'Only loaded assets can be selected for a bulk operation.'
      return false
    }
    if (!selected) {
      selectedAssetIds.value = selectedAssetIds.value.filter((id) => id !== assetId)
      bulkLifecycleFailures.value = bulkLifecycleFailures.value.filter(
        (failure) => failure.assetId !== assetId,
      )
      if (!selectedAssetIds.value.length) {
        error.value = null
        notice.value = null
      }
      return true
    }
    if (selectedAssetIds.value.includes(assetId)) return true
    if (selectedAssetIds.value.length >= MAX_BULK_ASSETS) {
      error.value = `Select at most ${MAX_BULK_ASSETS} assets per bulk operation.`
      return false
    }
    const selectedItems = bulkSelectedAssets.value
    if (
      selectedItems.length &&
      selectedItems.some((item) => (item.status === 'trashed') !== (candidate.status === 'trashed'))
    ) {
      error.value = 'Bulk selection cannot mix active and trashed assets.'
      return false
    }
    selectedAssetIds.value = [...selectedAssetIds.value, assetId]
    bulkLifecycleFailures.value = []
    error.value = null
    notice.value = null
    return true
  }

  function selectAllLoaded(selected: boolean): boolean {
    if (isBusy.value) return false
    if (!selected) {
      selectedAssetIds.value = []
      bulkLifecycleFailures.value = []
      error.value = null
      notice.value = null
      return true
    }
    if (items.value.length > MAX_BULK_ASSETS) {
      error.value = `Select at most ${MAX_BULK_ASSETS} assets per bulk operation.`
      return false
    }
    const includesTrashed = items.value.some((item) => item.status === 'trashed')
    const includesActive = items.value.some((item) => item.status !== 'trashed')
    if (includesTrashed && includesActive) {
      error.value = 'Bulk selection cannot mix active and trashed assets.'
      return false
    }
    selectedAssetIds.value = items.value.map((item) => item.id)
    bulkLifecycleFailures.value = []
    error.value = null
    notice.value = null
    return true
  }

  async function changeBulkLifecycle(client: AssetCatalogClient = apiClient): Promise<boolean> {
    if (isBusy.value) return false
    const selected = bulkSelectedAssets.value
    const action = bulkLifecycleAction.value
    if (!selected.length) {
      error.value = 'Select at least one loaded asset before running a bulk operation.'
      return false
    }
    if (!action) {
      error.value = 'Bulk selection cannot mix active and trashed assets.'
      return false
    }

    changingBulkLifecycle.value = true
    error.value = null
    notice.value = null
    bulkLifecycleFailures.value = []
    const failures: BulkLifecycleFailure[] = []
    const succeeded = new Set<string>()
    try {
      for (const current of selected) {
        try {
          const updated =
            action === 'restore'
              ? await client.restoreAsset(current.id, current.version)
              : await client.trashAsset(current.id, current.version)
          succeeded.add(current.id)
          if ((statusFilter.value === 'trashed') !== (updated.status === 'trashed')) {
            items.value = items.value.filter((item) => item.id !== updated.id)
          } else {
            items.value = replaceAsset(items.value, updated)
          }
          if (selectedAsset.value?.id === updated.id) clearSelectedDetail()
        } catch (reason) {
          failures.push({
            assetId: current.id,
            title: current.title,
            message: safeErrorMessage(reason),
          })
        }
      }
      selectedAssetIds.value = selectedAssetIds.value.filter((id) => !succeeded.has(id))
      bulkLifecycleFailures.value = failures
      const successfulCount = selected.length - failures.length
      if (action === 'restore') {
        notice.value = failures.length
          ? `Restored ${successfulCount} of ${selected.length} selected assets.`
          : `Restored ${successfulCount} selected ${successfulCount === 1 ? 'asset' : 'assets'}.`
      } else {
        notice.value = failures.length
          ? `Moved ${successfulCount} of ${selected.length} selected assets to trash.`
          : `Moved ${successfulCount} selected ${successfulCount === 1 ? 'asset' : 'assets'} to trash.`
      }
      if (failures.length) {
        error.value = `${failures.length} selected ${failures.length === 1 ? 'asset' : 'assets'} could not be ${
          action === 'restore' ? 'restored' : 'moved to trash'
        }.`
      }
      return failures.length === 0
    } finally {
      changingBulkLifecycle.value = false
    }
  }

  async function setTagAssignment(
    tagId: string,
    assigned: boolean,
    client: AssetCatalogClient = apiClient,
  ): Promise<boolean> {
    const current = selectedAsset.value
    if (!current || current.status === 'trashed') {
      error.value = 'Select an active asset before changing tags.'
      return false
    }
    if (isBusy.value) return false
    changingTags.value = true
    error.value = null
    notice.value = null
    try {
      if (assigned) await client.addAssetTags(current.id, [tagId])
      else await client.removeAssetTags(current.id, [tagId])
      selectedTags.value = await readAssignedTags(client, current.id)
      notice.value = assigned ? 'Assigned tag.' : 'Removed tag.'
      return true
    } catch (reason) {
      error.value = safeErrorMessage(reason)
      return false
    } finally {
      changingTags.value = false
    }
  }

  async function saveMetadata(
    input: UpdateAssetMetadataRequest,
    client: AssetCatalogClient = apiClient,
  ): Promise<boolean> {
    const current = selectedAsset.value
    if (!current) {
      error.value = 'Select an asset before editing metadata.'
      return false
    }
    if (isBusy.value) {
      return false
    }
    const epoch = operationEpoch
    saving.value = true
    error.value = null
    notice.value = null
    try {
      const updated = await client.updateAssetMetadata(current.id, current.version, input)
      if (epoch !== operationEpoch) {
        return false
      }
      selectedAsset.value = updated
      items.value = replaceAsset(items.value, updated)
      notice.value = `Saved metadata version ${updated.version}.`
      return true
    } catch (reason) {
      if (epoch === operationEpoch) {
        error.value = safeErrorMessage(reason)
      }
      return false
    } finally {
      if (epoch === operationEpoch) {
        saving.value = false
      }
    }
  }

  async function createAnnotation(
    input: CreateAnnotationRequest,
    client: AssetCatalogClient = apiClient,
  ): Promise<boolean> {
    const current = selectedAsset.value
    if (!current) {
      error.value = 'Select an asset before creating an annotation.'
      return false
    }
    if (isBusy.value) {
      return false
    }
    const epoch = operationEpoch
    creatingAnnotation.value = true
    error.value = null
    notice.value = null
    try {
      const created = await client.createAssetAnnotation(current.id, input)
      if (epoch !== operationEpoch) {
        return false
      }
      annotations.value = [created, ...annotations.value.filter((item) => item.id !== created.id)]
      notice.value = `Created ${created.kind} at ${created.start_ms} ms.`
      return true
    } catch (reason) {
      if (epoch === operationEpoch) {
        error.value = safeErrorMessage(reason)
      }
      return false
    } finally {
      if (epoch === operationEpoch) {
        creatingAnnotation.value = false
      }
    }
  }

  function reset(): void {
    operationEpoch += 1
    items.value = []
    collections.value = []
    tags.value = []
    query.value = ''
    setFilters({})
    nextCursor.value = null
    clearSelectedDetail()
    loading.value = false
    loadingMore.value = false
    selecting.value = false
    saving.value = false
    creatingAnnotation.value = false
    changingLifecycle.value = false
    changingBulkLifecycle.value = false
    changingTags.value = false
    purging.value = false
    refreshingPurge.value = false
    purgeJob.value = null
    selectedAssetIds.value = []
    bulkLifecycleFailures.value = []
    error.value = null
    notice.value = null
  }

  return {
    annotations: readonly(annotations),
    audioSource: readonly(audioSource),
    bulkLifecycleAction,
    bulkLifecycleFailures: readonly(bulkLifecycleFailures),
    bulkSelectionLimit: MAX_BULK_ASSETS,
    changeBulkLifecycle,
    changingBulkLifecycle: readonly(changingBulkLifecycle),
    collections: readonly(collections),
    collectionFilter: readonly(collectionFilter),
    createAnnotation,
    creatingAnnotation: readonly(creatingAnnotation),
    createdBeforeFilter: readonly(createdBeforeFilter),
    createdFromFilter: readonly(createdFromFilter),
    error: readonly(error),
    isBusy,
    items: readonly(items),
    load,
    loading: readonly(loading),
    loadingMore: readonly(loadingMore),
    loadMore,
    nextCursor: readonly(nextCursor),
    notice: readonly(notice),
    processingStatus: readonly(processingStatus),
    providerFilter: readonly(providerFilter),
    purgeJob: readonly(purgeJob),
    purgeSelected,
    purging: readonly(purging),
    query: readonly(query),
    refreshPurge,
    refreshingPurge: readonly(refreshingPurge),
    reset,
    resumePurge,
    restoreSelected: (client?: AssetCatalogClient) => changeLifecycle(true, client),
    saveMetadata,
    saving: readonly(saving),
    select,
    selectedAsset: readonly(selectedAsset),
    selectedAssetIds: readonly(selectedAssetIds),
    selectedTags: readonly(selectedTags),
    speakerFilter: readonly(speakerFilter),
    selecting: readonly(selecting),
    setFilters,
    setBulkSelection,
    setTagAssignment,
    selectAllLoaded,
    statusFilter: readonly(statusFilter),
    tagFilter: readonly(tagFilter),
    tags: readonly(tags),
    trashSelected: (client?: AssetCatalogClient) => changeLifecycle(false, client),
    changingLifecycle: readonly(changingLifecycle),
    changingTags: readonly(changingTags),
    waveformSource: readonly(waveformSource),
  }
})
