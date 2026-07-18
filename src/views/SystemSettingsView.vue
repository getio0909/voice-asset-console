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

async function initialize(): Promise<void> {
  const authenticated =
    assetsStore.sessionStatus === 'authenticated' || (await assetsStore.restoreSession())
  if (authenticated && canReadAdmin.value) await operationsStore.loadSettings()
}

onMounted(() => {
  void initialize()
})
</script>

<template>
  <div class="page-stack">
    <header class="page-heading page-heading--with-action">
      <div>
        <span class="eyebrow">Deployment configuration</span>
        <h1>System Settings</h1>
        <p>Inspect a safe runtime projection without exposing operator paths or credentials.</p>
      </div>
      <button
        v-if="canReadAdmin"
        class="button-secondary"
        type="button"
        :disabled="operationsStore.loadingSettings"
        @click="operationsStore.loadSettings()"
      >
        {{ operationsStore.loadingSettings ? 'Refreshing…' : 'Refresh settings' }}
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
      <h2>Sign in to inspect system settings</h2>
      <p>The safe deployment projection requires an authenticated principal.</p>
      <RouterLink class="text-link" to="/assets">Go to secure sign in</RouterLink>
    </section>

    <section v-else-if="!canReadAdmin" class="empty-state">
      <span class="empty-state__mark" aria-hidden="true">403</span>
      <h2>Administrator read access required</h2>
      <p>Your current principal does not have the <code>admin:read</code> scope.</p>
    </section>

    <template v-else>
      <p v-if="operationsStore.settingsError" class="error-message" role="alert">
        {{ operationsStore.settingsError }}
      </p>
      <section v-if="operationsStore.loadingSettings && !operationsStore.settings" role="status">
        Loading deployment settings…
      </section>
      <template v-else-if="operationsStore.settings">
        <section class="workflow-panel" aria-labelledby="settings-boundary-title">
          <span class="eyebrow">Operator-managed environment</span>
          <h2 id="settings-boundary-title">Read only</h2>
          <p>
            Workspace roles cannot mutate deployment settings. An operator changes validated host or
            process environment and restarts the affected service; this page never reads the
            deployment-global settings table.
          </p>
        </section>

        <section aria-labelledby="settings-runtime-title">
          <div class="section-heading">
            <div>
              <span class="eyebrow">Allowlisted runtime view</span>
              <h2 id="settings-runtime-title">Active configuration</h2>
            </div>
            <span class="status-pill">{{ operationsStore.settings.scope }}</span>
          </div>
          <dl class="status-grid">
            <div class="status-card">
              <dt>Brand name</dt>
              <dd>{{ operationsStore.settings.brand_name }}</dd>
              <dd class="status-card__detail">Configured by the deployment operator.</dd>
            </div>
            <div class="status-card">
              <dt>Public origin</dt>
              <dd>
                <code>{{ operationsStore.settings.public_origin }}</code>
              </dd>
              <dd class="status-card__detail">Canonical browser and session origin.</dd>
            </div>
            <div class="status-card">
              <dt>Storage backend</dt>
              <dd>{{ operationsStore.settings.storage_backend }}</dd>
              <dd class="status-card__detail">
                No path, endpoint, bucket, or credential is exposed.
              </dd>
            </div>
            <div class="status-card">
              <dt>Secure session cookies</dt>
              <dd>{{ operationsStore.settings.cookie_secure ? 'Enabled' : 'Disabled' }}</dd>
              <dd class="status-card__detail">HTTPS deployments require this setting.</dd>
            </div>
            <div class="status-card">
              <dt>Provider credential encryption</dt>
              <dd>
                {{
                  operationsStore.settings.provider_credential_encryption_configured
                    ? 'Configured'
                    : 'Not configured'
                }}
              </dd>
              <dd class="status-card__detail">Only configuration presence is reported.</dd>
            </div>
          </dl>
        </section>
      </template>
    </template>
  </div>
</template>
