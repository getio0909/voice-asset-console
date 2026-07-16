<script setup lang="ts">
defineProps<{
  contractVersion: string
}>()
</script>

<template>
  <aside class="initialization-notice" aria-labelledby="initialization-title">
    <span class="eyebrow">Phase 0</span>
    <div>
      <h2 id="initialization-title">Project initialization in progress</h2>
      <p>
        This shell verifies routing, state, tests, and the build pipeline. Server-backed management
        features are not implemented yet.
      </p>
      <p class="contract-version">
        API contract: <code>{{ contractVersion }}</code>
      </p>
    </div>
  </aside>
</template>
