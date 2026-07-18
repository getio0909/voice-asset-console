<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import { API_KEY_SCOPES } from '@/api/client'
import type { APIKey, Scope } from '@/api/client'
import { useAPIKeysStore } from '@/stores/apiKeys'
import { useAssetsStore } from '@/stores/assets'
import { useConsoleStore } from '@/stores/console'

const MINUTE_MS = 60_000
const DAY_MS = 86_400_000

const scopeDescriptions: Readonly<Record<Scope, string>> = Object.freeze({
  'admin:read': 'Read workspace administration data, including API-key metadata.',
  'admin:write': 'Create and revoke workspace administration resources.',
  'assets:read': 'List and inspect voice assets.',
  'assets:write': 'Create and update voice assets and uploads.',
  'audio:read': 'Download original audio objects.',
  'corrections:write': 'Create and review correction proposals.',
  'metadata:write': 'Update mutable asset metadata.',
  'transcriptions:write': 'Queue transcription jobs.',
  'transcripts:read': 'Read transcripts and immutable revisions.',
})

const assetsStore = useAssetsStore()
const consoleStore = useConsoleStore()
const apiKeysStore = useAPIKeysStore()

const now = Date.now()
const name = ref('')
const selectedScopes = ref<Scope[]>([])
const expiresAt = ref(toLocalDateTime(new Date(now + 30 * DAY_MS)))
const minimumExpiry = toLocalDateTime(new Date(now + 10 * MINUTE_MS))
const maximumExpiry = toLocalDateTime(new Date(now + 365 * DAY_MS))
const copyStatus = ref('')

const canRead = computed(() => assetsStore.user?.scopes.includes('admin:read') ?? false)
const canWrite = computed(() => assetsStore.user?.scopes.includes('admin:write') ?? false)

function toLocalDateTime(value: Date): string {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * MINUTE_MS)
  return local.toISOString().slice(0, 16)
}

function formatDate(value: string | null): string {
  if (!value) {
    return 'Never'
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function lifecycle(
  apiKey: Readonly<Pick<APIKey, 'expires_at' | 'revoked_at'>>,
): 'Active' | 'Expired' | 'Revoked' {
  if (apiKey.revoked_at) {
    return 'Revoked'
  }
  return new Date(apiKey.expires_at).getTime() <= Date.now() ? 'Expired' : 'Active'
}

onMounted(async () => {
  const authenticated =
    assetsStore.sessionStatus === 'authenticated' || (await assetsStore.restoreSession())
  if (authenticated && canRead.value) {
    await apiKeysStore.load()
  }
})

onBeforeUnmount(() => {
  apiKeysStore.clearOneTimeCredential()
})

async function submit(): Promise<void> {
  const parsedExpiry = new Date(expiresAt.value)
  const created = await apiKeysStore.create({
    name: name.value,
    scopes: [...selectedScopes.value],
    expires_at: Number.isNaN(parsedExpiry.getTime()) ? expiresAt.value : parsedExpiry.toISOString(),
  })
  if (created) {
    name.value = ''
    selectedScopes.value = []
    copyStatus.value = ''
  }
}

async function copyToken(): Promise<void> {
  const token = apiKeysStore.oneTimeCredential?.token
  if (!token) {
    return
  }
  try {
    await navigator.clipboard.writeText(token)
    copyStatus.value = 'Copied to the clipboard.'
  } catch {
    copyStatus.value = 'Clipboard access failed. Select and copy the token manually.'
  }
}

function dismissToken(): void {
  apiKeysStore.clearOneTimeCredential()
  copyStatus.value = ''
}

async function logout(): Promise<void> {
  apiKeysStore.reset()
  await assetsStore.logout()
}
</script>

<template>
  <div class="page-stack">
    <header class="page-heading">
      <span class="eyebrow">Credential lifecycle</span>
      <h1>API keys</h1>
      <p>
        Issue least-privilege credentials for automation, review only redacted identifiers, and
        revoke access without exposing stored token material.
      </p>
    </header>

    <aside v-if="!consoleStore.isReady" class="connection-warning" role="status">
      <strong>Server compatibility: {{ consoleStore.apiStatus }}</strong>
      <span>{{ consoleStore.compatibilityIssue ?? 'Waiting for the capability check.' }}</span>
    </aside>

    <section v-if="assetsStore.sessionStatus === 'checking'" class="workflow-panel" role="status">
      <span class="eyebrow">Session</span>
      <h2>Checking the secure web session</h2>
      <p>Authentication remains in the Server-managed HttpOnly cookie.</p>
    </section>

    <section v-else-if="!assetsStore.isAuthenticated" class="empty-state">
      <span class="empty-state__mark" aria-hidden="true">05</span>
      <h2>Sign in before managing API keys</h2>
      <p>Use the Assets workspace to establish the same HttpOnly server session.</p>
      <RouterLink class="text-link" to="/assets">Go to secure sign in</RouterLink>
    </section>

    <template v-else>
      <section class="session-bar" aria-label="Current session">
        <div>
          <span class="eyebrow">Signed in</span>
          <strong>{{ assetsStore.user?.email }}</strong>
          <small>{{ canWrite ? 'API-key write scope granted' : 'Read-only administration' }}</small>
        </div>
        <div class="button-row">
          <button
            class="button-secondary"
            type="button"
            :disabled="!canRead || apiKeysStore.isBusy"
            @click="apiKeysStore.load()"
          >
            Refresh
          </button>
          <button
            class="button-secondary"
            type="button"
            :disabled="apiKeysStore.isBusy"
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
        <p v-if="apiKeysStore.error" class="error-message" role="alert">
          {{ apiKeysStore.error }}
        </p>

        <section
          v-if="apiKeysStore.oneTimeCredential"
          class="one-time-credential"
          aria-labelledby="one-time-token-title"
        >
          <div>
            <span class="eyebrow">Shown once</span>
            <h2 id="one-time-token-title">Copy this token now</h2>
            <p>
              The Server cannot show it again. Store it in an approved secret manager, then dismiss
              it from this browser tab.
            </p>
          </div>
          <label class="field">
            <span>Plaintext API token</span>
            <input
              :value="apiKeysStore.oneTimeCredential.token"
              readonly
              autocomplete="off"
              spellcheck="false"
              @focus="($event.target as HTMLInputElement).select()"
            />
          </label>
          <div class="button-row">
            <button type="button" @click="copyToken">Copy token</button>
            <button class="button-secondary" type="button" @click="dismissToken">
              I have stored it; dismiss
            </button>
          </div>
          <p v-if="copyStatus" class="copy-status" role="status">{{ copyStatus }}</p>
        </section>

        <section class="configuration-grid" aria-label="API key administration">
          <article class="workflow-panel">
            <div class="section-heading">
              <div>
                <span class="eyebrow">Least privilege</span>
                <h2>Create a key</h2>
              </div>
            </div>
            <p>The expiry must be between five minutes and 365 days from creation.</p>
            <form class="form-stack" @submit.prevent="submit">
              <label class="field">
                <span>Name</span>
                <input v-model="name" maxlength="100" autocomplete="off" required />
              </label>
              <label class="field">
                <span>Expires at</span>
                <input
                  v-model="expiresAt"
                  type="datetime-local"
                  :min="minimumExpiry"
                  :max="maximumExpiry"
                  required
                />
              </label>
              <fieldset class="scope-picker">
                <legend>Scopes</legend>
                <label v-for="scope in API_KEY_SCOPES" :key="scope">
                  <input v-model="selectedScopes" type="checkbox" :value="scope" />
                  <span>
                    <strong>{{ scope }}</strong>
                    <small>{{ scopeDescriptions[scope] }}</small>
                  </span>
                </label>
              </fieldset>
              <button
                type="submit"
                :disabled="
                  !canWrite ||
                  apiKeysStore.isBusy ||
                  Boolean(apiKeysStore.oneTimeCredential) ||
                  !name.trim() ||
                  selectedScopes.length === 0
                "
              >
                Create one-time token
              </button>
              <small v-if="!canWrite">Your session is missing <code>admin:write</code>.</small>
            </form>
          </article>

          <article class="workflow-panel">
            <div class="section-heading">
              <div>
                <span class="eyebrow">Redacted inventory</span>
                <h2>Workspace keys</h2>
              </div>
              <span class="status-pill">{{ apiKeysStore.items.length }} keys</span>
            </div>
            <p v-if="apiKeysStore.loading" role="status">Loading API-key metadata…</p>
            <p v-else-if="apiKeysStore.items.length === 0">No API keys have been created.</p>
            <ul v-else class="api-key-list">
              <li v-for="apiKey in apiKeysStore.items" :key="apiKey.id">
                <div class="api-key-heading">
                  <div>
                    <strong>{{ apiKey.name }}</strong>
                    <code>{{ apiKey.token_prefix }}…</code>
                  </div>
                  <span class="status-pill">{{ lifecycle(apiKey) }}</span>
                </div>
                <dl class="credential-metadata">
                  <div>
                    <dt>Expires</dt>
                    <dd>{{ formatDate(apiKey.expires_at) }}</dd>
                  </div>
                  <div>
                    <dt>Last used</dt>
                    <dd>{{ formatDate(apiKey.last_used_at) }}</dd>
                  </div>
                  <div>
                    <dt>Scopes</dt>
                    <dd>{{ apiKey.scopes.join(', ') }}</dd>
                  </div>
                </dl>
                <button
                  v-if="lifecycle(apiKey) === 'Active'"
                  class="button-secondary button-compact"
                  type="button"
                  :disabled="!canWrite || apiKeysStore.isBusy"
                  :aria-label="`Revoke ${apiKey.name}`"
                  @click="apiKeysStore.revoke(apiKey.id)"
                >
                  Revoke
                </button>
              </li>
            </ul>
          </article>
        </section>
      </template>
    </template>
  </div>
</template>
