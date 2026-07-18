<script setup lang="ts">
defineProps<{
  contractVersion: string
}>()
</script>

<template>
  <aside class="phase-notice" aria-labelledby="phase-status-title">
    <span class="eyebrow">Phase 3</span>
    <div>
      <h2 id="phase-status-title">Reviewable correction workflow</h2>
      <p>
        Assets publishes immutable raw and normalized transcripts. Corrections adds separate
        glossaries, Mock LLM profiles, structured diffs, append-only decisions, and approved
        revisions. Broader lifecycle administration remains planned.
      </p>
      <p class="contract-version">
        API contract: <code>{{ contractVersion }}</code>
      </p>
    </div>
  </aside>
</template>
