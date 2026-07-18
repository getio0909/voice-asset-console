<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import type { OperationsJobState } from '@/api/client'
import { useAssetsStore } from '@/stores/assets'
import { useConsoleStore } from '@/stores/console'
import { useOperationsStore } from '@/stores/operations'

const assetsStore = useAssetsStore()
const consoleStore = useConsoleStore()
const operationsStore = useOperationsStore()
const stateFilter = ref<OperationsJobState | ''>(operationsStore.jobStateFilter)
const kindFilter = ref(operationsStore.jobKindFilter)
const canReadAdmin = computed(() => assetsStore.user?.scopes.includes('admin:read') ?? false)

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

async function initialize(): Promise<void> {
  const authenticated =
    assetsStore.sessionStatus === 'authenticated' || (await assetsStore.restoreSession())
  if (authenticated && canReadAdmin.value) await operationsStore.loadJobs()
}

async function applyFilters(): Promise<void> {
  if (
    operationsStore.setJobFilters({
      ...(stateFilter.value ? { state: stateFilter.value } : {}),
      ...(kindFilter.value ? { kind: kindFilter.value } : {}),
    })
  ) {
    await operationsStore.loadJobs()
  }
}

onMounted(() => {
  void initialize()
})
</script>

<template>
  <div class="page-stack">
    <header class="page-heading">
      <span class="eyebrow">Operations</span>
      <h1>Job Center</h1>
      <p>
        Inspect bounded, workspace-scoped background work without exposing job payloads or worker
        lease identities.
      </p>
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
      <h2>Sign in to inspect jobs</h2>
      <p>
        Job inventory requires an authenticated principal with the <code>admin:read</code> scope.
      </p>
      <RouterLink class="text-link" to="/assets">Go to secure sign in</RouterLink>
    </section>

    <section v-else-if="!canReadAdmin" class="empty-state">
      <span class="empty-state__mark" aria-hidden="true">403</span>
      <h2>Administrator read access required</h2>
      <p>Your current principal does not have the <code>admin:read</code> scope.</p>
    </section>

    <template v-else>
      <section class="workflow-panel" aria-labelledby="job-filters-title">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Bounded query</span>
            <h2 id="job-filters-title">Filter job inventory</h2>
          </div>
          <span class="status-pill">{{ operationsStore.jobs.length }} loaded</span>
        </div>
        <form class="operations-filter-form" @submit.prevent="applyFilters">
          <label class="field">
            <span>State</span>
            <select v-model="stateFilter" :disabled="operationsStore.jobsBusy">
              <option value="">All states</option>
              <option value="queued">Queued</option>
              <option value="running">Running</option>
              <option value="retry_wait">Retry wait</option>
              <option value="succeeded">Succeeded</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label class="field">
            <span>Kind</span>
            <input
              v-model="kindFilter"
              name="job-kind"
              maxlength="100"
              pattern="[a-z][a-z0-9_.]{0,99}"
              placeholder="llm_correct"
              :disabled="operationsStore.jobsBusy"
            />
          </label>
          <div class="button-row">
            <button type="submit" :disabled="operationsStore.jobsBusy">Apply filters</button>
            <button
              class="button-secondary"
              type="button"
              :disabled="operationsStore.jobsBusy"
              @click="operationsStore.loadJobs()"
            >
              Refresh
            </button>
          </div>
        </form>
      </section>

      <p v-if="operationsStore.jobsError" class="error-message" role="alert">
        {{ operationsStore.jobsError }}
      </p>

      <section class="workflow-panel" aria-labelledby="job-inventory-title">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Newest activity first</span>
            <h2 id="job-inventory-title">Workspace jobs</h2>
          </div>
          <p>Pagination remains bound to the selected state and kind filters.</p>
        </div>
        <p v-if="operationsStore.loadingJobs" role="status">Loading workspace jobs…</p>
        <p v-else-if="operationsStore.jobs.length === 0">No jobs matched the current filters.</p>
        <ul v-else class="operations-list">
          <li v-for="job in operationsStore.jobs" :key="job.id">
            <div class="operations-list__heading">
              <div>
                <strong>{{ job.kind }}</strong>
                <code>{{ job.id }}</code>
              </div>
              <span class="status-pill">{{ job.state }}</span>
            </div>
            <dl class="operations-metadata">
              <div>
                <dt>Attempts</dt>
                <dd>{{ job.attempts }} / {{ job.max_attempts }}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{{ formatDate(job.updated_at) }}</dd>
              </div>
              <div>
                <dt>Available</dt>
                <dd>{{ formatDate(job.available_at) }}</dd>
              </div>
              <div>
                <dt>Created by</dt>
                <dd>
                  <code>{{ job.created_by }}</code>
                </dd>
              </div>
              <div v-if="job.asset_id">
                <dt>Asset</dt>
                <dd>
                  <code>{{ job.asset_id }}</code>
                </dd>
              </div>
              <div v-if="job.last_error_code">
                <dt>Last error</dt>
                <dd>{{ job.last_error_code }}</dd>
              </div>
            </dl>
          </li>
        </ul>
        <button
          v-if="operationsStore.jobNextCursor"
          class="button-secondary operations-load-more"
          type="button"
          :disabled="operationsStore.jobsBusy"
          @click="operationsStore.loadMoreJobs()"
        >
          {{ operationsStore.loadingMoreJobs ? 'Loading…' : 'Load more jobs' }}
        </button>
      </section>
    </template>
  </div>
</template>
