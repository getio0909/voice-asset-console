<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'

import PhaseStatusNotice from '@/components/PhaseStatusNotice.vue'
import { apiConfig } from '@/config/api'
import { useAssetsStore } from '@/stores/assets'
import { useConsoleStore } from '@/stores/console'
import { useOperationsStore } from '@/stores/operations'

const assetsStore = useAssetsStore()
const consoleStore = useConsoleStore()
const operationsStore = useOperationsStore()
const canReadAdmin = computed(() => assetsStore.user?.scopes.includes('admin:read') ?? false)

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

onMounted(async () => {
  const authenticated =
    assetsStore.sessionStatus === 'authenticated' || (await assetsStore.restoreSession())
  if (authenticated && canReadAdmin.value) await operationsStore.loadStatus()
})
</script>

<template>
  <div class="page-stack">
    <header class="page-heading">
      <span class="eyebrow">Overview</span>
      <h1>Dashboard</h1>
      <p>Administration workspace for self-hosted VoiceAsset deployments.</p>
    </header>

    <PhaseStatusNotice :contract-version="consoleStore.contractVersion" />

    <section aria-labelledby="status-title">
      <div class="section-heading">
        <div>
          <span class="eyebrow">Connection status</span>
          <h2 id="status-title">Live contract, honest scope</h2>
        </div>
        <p>Operational data will appear only after a real Server API is connected.</p>
      </div>

      <dl class="status-grid">
        <div class="status-card">
          <dt>API connection</dt>
          <dd>{{ consoleStore.apiStatus }}</dd>
          <dd v-if="consoleStore.serverVersion" class="status-card__detail">
            Server {{ consoleStore.serverVersion }}
          </dd>
          <dd v-else-if="consoleStore.compatibilityIssue" class="status-card__detail">
            {{ consoleStore.compatibilityIssue }}
          </dd>
          <dd v-else class="status-card__detail">
            Checking the public Server capability contract.
          </dd>
        </div>
        <div class="status-card">
          <dt>API base path</dt>
          <dd>
            <code>{{ apiConfig.baseUrl }}</code>
          </dd>
          <dd class="status-card__detail">Public runtime configuration; never a secret.</dd>
        </div>
        <div class="status-card">
          <dt>Feature availability</dt>
          <dd>Phase 3 local workflow</dd>
          <dd class="status-card__detail">
            Use Assets for Mock ASR, then Corrections for glossary-backed review and approval.
          </dd>
        </div>
      </dl>
    </section>

    <section v-if="canReadAdmin" aria-labelledby="workspace-summary-title">
      <div class="section-heading">
        <div>
          <span class="eyebrow">Workspace snapshot</span>
          <h2 id="workspace-summary-title">Live operational summary</h2>
        </div>
        <RouterLink class="text-link" to="/system-status">Open full system status</RouterLink>
      </div>
      <p v-if="operationsStore.statusError" class="error-message" role="alert">
        {{ operationsStore.statusError }}
      </p>
      <p v-if="operationsStore.loadingStatus && !operationsStore.status" role="status">
        Loading workspace status…
      </p>
      <dl v-else-if="operationsStore.status" class="status-grid">
        <div class="status-card">
          <dt>Assets</dt>
          <dd>{{ formatNumber(operationsStore.status.assets.total) }}</dd>
          <dd class="status-card__detail">
            {{ formatNumber(operationsStore.status.assets.active) }} active assets.
          </dd>
        </div>
        <div class="status-card">
          <dt>Jobs</dt>
          <dd>{{ formatNumber(operationsStore.status.jobs.total) }}</dd>
          <dd class="status-card__detail">
            {{ formatNumber(operationsStore.status.jobs.queued) }} queued ·
            {{ formatNumber(operationsStore.status.jobs.running) }} running
          </dd>
        </div>
        <div class="status-card">
          <dt>Storage</dt>
          <dd>{{ formatBytes(operationsStore.status.storage.bytes) }}</dd>
          <dd class="status-card__detail">
            {{ formatNumber(operationsStore.status.storage.object_count) }} managed objects.
          </dd>
        </div>
      </dl>
    </section>
  </div>
</template>
