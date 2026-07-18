<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import { useAssetsStore } from '@/stores/assets'
import { useConsoleStore } from '@/stores/console'
import { useWorkspaceStore } from '@/stores/workspace'

const assetsStore = useAssetsStore()
const consoleStore = useConsoleStore()
const workspaceStore = useWorkspaceStore()

const name = ref('')
const feedback = ref('')
const canRead = computed(() => assetsStore.user?.scopes.includes('admin:read') ?? false)
const canManage = computed(
  () =>
    assetsStore.user?.role === 'owner' &&
    (assetsStore.user?.scopes.includes('admin:write') ?? false),
)

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

async function loadWorkspace(): Promise<void> {
  feedback.value = ''
  if (await workspaceStore.load()) name.value = workspaceStore.profile?.name ?? ''
}

async function initialize(): Promise<void> {
  const authenticated =
    assetsStore.sessionStatus === 'authenticated' || (await assetsStore.restoreSession())
  if (authenticated && canRead.value) await loadWorkspace()
}

async function saveWorkspace(): Promise<void> {
  feedback.value = ''
  if (await workspaceStore.update({ name: name.value })) {
    name.value = workspaceStore.profile?.name ?? ''
    feedback.value = `Saved ${name.value}. Workspace version is now ${workspaceStore.profile?.version}.`
  }
}

async function logout(): Promise<void> {
  workspaceStore.reset()
  await assetsStore.logout()
}

onMounted(() => {
  void initialize()
})
</script>

<template>
  <div class="page-stack">
    <header class="page-heading">
      <span class="eyebrow">Workspace administration</span>
      <h1>Workspace</h1>
      <p>
        Review the authenticated workspace identity. Owners can rename it with version-protected,
        audited updates.
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
      <h2>Sign in to review the workspace</h2>
      <p>The workspace profile requires an authenticated principal with <code>admin:read</code>.</p>
      <RouterLink class="text-link" to="/assets">Go to secure sign in</RouterLink>
    </section>

    <template v-else>
      <section class="session-bar" aria-label="Current session">
        <div>
          <span class="eyebrow">Signed in</span>
          <strong>{{ assetsStore.user?.email }}</strong>
          <small>{{
            canManage ? 'Owner workspace controls enabled' : 'Read-only workspace access'
          }}</small>
        </div>
        <div class="button-row">
          <button
            class="button-secondary"
            type="button"
            :disabled="!canRead || workspaceStore.isBusy"
            @click="loadWorkspace"
          >
            Refresh
          </button>
          <button
            class="button-secondary"
            type="button"
            :disabled="workspaceStore.isBusy"
            @click="logout"
          >
            Sign out
          </button>
        </div>
      </section>

      <section v-if="!canRead" class="empty-state">
        <span class="empty-state__mark" aria-hidden="true">403</span>
        <h2>Administrative read scope required</h2>
        <p>Your current session does not include <code>admin:read</code>.</p>
      </section>

      <template v-else>
        <p v-if="workspaceStore.error" class="error-message" role="alert">
          {{ workspaceStore.error }}
        </p>
        <p v-if="feedback" class="success-message" role="status">{{ feedback }}</p>
        <section v-if="workspaceStore.loading && !workspaceStore.profile" role="status">
          Loading workspace profile…
        </section>

        <section
          v-else-if="workspaceStore.profile"
          class="workflow-panel"
          aria-labelledby="workspace-profile-title"
        >
          <div class="section-heading">
            <div>
              <span class="eyebrow">Authenticated boundary</span>
              <h2 id="workspace-profile-title">Workspace profile</h2>
            </div>
            <span class="status-pill">Version {{ workspaceStore.profile.version }}</span>
          </div>

          <dl class="operations-metadata">
            <div>
              <dt>Workspace ID</dt>
              <dd>
                <code>{{ workspaceStore.profile.id }}</code>
              </dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{{ formatDate(workspaceStore.profile.created_at) }}</dd>
            </div>
            <div>
              <dt>Last changed</dt>
              <dd>{{ formatDate(workspaceStore.profile.updated_at) }}</dd>
            </div>
          </dl>

          <form class="form-stack workspace-profile-form" @submit.prevent="saveWorkspace">
            <label class="field">
              <span>Workspace name</span>
              <input
                v-model="name"
                type="text"
                minlength="1"
                maxlength="200"
                autocomplete="organization"
                :disabled="!canManage || workspaceStore.isBusy"
                required
              />
              <small>
                Saving requires the Owner role and <code>admin:write</code>. A stale version is
                rejected instead of overwriting another administrator's change.
              </small>
            </label>
            <button type="submit" :disabled="!canManage || workspaceStore.isBusy || !name.trim()">
              {{ workspaceStore.saving ? 'Saving…' : 'Save workspace' }}
            </button>
          </form>
        </section>
      </template>
    </template>
  </div>
</template>
