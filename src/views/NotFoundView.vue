<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <section class="empty-state" aria-labelledby="not-found-title">
    <span class="eyebrow">404</span>
    <h1 id="not-found-title">Page not found</h1>
    <p>The requested console route does not exist.</p>
    <RouterLink class="text-link" to="/">Return to dashboard</RouterLink>
  </section>
</template>
