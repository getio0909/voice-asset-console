<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterLink, RouterView } from 'vue-router'

import { brand } from '@/config/brand'
import { useConsoleStore } from '@/stores/console'

const consoleStore = useConsoleStore()

onMounted(() => {
  void consoleStore.checkApi()
})
</script>

<template>
  <a class="skip-link" href="#main-content">Skip to main content</a>
  <div class="app-shell">
    <header class="app-header">
      <RouterLink class="brand" to="/" aria-label="VoiceAsset Console home">
        <span class="brand__mark" aria-hidden="true">{{ brand.shortName }}</span>
        <span>
          <strong>{{ brand.name }}</strong>
          <small>Console</small>
        </span>
      </RouterLink>
      <span class="phase-badge">{{ consoleStore.phaseLabel }}</span>
    </header>

    <nav class="primary-nav" aria-label="Primary navigation">
      <RouterLink to="/">Dashboard</RouterLink>
      <RouterLink to="/assets">Assets</RouterLink>
      <RouterLink to="/providers">Providers</RouterLink>
      <RouterLink to="/llm-providers">LLM providers</RouterLink>
      <RouterLink to="/corrections">Corrections</RouterLink>
      <RouterLink to="/jobs">Job Center</RouterLink>
      <RouterLink to="/audit-log">Audit Log</RouterLink>
      <RouterLink to="/members">Members</RouterLink>
      <RouterLink to="/workspace">Workspace</RouterLink>
      <RouterLink to="/system-settings">System Settings</RouterLink>
      <RouterLink to="/system-status">System Status</RouterLink>
      <RouterLink to="/version">Version</RouterLink>
      <RouterLink to="/api-keys">API keys</RouterLink>
      <RouterLink to="/webhooks">Webhooks</RouterLink>
      <RouterLink to="/sessions">Sessions</RouterLink>
      <RouterLink to="/account">Account</RouterLink>
    </nav>

    <main id="main-content" tabindex="-1">
      <RouterView />
    </main>

    <footer class="app-footer">
      <span>{{ brand.productName }}</span>
      <span>AGPL-3.0-or-later</span>
    </footer>
  </div>
</template>
