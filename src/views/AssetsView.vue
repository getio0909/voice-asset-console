<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import type { AnnotationKind } from '@/api/client'
import TranscriptTimeline from '@/components/TranscriptTimeline.vue'
import { useAssetCatalogStore } from '@/stores/assetCatalog'
import { useAssetsStore } from '@/stores/assets'
import { useConsoleStore } from '@/stores/console'

const assetsStore = useAssetsStore()
const catalogStore = useAssetCatalogStore()
const consoleStore = useConsoleStore()
const email = ref('')
const password = ref('')
const deviceName = ref('VoiceAsset Console')
const title = ref('')
const language = ref('und')
const selectedFile = ref<File | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const audio = ref<HTMLAudioElement | null>(null)
const catalogAudio = ref<HTMLAudioElement | null>(null)
const currentTimeMs = ref(0)
const catalogCurrentTimeMs = ref(0)
const catalogPlaybackRate = ref(1)
const waveformLoaded = ref(false)
const waveformUnavailable = ref(false)
const catalogSearch = ref('')
const catalogCollectionId = ref('')
const catalogTagId = ref('')
const catalogStatus = ref('')
const catalogProviderId = ref('')
const catalogSpeaker = ref('')
const catalogCreatedFrom = ref('')
const catalogCreatedBefore = ref('')
const metadataTitle = ref('')
const metadataLanguage = ref('und')
const metadataCollectionId = ref('')
const annotationKind = ref<AnnotationKind>('note')
const annotationStartMs = ref('0')
const annotationEndMs = ref('')
const annotationBody = ref('')
const purgeConfirmation = ref('')

const canReadAssets = computed(() => assetsStore.user?.scopes.includes('assets:read') ?? false)
const canManageAssets = computed(() => assetsStore.user?.scopes.includes('assets:write') ?? false)
const canEditMetadata = computed(() => assetsStore.user?.scopes.includes('metadata:write') ?? false)
const canPermanentlyDelete = computed(
  () => assetsStore.user?.role === 'owner' && canManageAssets.value,
)
const assignedTagIds = computed(() => new Set(catalogStore.selectedTags.map((tag) => tag.id)))
const bulkSelectedIdSet = computed(() => new Set(catalogStore.selectedAssetIds))
const allLoadedAssetsSelected = computed(
  () =>
    catalogStore.items.length > 0 &&
    catalogStore.items.every((asset) => bulkSelectedIdSet.value.has(asset.id)),
)
const bulkActionLabel = computed(() => {
  const count = catalogStore.selectedAssetIds.length
  if (catalogStore.changingBulkLifecycle) return 'Updating selected assets…'
  if (catalogStore.bulkLifecycleAction === 'restore') {
    return `Restore ${count} selected ${count === 1 ? 'asset' : 'assets'}`
  }
  if (catalogStore.bulkLifecycleAction === 'trash') {
    return `Move ${count} selected ${count === 1 ? 'asset' : 'assets'} to trash`
  }
  return 'Select assets for a bulk action'
})
const catalogPlaybackProgress = computed(() => {
  const duration = catalogStore.selectedAsset?.duration_ms ?? 0
  if (duration <= 0) return 0
  return Math.min(100, Math.max(0, (catalogCurrentTimeMs.value / duration) * 100))
})

watch(
  () => catalogStore.selectedAsset,
  (selected) => {
    metadataTitle.value = selected?.title ?? ''
    metadataLanguage.value = selected?.language ?? 'und'
    metadataCollectionId.value = selected?.collection_id ?? ''
    catalogCurrentTimeMs.value = 0
    catalogPlaybackRate.value = 1
    waveformLoaded.value = false
    waveformUnavailable.value = false
    purgeConfirmation.value = ''
  },
  { immediate: true },
)

onMounted(async () => {
  if ((await assetsStore.restoreSession()) && canReadAssets.value) {
    await catalogStore.load()
  }
})

async function submitLogin(): Promise<void> {
  if (await assetsStore.login(email.value, password.value, deviceName.value)) {
    password.value = ''
    if (canReadAssets.value) {
      await catalogStore.load()
    }
  }
}

async function submitAsset(): Promise<void> {
  if (!selectedFile.value) {
    return
  }
  if (
    !(await assetsStore.processAsset({
      title: title.value,
      language: language.value,
      file: selectedFile.value,
    }))
  ) {
    return
  }
  if (canReadAssets.value) {
    await catalogStore.load(catalogStore.query)
    if (assetsStore.asset) {
      await catalogStore.select(assetsStore.asset.id)
    }
  }
}

async function signOut(): Promise<void> {
  if (await assetsStore.logout()) {
    catalogStore.reset()
    catalogSearch.value = ''
  }
}

async function submitCatalogSearch(): Promise<void> {
  catalogStore.setFilters({
    collectionId: catalogCollectionId.value,
    tagId: catalogTagId.value,
    status: catalogStatus.value as
      '' | 'draft' | 'uploading' | 'processing' | 'ready' | 'failed' | 'trashed',
    providerId: catalogProviderId.value as '' | 'mock_asr' | 'aliyun_asr' | 'tencent_asr',
    speaker: catalogSpeaker.value,
    createdFrom: utcDayBoundary(catalogCreatedFrom.value),
    createdBefore: utcDayBoundary(catalogCreatedBefore.value),
  })
  await catalogStore.load(catalogSearch.value)
}

async function clearCatalogFilters(): Promise<void> {
  catalogSearch.value = ''
  catalogCollectionId.value = ''
  catalogTagId.value = ''
  catalogStatus.value = ''
  catalogProviderId.value = ''
  catalogSpeaker.value = ''
  catalogCreatedFrom.value = ''
  catalogCreatedBefore.value = ''
  catalogStore.setFilters({})
  await catalogStore.load('')
}

async function selectCatalogAsset(assetId: string): Promise<void> {
  await catalogStore.select(assetId)
}

async function saveMetadata(): Promise<void> {
  await catalogStore.saveMetadata({
    title: metadataTitle.value,
    language: metadataLanguage.value,
    collection_id: metadataCollectionId.value || null,
  })
}

async function changeAssetLifecycle(): Promise<void> {
  const selected = catalogStore.selectedAsset
  if (!selected) return
  if (selected.status === 'trashed') {
    await catalogStore.restoreSelected()
    return
  }
  if (
    window.confirm(`Move “${selected.title}” to trash? Stored audio and revisions are preserved.`)
  ) {
    await catalogStore.trashSelected()
  }
}

async function submitPermanentDeletion(): Promise<void> {
  const requested = await catalogStore.purgeSelected(
    purgeConfirmation.value,
    `console-purge-${crypto.randomUUID()}`,
  )
  if (requested) {
    purgeConfirmation.value = ''
    clearCompletedPurgeWorkflow()
  }
}

async function resumePermanentDeletion(): Promise<void> {
  const resumed = await catalogStore.resumePurge(
    purgeConfirmation.value,
    `console-purge-resume-${crypto.randomUUID()}`,
  )
  if (resumed) {
    purgeConfirmation.value = ''
    clearCompletedPurgeWorkflow()
  }
}

async function refreshPermanentDeletion(): Promise<void> {
  if (await catalogStore.refreshPurge()) clearCompletedPurgeWorkflow()
}

function clearCompletedPurgeWorkflow(): void {
  const purge = catalogStore.purgeJob
  if (purge?.state === 'succeeded') assetsStore.clearAssetWorkflow(purge.asset_id)
}

function toggleBulkSelection(assetId: string, event: Event): void {
  catalogStore.setBulkSelection(assetId, (event.currentTarget as HTMLInputElement).checked)
}

function toggleAllLoadedAssets(event: Event): void {
  catalogStore.selectAllLoaded((event.currentTarget as HTMLInputElement).checked)
}

async function changeBulkLifecycle(): Promise<void> {
  const count = catalogStore.selectedAssetIds.length
  const action = catalogStore.bulkLifecycleAction
  if (!count || !action) return
  if (
    action === 'trash' &&
    !window.confirm(
      `Move ${count} selected ${count === 1 ? 'asset' : 'assets'} to trash? Stored audio and revisions are preserved.`,
    )
  ) {
    return
  }
  await catalogStore.changeBulkLifecycle()
}

async function toggleTag(tagId: string): Promise<void> {
  await catalogStore.setTagAssignment(tagId, !assignedTagIds.value.has(tagId))
}

async function submitAnnotation(): Promise<void> {
  const created = await catalogStore.createAnnotation({
    kind: annotationKind.value,
    start_ms: Number(annotationStartMs.value),
    ...(annotationEndMs.value ? { end_ms: Number(annotationEndMs.value) } : {}),
    body: annotationBody.value,
  })
  if (created) {
    annotationEndMs.value = ''
    annotationBody.value = ''
  }
}

function durationLabel(milliseconds: number | null): string {
  if (milliseconds === null) return 'duration pending'
  const totalSeconds = Math.floor(milliseconds / 1_000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

function updatedLabel(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function utcDayBoundary(value: string): string | undefined {
  if (!value) return undefined
  return new Date(`${value}T00:00:00.000Z`).toISOString()
}

function timestampLabel(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1_000)
  const hours = Math.floor(totalSeconds / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60
  const fraction = String(milliseconds % 1_000).padStart(3, '0')
  const core = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${fraction}`
  return hours ? `${String(hours).padStart(2, '0')}:${core}` : core
}

function selectFile(event: Event): void {
  const input = event.currentTarget as HTMLInputElement
  selectedFile.value = input.files?.item(0) ?? null
  if (selectedFile.value && !title.value.trim()) {
    title.value = selectedFile.value.name.replace(/\.wav$/i, '')
  }
}

function updatePlaybackTime(event: Event): void {
  currentTimeMs.value = Math.round((event.currentTarget as HTMLAudioElement).currentTime * 1_000)
}

function seekTo(milliseconds: number): void {
  if (audio.value) {
    audio.value.currentTime = milliseconds / 1_000
    currentTimeMs.value = milliseconds
  }
}

function catalogDurationSeconds(): number {
  const mediaDuration = catalogAudio.value?.duration ?? 0
  if (Number.isFinite(mediaDuration) && mediaDuration > 0) return mediaDuration
  return (catalogStore.selectedAsset?.duration_ms ?? 0) / 1_000
}

function seekCatalogTo(seconds: number): void {
  const player = catalogAudio.value
  const duration = catalogDurationSeconds()
  if (!player || duration <= 0) return
  const target = Math.min(duration, Math.max(0, seconds))
  player.currentTime = target
  catalogCurrentTimeMs.value = Math.round(target * 1_000)
}

function seekCatalogFromWaveform(event: MouseEvent): void {
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
  if (bounds.width <= 0) return
  seekCatalogTo(((event.clientX - bounds.left) / bounds.width) * catalogDurationSeconds())
}

function handleCatalogWaveformKey(event: KeyboardEvent): void {
  const player = catalogAudio.value
  if (!player) return
  let target: number | null = null
  if (event.key === 'ArrowLeft') target = player.currentTime - 5
  if (event.key === 'ArrowRight') target = player.currentTime + 5
  if (event.key === 'Home') target = 0
  if (event.key === 'End') target = catalogDurationSeconds()
  if (target === null) return
  event.preventDefault()
  seekCatalogTo(target)
}

function updateCatalogPlaybackTime(event: Event): void {
  catalogCurrentTimeMs.value = Math.round(
    (event.currentTarget as HTMLAudioElement).currentTime * 1_000,
  )
}

function applyCatalogPlaybackRate(): void {
  if (catalogAudio.value) catalogAudio.value.playbackRate = catalogPlaybackRate.value
}

function catalogAudioReady(): void {
  applyCatalogPlaybackRate()
  if (catalogAudio.value) {
    catalogCurrentTimeMs.value = Math.round(catalogAudio.value.currentTime * 1_000)
  }
}

function startAnother(): void {
  assetsStore.resetWorkflow()
  selectedFile.value = null
  title.value = ''
  language.value = 'und'
  currentTimeMs.value = 0
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}
</script>

<template>
  <div class="page-stack">
    <header class="page-heading">
      <span class="eyebrow">Asset workspace</span>
      <h1>Voice assets</h1>
      <p>
        Search the workspace catalog, edit versioned metadata, or ingest a verified recording for
        transcription.
      </p>
    </header>

    <aside v-if="!consoleStore.isReady" class="connection-warning" role="status" aria-live="polite">
      <strong>Server compatibility: {{ consoleStore.apiStatus }}</strong>
      <span v-if="consoleStore.compatibilityIssue">{{ consoleStore.compatibilityIssue }}</span>
      <span v-else>Waiting for the Server contract check before enabling mutations.</span>
    </aside>

    <section
      v-if="assetsStore.sessionStatus === 'checking'"
      class="workflow-panel"
      aria-live="polite"
    >
      <span class="eyebrow">Session</span>
      <h2>Checking the secure web session</h2>
      <p>No access token is stored in browser state.</p>
    </section>

    <section
      v-else-if="!assetsStore.isAuthenticated"
      class="workflow-panel"
      aria-labelledby="login-title"
    >
      <div class="section-heading">
        <div>
          <span class="eyebrow">Local account</span>
          <h2 id="login-title">Sign in</h2>
        </div>
        <p>The Server returns only HttpOnly session cookies, never a token in JSON.</p>
      </div>

      <form class="form-grid" @submit.prevent="submitLogin">
        <label class="field">
          <span>Email</span>
          <input
            v-model.trim="email"
            name="email"
            type="email"
            autocomplete="username"
            maxlength="254"
            required
          />
        </label>
        <label class="field">
          <span>Password</span>
          <input
            v-model="password"
            name="password"
            type="password"
            autocomplete="current-password"
            required
          />
        </label>
        <label class="field field--wide">
          <span>Device name</span>
          <input
            v-model="deviceName"
            name="device-name"
            maxlength="100"
            autocomplete="off"
            required
          />
          <small>Use a recognizable label so you can revoke this browser later.</small>
        </label>
        <button
          type="submit"
          :disabled="!consoleStore.isReady || !email || !password || !deviceName.trim()"
        >
          Sign in securely
        </button>
      </form>
      <p v-if="assetsStore.sessionError" class="error-message" role="alert">
        {{ assetsStore.sessionError }}
      </p>
    </section>

    <template v-else>
      <section class="session-bar" aria-label="Current session">
        <div>
          <span class="eyebrow">Signed in</span>
          <strong>{{ assetsStore.user?.email }}</strong>
          <small>{{ assetsStore.user?.role }} · {{ assetsStore.user?.workspace_id }}</small>
        </div>
        <button
          class="button-secondary"
          type="button"
          :disabled="assetsStore.isBusy"
          @click="signOut"
        >
          Sign out
        </button>
      </section>

      <section class="workflow-panel" aria-labelledby="asset-catalog-title">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Workspace inventory</span>
            <h2 id="asset-catalog-title">Asset catalog</h2>
          </div>
          <span class="status-pill">{{ catalogStore.items.length }} loaded</span>
        </div>

        <p v-if="!canReadAssets">
          This session does not include <code>assets:read</code>; catalog reads are disabled.
        </p>
        <template v-else>
          <form class="catalog-filter-form" role="search" @submit.prevent="submitCatalogSearch">
            <label class="field">
              <span>Search assets</span>
              <input
                v-model="catalogSearch"
                name="asset-search"
                type="search"
                maxlength="200"
                placeholder="Title or transcript terms"
              />
            </label>
            <label class="field">
              <span>Filter by collection</span>
              <select v-model="catalogCollectionId" name="catalog-collection">
                <option value="">All collections</option>
                <option
                  v-for="collection in catalogStore.collections"
                  :key="collection.id"
                  :value="collection.id"
                >
                  {{ collection.name }}
                </option>
              </select>
            </label>
            <label class="field">
              <span>Filter by tag</span>
              <select v-model="catalogTagId" name="catalog-tag">
                <option value="">All tags</option>
                <option v-for="tag in catalogStore.tags" :key="tag.id" :value="tag.id">
                  {{ tag.name }} ({{ tag.asset_count }})
                </option>
              </select>
            </label>
            <label class="field">
              <span>Filter by status</span>
              <select v-model="catalogStatus" name="catalog-status">
                <option value="">Active assets</option>
                <option value="draft">Draft</option>
                <option value="uploading">Uploading</option>
                <option value="processing">Processing</option>
                <option value="ready">Ready</option>
                <option value="failed">Failed</option>
                <option value="trashed">Trash</option>
              </select>
            </label>
            <label class="field">
              <span>Filter by ASR provider</span>
              <select v-model="catalogProviderId" name="catalog-provider">
                <option value="">All ASR providers</option>
                <option value="mock_asr">Mock ASR</option>
                <option value="aliyun_asr">Alibaba Cloud ASR</option>
                <option value="tencent_asr">Tencent Cloud ASR</option>
              </select>
            </label>
            <label class="field">
              <span>Filter by speaker</span>
              <input
                v-model="catalogSpeaker"
                name="catalog-speaker"
                maxlength="200"
                placeholder="Exact speaker label"
              />
            </label>
            <label class="field">
              <span>Created on or after (UTC)</span>
              <input v-model="catalogCreatedFrom" name="created-from" type="date" />
            </label>
            <label class="field">
              <span>Created before (UTC)</span>
              <input v-model="catalogCreatedBefore" name="created-before" type="date" />
            </label>
            <div class="button-row catalog-filter-actions">
              <button type="submit" :disabled="catalogStore.isBusy">Apply filters</button>
              <button
                class="button-secondary"
                type="button"
                :disabled="catalogStore.isBusy"
                @click="catalogStore.load(catalogStore.query)"
              >
                Refresh
              </button>
              <button
                class="button-secondary"
                type="button"
                :disabled="catalogStore.isBusy"
                @click="clearCatalogFilters"
              >
                Clear
              </button>
            </div>
          </form>

          <p v-if="catalogStore.loading" role="status" aria-live="polite">
            Loading the workspace catalog…
          </p>
          <p v-else-if="!catalogStore.items.length && !catalogStore.error">
            No assets match the current catalog filters.
          </p>
          <template v-else-if="catalogStore.items.length">
            <div
              v-if="canManageAssets"
              class="catalog-bulk-toolbar"
              aria-label="Bulk asset actions"
            >
              <label class="catalog-bulk-toggle">
                <input
                  type="checkbox"
                  :checked="allLoadedAssetsSelected"
                  :indeterminate="
                    catalogStore.selectedAssetIds.length > 0 && !allLoadedAssetsSelected
                  "
                  :disabled="catalogStore.isBusy"
                  @change="toggleAllLoadedAssets"
                />
                <span>Select all loaded</span>
              </label>
              <span>
                {{ catalogStore.selectedAssetIds.length }} selected · maximum
                {{ catalogStore.bulkSelectionLimit }}
              </span>
              <div class="button-row">
                <button
                  :class="
                    catalogStore.bulkLifecycleAction === 'trash'
                      ? 'button-danger'
                      : 'button-secondary'
                  "
                  type="button"
                  :disabled="!catalogStore.bulkLifecycleAction || catalogStore.isBusy"
                  @click="changeBulkLifecycle"
                >
                  {{ bulkActionLabel }}
                </button>
                <button
                  class="button-secondary"
                  type="button"
                  :disabled="!catalogStore.selectedAssetIds.length || catalogStore.isBusy"
                  @click="catalogStore.selectAllLoaded(false)"
                >
                  Clear selection
                </button>
              </div>
            </div>
            <ul class="management-list asset-catalog-list" aria-label="Voice assets">
              <li
                v-for="catalogAsset in catalogStore.items"
                :key="catalogAsset.id"
                :class="{ 'asset-catalog-item--selectable': canManageAssets }"
              >
                <label v-if="canManageAssets" class="asset-bulk-select">
                  <input
                    type="checkbox"
                    :aria-label="`Select ${catalogAsset.title}`"
                    :checked="bulkSelectedIdSet.has(catalogAsset.id)"
                    :disabled="catalogStore.isBusy"
                    @change="toggleBulkSelection(catalogAsset.id, $event)"
                  />
                </label>
                <button
                  class="asset-summary"
                  :class="{
                    'asset-summary--selected': catalogStore.selectedAsset?.id === catalogAsset.id,
                  }"
                  type="button"
                  :aria-pressed="catalogStore.selectedAsset?.id === catalogAsset.id"
                  :disabled="catalogStore.isBusy"
                  @click="selectCatalogAsset(catalogAsset.id)"
                >
                  <strong>{{ catalogAsset.title }}</strong>
                  <span>
                    <span class="status-pill">{{ catalogAsset.status }}</span>
                    {{ catalogAsset.language }} · {{ durationLabel(catalogAsset.duration_ms) }}
                  </span>
                  <small
                    >Updated {{ updatedLabel(catalogAsset.updated_at) }} · v{{
                      catalogAsset.version
                    }}</small
                  >
                  <small v-if="catalogAsset.search?.title" class="asset-search-label">
                    Title match
                  </small>
                  <small v-if="catalogAsset.search?.provider_ids.length" class="asset-search-label">
                    ASR: {{ catalogAsset.search.provider_ids.join(', ') }}
                  </small>
                  <span
                    v-for="hit in catalogAsset.search?.segments ?? []"
                    :key="hit.segment_id"
                    class="asset-search-hit"
                  >
                    <small>
                      {{ timestampLabel(hit.start_ms) }}–{{ timestampLabel(hit.end_ms) }}
                      <template v-if="hit.speaker"> · {{ hit.speaker }}</template>
                    </small>
                    <span>{{ hit.text }}</span>
                  </span>
                </button>
              </li>
            </ul>

            <button
              v-if="catalogStore.nextCursor"
              class="button-secondary catalog-load-more"
              type="button"
              :disabled="catalogStore.isBusy"
              @click="catalogStore.loadMore()"
            >
              {{ catalogStore.loadingMore ? 'Loading…' : 'Load more assets' }}
            </button>
          </template>
        </template>

        <p v-if="catalogStore.error" class="error-message" role="alert">
          {{ catalogStore.error }}
        </p>
        <ul
          v-if="catalogStore.bulkLifecycleFailures.length"
          class="management-list bulk-failure-list"
          aria-label="Bulk operation failures"
        >
          <li v-for="failure in catalogStore.bulkLifecycleFailures" :key="failure.assetId">
            <strong>{{ failure.title }}</strong>
            <span>{{ failure.message }}</span>
          </li>
        </ul>
        <p v-if="catalogStore.notice" class="success-message" role="status" aria-live="polite">
          {{ catalogStore.notice }}
        </p>
        <aside
          v-if="catalogStore.purgeJob"
          class="purge-status"
          aria-labelledby="purge-status-title"
          aria-live="polite"
        >
          <div class="section-heading">
            <div>
              <span class="eyebrow">Permanent deletion</span>
              <h3 id="purge-status-title">Last purge request</h3>
            </div>
            <span class="status-pill">{{ catalogStore.purgeJob.state }}</span>
          </div>
          <p>
            Asset <code>{{ catalogStore.purgeJob.asset_id }}</code> · job
            <code>{{ catalogStore.purgeJob.job_id }}</code>
          </p>
          <button
            class="button-secondary"
            type="button"
            :disabled="catalogStore.isBusy"
            @click="refreshPermanentDeletion"
          >
            {{ catalogStore.refreshingPurge ? 'Checking…' : 'Check purge status' }}
          </button>
          <form
            v-if="catalogStore.purgeJob.state === 'failed' && canPermanentlyDelete"
            class="purge-resume-form"
            @submit.prevent="resumePermanentDeletion"
          >
            <label class="field field--wide">
              <span>Type the asset ID to retry permanent deletion</span>
              <input
                v-model="purgeConfirmation"
                name="purge-resume-confirmation"
                autocomplete="off"
                spellcheck="false"
                :placeholder="catalogStore.purgeJob.asset_id"
                required
              />
            </label>
            <button
              class="button-danger"
              type="submit"
              :disabled="
                catalogStore.isBusy || purgeConfirmation !== catalogStore.purgeJob.asset_id
              "
            >
              {{ catalogStore.purging ? 'Resuming…' : 'Retry permanent deletion' }}
            </button>
          </form>
        </aside>
      </section>

      <section
        v-if="catalogStore.selectedAsset"
        class="workflow-panel"
        aria-labelledby="asset-metadata-title"
      >
        <div class="section-heading">
          <div>
            <span class="eyebrow">Optimistic concurrency</span>
            <h2 id="asset-metadata-title">Asset metadata</h2>
          </div>
          <span class="status-pill">
            {{ catalogStore.selectedAsset.status }} · v{{ catalogStore.selectedAsset.version }}
          </span>
        </div>
        <p>
          Changes require the exact current version. A concurrent edit is rejected instead of
          silently overwriting newer metadata.
        </p>
        <div class="lifecycle-actions">
          <p v-if="catalogStore.selectedAsset.status === 'trashed'">
            This asset is hidden from normal reads. Its immutable audio and transcript revisions
            remain stored.
          </p>
          <button
            :class="
              catalogStore.selectedAsset.status === 'trashed' ? 'button-secondary' : 'button-danger'
            "
            type="button"
            :disabled="!canManageAssets || catalogStore.isBusy"
            @click="changeAssetLifecycle"
          >
            {{
              catalogStore.changingLifecycle
                ? 'Updating…'
                : catalogStore.selectedAsset.status === 'trashed'
                  ? 'Restore asset'
                  : 'Move to trash'
            }}
          </button>
        </div>
        <p v-if="!canManageAssets">
          This session does not include <code>assets:write</code>; lifecycle actions are disabled.
        </p>
        <section
          v-if="catalogStore.selectedAsset.status === 'trashed'"
          class="asset-danger-zone"
          aria-labelledby="permanent-deletion-title"
        >
          <span class="eyebrow">Owner-only danger zone</span>
          <h3 id="permanent-deletion-title">Permanently delete this asset</h3>
          <p>
            This irreversibly removes stored audio, upload parts, transcripts, revisions, and
            asset-scoped metadata. Security audit records are retained.
          </p>
          <p v-if="!canPermanentlyDelete">
            Only a workspace Owner with <code>assets:write</code> can request permanent deletion.
          </p>
          <form v-else class="purge-confirmation-form" @submit.prevent="submitPermanentDeletion">
            <label class="field field--wide">
              <span>Type the asset ID to confirm permanent deletion</span>
              <input
                v-model="purgeConfirmation"
                name="purge-confirmation"
                autocomplete="off"
                spellcheck="false"
                :placeholder="catalogStore.selectedAsset.id"
                required
              />
              <small>{{ catalogStore.selectedAsset.id }}</small>
            </label>
            <button
              class="button-danger"
              type="submit"
              :disabled="catalogStore.isBusy || purgeConfirmation !== catalogStore.selectedAsset.id"
            >
              {{
                catalogStore.purging ? 'Starting permanent deletion…' : 'Permanently delete asset'
              }}
            </button>
          </form>
        </section>
        <form class="form-grid" @submit.prevent="saveMetadata">
          <label class="field field--wide">
            <span>Metadata title</span>
            <input
              v-model="metadataTitle"
              name="metadata-title"
              maxlength="500"
              :disabled="
                !canEditMetadata ||
                catalogStore.isBusy ||
                catalogStore.selectedAsset.status === 'trashed'
              "
              required
            />
          </label>
          <label class="field">
            <span>Metadata language</span>
            <input
              v-model="metadataLanguage"
              name="metadata-language"
              pattern="(?:und|[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)"
              :disabled="
                !canEditMetadata ||
                catalogStore.isBusy ||
                catalogStore.selectedAsset.status === 'trashed'
              "
              required
            />
          </label>
          <label class="field">
            <span>Collection</span>
            <select
              v-model="metadataCollectionId"
              name="metadata-collection"
              :disabled="
                !canEditMetadata ||
                catalogStore.isBusy ||
                catalogStore.selectedAsset.status === 'trashed'
              "
            >
              <option value="">No collection</option>
              <option
                v-for="collection in catalogStore.collections"
                :key="collection.id"
                :value="collection.id"
              >
                {{ collection.name }} ({{ collection.asset_count }})
              </option>
            </select>
          </label>
          <button
            type="submit"
            :disabled="
              !canEditMetadata ||
              catalogStore.isBusy ||
              catalogStore.selectedAsset.status === 'trashed' ||
              !metadataTitle.trim() ||
              !metadataLanguage.trim()
            "
          >
            {{ catalogStore.saving ? 'Saving…' : 'Save metadata' }}
          </button>
        </form>
        <p v-if="!canEditMetadata">
          This session does not include <code>metadata:write</code>; fields are read-only in effect.
        </p>
        <div
          v-if="catalogStore.selectedAsset.status !== 'trashed'"
          class="tag-assignment"
          aria-labelledby="asset-tags-title"
        >
          <div class="section-heading">
            <div>
              <span class="eyebrow">Workspace taxonomy</span>
              <h3 id="asset-tags-title">Assigned tags</h3>
            </div>
            <span class="status-pill">{{ catalogStore.selectedTags.length }} assigned</span>
          </div>
          <p v-if="!catalogStore.tags.length">No workspace tags are available.</p>
          <ul v-else class="tag-assignment-list" aria-label="Workspace tags">
            <li v-for="tag in catalogStore.tags" :key="tag.id">
              <span>
                <strong>{{ tag.name }}</strong>
                <small>{{ tag.asset_count }} active assets</small>
              </span>
              <button
                class="button-secondary button-compact"
                type="button"
                :aria-label="`${assignedTagIds.has(tag.id) ? 'Remove' : 'Assign'} ${tag.name}`"
                :aria-pressed="assignedTagIds.has(tag.id)"
                :disabled="!canEditMetadata || catalogStore.isBusy"
                @click="toggleTag(tag.id)"
              >
                {{ assignedTagIds.has(tag.id) ? 'Remove' : 'Assign' }}
              </button>
            </li>
          </ul>
        </div>

        <div v-if="catalogStore.selectedAsset.status !== 'trashed'" class="asset-detail-grid">
          <article class="detail-panel" aria-labelledby="processing-status-title">
            <div class="section-heading">
              <div>
                <span class="eyebrow">Bounded job history</span>
                <h3 id="processing-status-title">Processing status</h3>
              </div>
              <span v-if="catalogStore.processingStatus" class="status-pill">
                {{ catalogStore.processingStatus.active ? 'active' : 'idle' }}
              </span>
            </div>
            <div
              v-if="catalogStore.audioSource && catalogStore.selectedAsset.status === 'ready'"
              class="asset-media"
            >
              <button
                v-if="catalogStore.waveformSource && !waveformUnavailable"
                class="waveform-seek"
                type="button"
                :aria-label="`Seek ${catalogStore.selectedAsset.title} by waveform`"
                @click="seekCatalogFromWaveform"
                @keydown="handleCatalogWaveformKey"
              >
                <img
                  :class="{ 'waveform-image--loaded': waveformLoaded }"
                  :src="catalogStore.waveformSource"
                  alt=""
                  draggable="false"
                  @load="waveformLoaded = true"
                  @error="waveformUnavailable = true"
                />
                <span v-if="!waveformLoaded" class="waveform-placeholder">Loading waveform…</span>
                <span
                  v-if="waveformLoaded"
                  class="waveform-playhead"
                  aria-hidden="true"
                  :style="{ left: `${catalogPlaybackProgress}%` }"
                ></span>
              </button>
              <p v-else class="waveform-status" role="status">
                Waveform is still processing. Audio playback remains available.
              </p>
            </div>
            <audio
              v-if="catalogStore.audioSource && catalogStore.selectedAsset.status === 'ready'"
              ref="catalogAudio"
              class="asset-player"
              controls
              preload="metadata"
              :src="catalogStore.audioSource"
              @loadedmetadata="catalogAudioReady"
              @timeupdate="updateCatalogPlaybackTime"
              @seeked="updateCatalogPlaybackTime"
            >
              Your browser does not support authenticated audio playback.
            </audio>
            <div
              v-if="catalogStore.audioSource && catalogStore.selectedAsset.status === 'ready'"
              class="playback-tools"
            >
              <span>
                {{ timestampLabel(catalogCurrentTimeMs) }} /
                {{ timestampLabel(catalogStore.selectedAsset.duration_ms ?? 0) }}
              </span>
              <label>
                <span>Playback speed</span>
                <select v-model.number="catalogPlaybackRate" @change="applyCatalogPlaybackRate">
                  <option :value="0.75">0.75×</option>
                  <option :value="1">1×</option>
                  <option :value="1.25">1.25×</option>
                  <option :value="1.5">1.5×</option>
                  <option :value="2">2×</option>
                </select>
              </label>
            </div>
            <template v-if="catalogStore.processingStatus">
              <p>
                Asset {{ catalogStore.processingStatus.asset_status }} · updated
                {{ updatedLabel(catalogStore.processingStatus.updated_at) }}
              </p>
              <ul
                v-if="catalogStore.processingStatus.jobs.length"
                class="management-list compact-list"
                aria-label="Recent processing jobs"
              >
                <li
                  v-for="processingJob in catalogStore.processingStatus.jobs"
                  :key="processingJob.id"
                >
                  <div>
                    <strong>{{ processingJob.kind }}</strong>
                    <small>
                      {{ processingJob.attempts }} / {{ processingJob.max_attempts }} attempts ·
                      {{ updatedLabel(processingJob.updated_at) }}
                    </small>
                  </div>
                  <span class="status-pill">{{ processingJob.state }}</span>
                </li>
              </ul>
              <p v-else>No processing jobs are recorded for this asset.</p>
            </template>
          </article>

          <article class="detail-panel" aria-labelledby="asset-annotations-title">
            <div class="section-heading">
              <div>
                <span class="eyebrow">Bookmarks and notes</span>
                <h3 id="asset-annotations-title">Annotations</h3>
              </div>
              <span class="status-pill">{{ catalogStore.annotations.length }} entries</span>
            </div>
            <ul
              v-if="catalogStore.annotations.length"
              class="management-list compact-list"
              aria-label="Asset annotations"
            >
              <li v-for="annotation in catalogStore.annotations" :key="annotation.id">
                <div>
                  <strong>
                    {{ annotation.kind }} · {{ timestampLabel(annotation.start_ms) }}
                    <template v-if="annotation.end_ms !== null">
                      – {{ timestampLabel(annotation.end_ms) }}
                    </template>
                  </strong>
                  <small>{{ annotation.body || 'Bookmark without a note' }}</small>
                </div>
              </li>
            </ul>
            <p v-else>No bookmarks or notes have been created.</p>

            <form class="form-stack nested-form" @submit.prevent="submitAnnotation">
              <h4>Create an annotation</h4>
              <label class="field">
                <span>Annotation kind</span>
                <select
                  v-model="annotationKind"
                  :disabled="!canEditMetadata || catalogStore.isBusy"
                >
                  <option value="note">Note</option>
                  <option value="bookmark">Bookmark</option>
                </select>
              </label>
              <div class="form-grid">
                <label class="field">
                  <span>Start (milliseconds)</span>
                  <input
                    v-model="annotationStartMs"
                    name="annotation-start"
                    type="number"
                    min="0"
                    step="1"
                    :disabled="!canEditMetadata || catalogStore.isBusy"
                    required
                  />
                </label>
                <label class="field">
                  <span>End (milliseconds, optional)</span>
                  <input
                    v-model="annotationEndMs"
                    name="annotation-end"
                    type="number"
                    :min="Number(annotationStartMs || 0) + 1"
                    step="1"
                    :disabled="!canEditMetadata || catalogStore.isBusy"
                  />
                </label>
              </div>
              <label class="field">
                <span>Annotation body</span>
                <textarea
                  v-model="annotationBody"
                  name="annotation-body"
                  maxlength="4000"
                  rows="3"
                  :required="annotationKind === 'note'"
                  :disabled="!canEditMetadata || catalogStore.isBusy"
                />
              </label>
              <button
                type="submit"
                :disabled="
                  !canEditMetadata ||
                  catalogStore.isBusy ||
                  !annotationStartMs ||
                  (annotationKind === 'note' && !annotationBody.trim())
                "
              >
                {{ catalogStore.creatingAnnotation ? 'Creating…' : 'Create annotation' }}
              </button>
            </form>
          </article>
        </div>
      </section>

      <section
        v-if="assetsStore.stage === 'idle' || assetsStore.stage === 'failed'"
        class="workflow-panel"
        aria-labelledby="upload-title"
      >
        <div class="section-heading">
          <div>
            <span class="eyebrow">Verified ingestion</span>
            <h2 id="upload-title">Upload a WAV recording</h2>
          </div>
          <p>Up to 512 MiB; every part and the whole file are checked with SHA-256.</p>
        </div>

        <form class="form-grid form-grid--asset" @submit.prevent="submitAsset">
          <label class="field field--wide">
            <span>WAV file</span>
            <input
              ref="fileInput"
              name="audio"
              type="file"
              accept=".wav,audio/wav,audio/x-wav"
              required
              @change="selectFile"
            />
          </label>
          <label class="field">
            <span>Asset title</span>
            <input v-model="title" name="title" maxlength="500" required />
          </label>
          <label class="field">
            <span>Language</span>
            <input
              v-model="language"
              name="language"
              pattern="(?:und|[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)"
              aria-describedby="language-help"
              required
            />
            <small id="language-help"
              >Use a tag such as <code>zh-CN</code>, <code>en-US</code>, or <code>und</code>.</small
            >
          </label>
          <button type="submit" :disabled="!consoleStore.isReady || !selectedFile || !title.trim()">
            Upload and transcribe
          </button>
        </form>
        <p v-if="assetsStore.workflowError" class="error-message" role="alert">
          {{ assetsStore.workflowError }}
        </p>
      </section>

      <section
        v-if="assetsStore.isBusy"
        class="workflow-panel"
        aria-labelledby="workflow-status-title"
        aria-live="polite"
      >
        <span class="eyebrow">Processing</span>
        <h2 id="workflow-status-title">{{ assetsStore.stageLabel }}</h2>
        <progress :value="assetsStore.uploadedBytes" :max="assetsStore.totalBytes || 1">
          {{ assetsStore.progressPercent }}%
        </progress>
        <div class="progress-details">
          <span>{{ assetsStore.progressPercent }}% uploaded</span>
          <span>{{ assetsStore.uploadedParts }} / {{ assetsStore.totalParts || '—' }} parts</span>
          <span v-if="assetsStore.job">Job: {{ assetsStore.job.state }}</span>
        </div>
      </section>

      <section
        v-if="assetsStore.stage === 'ready' && assetsStore.revision"
        class="result-stack"
        aria-labelledby="transcript-title"
      >
        <div class="result-heading">
          <div>
            <span class="eyebrow">Immutable result</span>
            <h2 id="transcript-title">{{ assetsStore.asset?.title }}</h2>
            <p>
              <span class="status-pill">{{ assetsStore.revision.kind }}</span>
              {{ assetsStore.revision.language }} ·
              {{ assetsStore.revision.segments.length }} segments
            </p>
          </div>
          <button class="button-secondary" type="button" @click="startAnother">
            Process another
          </button>
        </div>

        <audio
          v-if="assetsStore.audioSource"
          ref="audio"
          class="asset-player"
          controls
          preload="metadata"
          :src="assetsStore.audioSource"
          @timeupdate="updatePlaybackTime"
          @seeked="updatePlaybackTime"
        >
          Your browser does not support authenticated audio playback.
        </audio>

        <TranscriptTimeline
          :segments="assetsStore.revision.segments"
          :current-time-ms="currentTimeMs"
          @seek="seekTo"
        />
        <RouterLink
          class="text-link"
          :to="{ path: '/corrections', query: { revision: assetsStore.revision.id } }"
        >
          Correct and review this revision
        </RouterLink>
      </section>
    </template>
  </div>
</template>
