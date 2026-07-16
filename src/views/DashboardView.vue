<script setup lang="ts">
import InitializationNotice from '@/components/InitializationNotice.vue'
import { apiConfig } from '@/config/api'
import { useConsoleStore } from '@/stores/console'

const consoleStore = useConsoleStore()
</script>

<template>
  <div class="page-stack">
    <header class="page-heading">
      <span class="eyebrow">Overview</span>
      <h1>Dashboard</h1>
      <p>Administration workspace for self-hosted VoiceAsset deployments.</p>
    </header>

    <InitializationNotice :contract-version="consoleStore.contractVersion" />

    <section aria-labelledby="status-title">
      <div class="section-heading">
        <div>
          <span class="eyebrow">Foundation status</span>
          <h2 id="status-title">No synthetic metrics</h2>
        </div>
        <p>Operational data will appear only after a real Server API is connected.</p>
      </div>

      <dl class="status-grid">
        <div class="status-card">
          <dt>API connection</dt>
          <dd>{{ consoleStore.apiStatus }}</dd>
          <p v-if="consoleStore.serverVersion">Server {{ consoleStore.serverVersion }}</p>
          <p v-else-if="consoleStore.compatibilityIssue">{{ consoleStore.compatibilityIssue }}</p>
          <p v-else>Checking the public Server capability contract.</p>
        </div>
        <div class="status-card">
          <dt>API base path</dt>
          <dd>
            <code>{{ apiConfig.baseUrl }}</code>
          </dd>
          <p>Public runtime configuration; never a secret.</p>
        </div>
        <div class="status-card">
          <dt>Feature availability</dt>
          <dd>Initialization shell</dd>
          <p>Asset counts, jobs, storage, ASR, and LLM metrics are not implemented.</p>
        </div>
      </dl>
    </section>
  </div>
</template>
