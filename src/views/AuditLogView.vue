<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import type { OperationsAuditActorType } from '@/api/client'
import { useAssetsStore } from '@/stores/assets'
import { useConsoleStore } from '@/stores/console'
import { useOperationsStore } from '@/stores/operations'

const assetsStore = useAssetsStore()
const consoleStore = useConsoleStore()
const operationsStore = useOperationsStore()
const actorFilter = ref<OperationsAuditActorType | ''>(operationsStore.auditActorFilter)
const actionFilter = ref(operationsStore.auditActionFilter)
const targetFilter = ref(operationsStore.auditTargetFilter)
const canReadAdmin = computed(() => assetsStore.user?.scopes.includes('admin:read') ?? false)

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value))
}

function formatMetadata(metadata: Record<string, unknown>): string {
  return JSON.stringify(metadata, null, 2)
}

async function initialize(): Promise<void> {
  const authenticated =
    assetsStore.sessionStatus === 'authenticated' || (await assetsStore.restoreSession())
  if (authenticated && canReadAdmin.value) await operationsStore.loadAuditLogs()
}

async function applyFilters(): Promise<void> {
  if (
    operationsStore.setAuditFilters({
      ...(actorFilter.value ? { actorType: actorFilter.value } : {}),
      ...(actionFilter.value ? { action: actionFilter.value } : {}),
      ...(targetFilter.value ? { targetType: targetFilter.value } : {}),
    })
  ) {
    await operationsStore.loadAuditLogs()
  }
}

onMounted(() => {
  void initialize()
})
</script>

<template>
  <div class="page-stack">
    <header class="page-heading">
      <span class="eyebrow">Governance</span>
      <h1>Audit Log</h1>
      <p>
        Review immutable workspace activity with controlled metadata, request correlation, and
        stable cursor pagination.
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
      <h2>Sign in to review audit events</h2>
      <p>Audit inventory requires an authenticated principal with <code>admin:read</code>.</p>
      <RouterLink class="text-link" to="/assets">Go to secure sign in</RouterLink>
    </section>

    <section v-else-if="!canReadAdmin" class="empty-state">
      <span class="empty-state__mark" aria-hidden="true">403</span>
      <h2>Administrator read access required</h2>
      <p>Your current principal does not have the <code>admin:read</code> scope.</p>
    </section>

    <template v-else>
      <section class="workflow-panel" aria-labelledby="audit-filters-title">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Bounded query</span>
            <h2 id="audit-filters-title">Filter audit inventory</h2>
          </div>
          <span class="status-pill">{{ operationsStore.auditEntries.length }} loaded</span>
        </div>
        <form class="operations-filter-form" @submit.prevent="applyFilters">
          <label class="field">
            <span>Actor type</span>
            <select v-model="actorFilter" :disabled="operationsStore.auditBusy">
              <option value="">All actors</option>
              <option value="user">User</option>
              <option value="agent">Agent</option>
              <option value="system">System</option>
            </select>
          </label>
          <label class="field">
            <span>Action</span>
            <input
              v-model="actionFilter"
              name="audit-action"
              maxlength="100"
              pattern="[a-z][a-z0-9_.]{0,99}"
              placeholder="asset.read"
              :disabled="operationsStore.auditBusy"
            />
          </label>
          <label class="field">
            <span>Target type</span>
            <input
              v-model="targetFilter"
              name="audit-target-type"
              maxlength="100"
              pattern="[a-z][a-z0-9_.]{0,99}"
              placeholder="asset"
              :disabled="operationsStore.auditBusy"
            />
          </label>
          <div class="button-row">
            <button type="submit" :disabled="operationsStore.auditBusy">Apply filters</button>
            <button
              class="button-secondary"
              type="button"
              :disabled="operationsStore.auditBusy"
              @click="operationsStore.loadAuditLogs()"
            >
              Refresh
            </button>
          </div>
        </form>
      </section>

      <p v-if="operationsStore.auditError" class="error-message" role="alert">
        {{ operationsStore.auditError }}
      </p>

      <section class="workflow-panel" aria-labelledby="audit-inventory-title">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Newest activity first</span>
            <h2 id="audit-inventory-title">Workspace audit events</h2>
          </div>
          <p>Each read is itself recorded by the Server before a response is returned.</p>
        </div>
        <p v-if="operationsStore.loadingAudit" role="status">Loading workspace audit events…</p>
        <p v-else-if="operationsStore.auditEntries.length === 0">
          No audit events matched the current filters.
        </p>
        <ol v-else class="operations-list">
          <li v-for="entry in operationsStore.auditEntries" :key="entry.id">
            <div class="operations-list__heading">
              <div>
                <strong>{{ entry.action }}</strong>
                <small>
                  {{ entry.actor_email ?? entry.actor_type }} · {{ formatDate(entry.occurred_at) }}
                </small>
              </div>
              <span class="status-pill">{{ entry.actor_type }}</span>
            </div>
            <dl class="operations-metadata">
              <div>
                <dt>Target</dt>
                <dd>
                  {{ entry.target_type }}
                  <code v-if="entry.target_id">{{ entry.target_id }}</code>
                </dd>
              </div>
              <div v-if="entry.actor_id">
                <dt>Actor ID</dt>
                <dd>
                  <code>{{ entry.actor_id }}</code>
                </dd>
              </div>
              <div v-if="entry.request_id">
                <dt>Request ID</dt>
                <dd>
                  <code>{{ entry.request_id }}</code>
                </dd>
              </div>
              <div>
                <dt>Event ID</dt>
                <dd>
                  <code>{{ entry.id }}</code>
                </dd>
              </div>
            </dl>
            <details class="audit-metadata">
              <summary>Controlled metadata</summary>
              <pre>{{ formatMetadata(entry.metadata) }}</pre>
            </details>
          </li>
        </ol>
        <button
          v-if="operationsStore.auditNextCursor"
          class="button-secondary operations-load-more"
          type="button"
          :disabled="operationsStore.auditBusy"
          @click="operationsStore.loadMoreAuditLogs()"
        >
          {{ operationsStore.loadingMoreAudit ? 'Loading…' : 'Load more audit events' }}
        </button>
      </section>
    </template>
  </div>
</template>
