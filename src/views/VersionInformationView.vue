<script setup lang="ts">
import { computed } from 'vue'

import { API_VERSION, CONTRACT_VERSION, REQUIRED_SERVER_FEATURES } from '@/config/contract'
import { useConsoleStore } from '@/stores/console'

const consoleStore = useConsoleStore()
const requiredFeatures = new Set<string>(REQUIRED_SERVER_FEATURES)
const featureRows = computed(() =>
  (consoleStore.capabilities?.features ?? []).map((feature) => ({
    feature,
    required: requiredFeatures.has(feature),
  })),
)
const missingFeatures = computed(() =>
  REQUIRED_SERVER_FEATURES.filter(
    (feature) => !consoleStore.capabilities?.features.includes(feature),
  ),
)
const compatibilityLabel = computed(() => {
  if (consoleStore.isReady) return 'Compatible'
  if (consoleStore.capabilities) return 'Action required'
  return 'Unavailable'
})
</script>

<template>
  <div class="page-stack">
    <header class="page-heading page-heading--with-action">
      <div>
        <span class="eyebrow">Build and contract</span>
        <h1>Version Information</h1>
        <p>
          Inspect the public Server version, REST contract, and advertised capabilities used by this
          Console.
        </p>
      </div>
      <button
        class="button-secondary"
        type="button"
        :disabled="consoleStore.apiStatus === 'checking'"
        @click="consoleStore.checkApi()"
      >
        {{ consoleStore.apiStatus === 'checking' ? 'Refreshing…' : 'Refresh version' }}
      </button>
    </header>

    <aside v-if="consoleStore.compatibilityIssue" class="connection-warning" role="alert">
      <strong>Server compatibility: {{ compatibilityLabel }}</strong>
      <span>{{ consoleStore.compatibilityIssue }}</span>
    </aside>

    <section
      v-if="consoleStore.apiStatus === 'checking' && !consoleStore.capabilities"
      class="workflow-panel"
      role="status"
    >
      <span class="eyebrow">Capability negotiation</span>
      <h2>Reading the public version document</h2>
      <p>No login, token, or provider credential is sent for this request.</p>
    </section>

    <template v-else-if="consoleStore.capabilities">
      <section aria-labelledby="observed-version-title">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Observed Server</span>
            <h2 id="observed-version-title">Published identity</h2>
          </div>
          <span class="status-pill">{{ compatibilityLabel }}</span>
        </div>
        <dl class="status-grid">
          <div class="status-card">
            <dt>Server version</dt>
            <dd>
              <code>{{ consoleStore.capabilities.server_version }}</code>
            </dd>
            <dd class="status-card__detail">Application build reported by the Server.</dd>
          </div>
          <div class="status-card">
            <dt>REST API</dt>
            <dd>
              <code>{{ consoleStore.capabilities.api_version }}</code>
            </dd>
            <dd class="status-card__detail">Expected by this Console: {{ API_VERSION }}.</dd>
          </div>
          <div class="status-card">
            <dt>OpenAPI contract</dt>
            <dd>
              <code>{{ consoleStore.capabilities.contract_version }}</code>
            </dd>
            <dd class="status-card__detail">Expected by this Console: {{ CONTRACT_VERSION }}.</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="advertised-features-title">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Capability negotiation</span>
            <h2 id="advertised-features-title">Advertised features</h2>
            <p>
              {{ featureRows.length }} sorted feature flags; {{ REQUIRED_SERVER_FEATURES.length }}
              are required by this Console.
            </p>
          </div>
        </div>
        <p v-if="missingFeatures.length" class="error-message" role="alert">
          Missing required features: {{ missingFeatures.join(', ') }}
        </p>
        <ul class="version-feature-list" aria-label="Advertised Server features">
          <li v-for="row in featureRows" :key="row.feature">
            <code>{{ row.feature }}</code>
            <span>{{ row.required ? 'Required by this Console' : 'Additional capability' }}</span>
          </li>
        </ul>
      </section>

      <section class="workflow-panel" aria-labelledby="version-boundary-title">
        <span class="eyebrow">Safety boundary</span>
        <h2 id="version-boundary-title">Version data is diagnostic only</h2>
        <p>
          This page cannot change Server settings. Runtime and storage usage remain in System
          Status, and credentials are never part of the capability document.
        </p>
      </section>
    </template>

    <section v-else class="empty-state">
      <span class="empty-state__mark" aria-hidden="true">—</span>
      <h2>No version document available</h2>
      <p>Check the configured Server URL and retry the public capability request.</p>
    </section>
  </div>
</template>
