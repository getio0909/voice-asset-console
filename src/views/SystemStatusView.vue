<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'

import { useAssetsStore } from '@/stores/assets'
import { useConsoleStore } from '@/stores/console'
import { useOperationsStore } from '@/stores/operations'

const assetsStore = useAssetsStore()
const consoleStore = useConsoleStore()
const operationsStore = useOperationsStore()
const canReadAdmin = computed(() => assetsStore.user?.scopes.includes('admin:read') ?? false)

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value))
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value)
}

function formatBytes(value: number): string {
  if (value < 1_024) return `${value} B`
  const units = ['KiB', 'MiB', 'GiB', 'TiB']
  let amount = value / 1_024
  let unit = units[0]!
  for (let index = 1; index < units.length && amount >= 1_024; index += 1) {
    amount /= 1_024
    unit = units[index]!
  }
  return `${amount.toFixed(amount >= 10 ? 1 : 2)} ${unit}`
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1_000)
  const hours = Math.floor(seconds / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  if (hours) return `${hours}h ${minutes}m`
  if (minutes) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

async function initialize(): Promise<void> {
  const authenticated =
    assetsStore.sessionStatus === 'authenticated' || (await assetsStore.restoreSession())
  if (authenticated && canReadAdmin.value) await operationsStore.loadStatus()
}

onMounted(() => {
  void initialize()
})
</script>

<template>
  <div class="page-stack">
    <header class="page-heading page-heading--with-action">
      <div>
        <span class="eyebrow">Workspace health</span>
        <h1>System Status</h1>
        <p>Read a generated, workspace-scoped snapshot of assets, storage, jobs, and providers.</p>
      </div>
      <button
        v-if="canReadAdmin"
        class="button-secondary"
        type="button"
        :disabled="operationsStore.loadingStatus"
        @click="operationsStore.loadStatus()"
      >
        {{ operationsStore.loadingStatus ? 'Refreshing…' : 'Refresh snapshot' }}
      </button>
    </header>

    <aside v-if="!consoleStore.isReady" class="connection-warning" role="status">
      <strong>Server compatibility: {{ consoleStore.apiStatus }}</strong>
      <span>{{ consoleStore.compatibilityIssue ?? 'Waiting for the capability check.' }}</span>
    </aside>

    <section v-if="assetsStore.sessionStatus === 'checking'" class="workflow-panel" role="status">
      <span class="eyebrow">Session</span>
      <h2>Checking administrator access</h2>
      <p>The Console uses the Server-managed HttpOnly session.</p>
    </section>

    <section v-else-if="!assetsStore.isAuthenticated" class="empty-state">
      <span class="empty-state__mark" aria-hidden="true">401</span>
      <h2>Sign in to inspect system status</h2>
      <p>
        The operational snapshot requires an authenticated principal with <code>admin:read</code>.
      </p>
      <RouterLink class="text-link" to="/assets">Go to secure sign in</RouterLink>
    </section>

    <section v-else-if="!canReadAdmin" class="empty-state">
      <span class="empty-state__mark" aria-hidden="true">403</span>
      <h2>Administrator read access required</h2>
      <p>Your current principal does not have the <code>admin:read</code> scope.</p>
    </section>

    <template v-else>
      <p v-if="operationsStore.statusError" class="error-message" role="alert">
        {{ operationsStore.statusError }}
      </p>
      <section v-if="operationsStore.loadingStatus && !operationsStore.status" role="status">
        Loading workspace status…
      </section>
      <template v-else-if="operationsStore.status">
        <p class="snapshot-time">
          Snapshot generated {{ formatDate(operationsStore.status.generated_at) }}
        </p>
        <section aria-labelledby="status-assets-title">
          <div class="section-heading">
            <div>
              <span class="eyebrow">Content</span>
              <h2 id="status-assets-title">Assets and transcripts</h2>
            </div>
          </div>
          <dl class="status-grid">
            <div class="status-card">
              <dt>Total assets</dt>
              <dd>{{ formatNumber(operationsStore.status.assets.total) }}</dd>
              <dd class="status-card__detail">
                {{ formatNumber(operationsStore.status.assets.active) }} active ·
                {{ formatNumber(operationsStore.status.assets.trashed) }} trashed
              </dd>
            </div>
            <div class="status-card">
              <dt>Audio duration</dt>
              <dd>{{ formatDuration(operationsStore.status.assets.audio_duration_ms) }}</dd>
              <dd class="status-card__detail">
                {{ formatNumber(operationsStore.status.assets.failed) }} failed ·
                {{ formatNumber(operationsStore.status.assets.purging) }} purging
              </dd>
            </div>
            <div class="status-card">
              <dt>Transcripts</dt>
              <dd>{{ formatNumber(operationsStore.status.transcripts.transcript_count) }}</dd>
              <dd class="status-card__detail">
                {{ formatNumber(operationsStore.status.transcripts.revision_count) }} immutable
                revisions
              </dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="status-runtime-title">
          <div class="section-heading">
            <div>
              <span class="eyebrow">Runtime</span>
              <h2 id="status-runtime-title">Jobs and providers</h2>
            </div>
          </div>
          <dl class="status-grid">
            <div class="status-card">
              <dt>Background jobs</dt>
              <dd>{{ formatNumber(operationsStore.status.jobs.total) }}</dd>
              <dd class="status-card__detail">
                {{ formatNumber(operationsStore.status.jobs.queued) }} queued ·
                {{ formatNumber(operationsStore.status.jobs.running) }} running ·
                {{ formatNumber(operationsStore.status.jobs.retry_wait) }} retrying
              </dd>
            </div>
            <div class="status-card">
              <dt>Enabled providers</dt>
              <dd>
                {{
                  formatNumber(
                    operationsStore.status.providers.enabled_asr +
                      operationsStore.status.providers.enabled_llm,
                  )
                }}
              </dd>
              <dd class="status-card__detail">
                {{ formatNumber(operationsStore.status.providers.enabled_asr) }} ASR ·
                {{ formatNumber(operationsStore.status.providers.enabled_llm) }} LLM
              </dd>
            </div>
            <div class="status-card">
              <dt>Active users</dt>
              <dd>{{ formatNumber(operationsStore.status.active_users) }}</dd>
              <dd class="status-card__detail">Enabled workspace members only.</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="status-storage-title">
          <div class="section-heading">
            <div>
              <span class="eyebrow">Storage</span>
              <h2 id="status-storage-title">Managed objects</h2>
            </div>
          </div>
          <dl class="status-grid">
            <div class="status-card">
              <dt>Stored objects</dt>
              <dd>{{ formatNumber(operationsStore.status.storage.object_count) }}</dd>
              <dd class="status-card__detail">Workspace-scoped database inventory.</dd>
            </div>
            <div class="status-card">
              <dt>Recorded bytes</dt>
              <dd>{{ formatBytes(operationsStore.status.storage.bytes) }}</dd>
              <dd class="status-card__detail">Logical object size recorded by the Server.</dd>
            </div>
            <div class="status-card">
              <dt>Terminal jobs</dt>
              <dd>
                {{
                  formatNumber(
                    operationsStore.status.jobs.succeeded +
                      operationsStore.status.jobs.failed +
                      operationsStore.status.jobs.cancelled,
                  )
                }}
              </dd>
              <dd class="status-card__detail">
                {{ formatNumber(operationsStore.status.jobs.failed) }} failed ·
                {{ formatNumber(operationsStore.status.jobs.cancelled) }} cancelled
              </dd>
            </div>
          </dl>
        </section>
      </template>
    </template>
  </div>
</template>
