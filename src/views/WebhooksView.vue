<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import { WEBHOOK_EVENT_TYPES } from '@/api/client'
import type { WebhookEventType } from '@/api/client'
import { useAssetsStore } from '@/stores/assets'
import { useConsoleStore } from '@/stores/console'
import { useWebhooksStore } from '@/stores/webhooks'

const assetsStore = useAssetsStore()
const consoleStore = useConsoleStore()
const webhooksStore = useWebhooksStore()

const name = ref('')
const url = ref('https://')
const state = ref<'enabled' | 'disabled'>('disabled')
const eventTypes = ref<WebhookEventType[]>(['job.succeeded'])
const selectedId = ref<string | null>(null)
const editName = ref('')
const editURL = ref('')
const copyStatus = ref('')

const selected = computed(
  () => webhooksStore.items.find((item) => item.id === selectedId.value) ?? null,
)
const canRead = computed(
  () => assetsStore.user?.role === 'owner' && assetsStore.user.scopes.includes('admin:read'),
)
const canWrite = computed(
  () => assetsStore.user?.role === 'owner' && assetsStore.user.scopes.includes('admin:write'),
)

onMounted(async () => {
  const authenticated =
    assetsStore.sessionStatus === 'authenticated' || (await assetsStore.restoreSession())
  if (authenticated && canRead.value) {
    await webhooksStore.load()
    select(webhooksStore.items[0]?.id ?? null)
  }
})

onBeforeUnmount(() => webhooksStore.clearOneTimeSecret())

function select(id: string | null): void {
  selectedId.value = id
  const item = webhooksStore.items.find((webhook) => webhook.id === id)
  editName.value = item?.display_name ?? ''
  editURL.value = item?.url ?? ''
  copyStatus.value = ''
  if (item) void webhooksStore.loadDeliveries(item.id)
}

async function create(): Promise<void> {
  const created = await webhooksStore.create({
    display_name: name.value,
    url: url.value,
    event_types: [...eventTypes.value],
    state: state.value,
  })
  if (created) {
    name.value = ''
    url.value = 'https://'
    state.value = 'disabled'
    eventTypes.value = ['job.succeeded']
    select(webhooksStore.oneTimeSecret?.id ?? null)
  }
}

async function save(): Promise<void> {
  if (!selected.value) return
  const updated = await webhooksStore.update(selected.value.id, selected.value.version, {
    display_name: editName.value,
    url: editURL.value,
  })
  if (updated) select(selected.value.id)
}

async function toggleState(): Promise<void> {
  if (!selected.value) return
  const state = selected.value.state === 'enabled' ? 'disabled' : 'enabled'
  await webhooksStore.update(selected.value.id, selected.value.version, { state })
  select(selected.value.id)
}

async function rotate(): Promise<void> {
  if (selected.value) await webhooksStore.rotate(selected.value.id, selected.value.version)
}

async function sendTest(): Promise<void> {
  if (selected.value && (await webhooksStore.test(selected.value.id))) {
    await webhooksStore.loadDeliveries(selected.value.id)
  }
}

async function copySecret(): Promise<void> {
  const secret = webhooksStore.oneTimeSecret?.signing_secret
  if (!secret) return
  try {
    await navigator.clipboard.writeText(secret)
    copyStatus.value = 'Copied to the clipboard.'
  } catch {
    copyStatus.value = 'Clipboard access failed; select and copy it manually.'
  }
}
</script>

<template>
  <div class="page-stack">
    <header class="page-heading">
      <span class="eyebrow">Signed delivery</span>
      <h1>Outbound Webhooks</h1>
      <p>Send bounded job events to an HTTPS receiver. Secrets are shown only once.</p>
    </header>

    <aside v-if="!consoleStore.isReady" class="connection-warning" role="status">
      <strong>Server compatibility: {{ consoleStore.apiStatus }}</strong>
      <span>{{ consoleStore.compatibilityIssue ?? 'Waiting for the capability check.' }}</span>
    </aside>

    <section v-if="assetsStore.sessionStatus === 'checking'" class="workflow-panel" role="status">
      <span class="eyebrow">Session</span>
      <h2>Checking the secure web session</h2>
    </section>
    <section v-else-if="!assetsStore.isAuthenticated" class="empty-state">
      <span class="empty-state__mark" aria-hidden="true">403</span>
      <h2>Sign in before managing Webhooks</h2>
      <RouterLink class="text-link" to="/assets">Go to secure sign in</RouterLink>
    </section>
    <section v-else-if="!canRead" class="empty-state">
      <span class="empty-state__mark" aria-hidden="true">OWNER</span>
      <h2>Owner administration required</h2>
      <p>Only an Owner browser Session may inspect Webhook endpoints.</p>
    </section>
    <template v-else>
      <p v-if="webhooksStore.error" class="error-message" role="alert">{{ webhooksStore.error }}</p>

      <section
        v-if="webhooksStore.oneTimeSecret"
        class="one-time-credential"
        aria-labelledby="webhook-secret-title"
      >
        <span class="eyebrow">Shown once</span>
        <h2 id="webhook-secret-title">Store this signing secret now</h2>
        <p>The Server will never display it again.</p>
        <input
          :value="webhooksStore.oneTimeSecret.signing_secret"
          readonly
          autocomplete="off"
          spellcheck="false"
          @focus="($event.target as HTMLInputElement).select()"
        />
        <div class="button-row">
          <button type="button" @click="copySecret">Copy secret</button>
          <button
            class="button-secondary"
            type="button"
            @click="webhooksStore.clearOneTimeSecret()"
          >
            I have stored it
          </button>
        </div>
        <p v-if="copyStatus" class="copy-status" role="status">{{ copyStatus }}</p>
      </section>

      <section class="configuration-grid" aria-label="Webhook administration">
        <article v-if="canWrite" class="workflow-panel">
          <span class="eyebrow">Owner write</span>
          <h2>Create endpoint</h2>
          <form class="form-stack" @submit.prevent="create">
            <label class="field"
              ><span>Name</span><input v-model="name" maxlength="100" required
            /></label>
            <label class="field"
              ><span>HTTPS URL</span><input v-model="url" type="url" required
            /></label>
            <fieldset class="scope-picker">
              <legend>Events</legend>
              <label v-for="eventType in WEBHOOK_EVENT_TYPES" :key="eventType"
                ><input v-model="eventTypes" type="checkbox" :value="eventType" /><span>{{
                  eventType
                }}</span></label
              >
            </fieldset>
            <label class="field"
              ><span>Initial state</span
              ><select v-model="state">
                <option value="disabled">Disabled</option>
                <option value="enabled">Enabled</option>
              </select></label
            >
            <button
              type="submit"
              :disabled="webhooksStore.isBusy || !name.trim() || eventTypes.length === 0"
            >
              Create Webhook
            </button>
          </form>
        </article>

        <article class="workflow-panel">
          <div class="section-heading">
            <div>
              <span class="eyebrow">Workspace inventory</span>
              <h2>Endpoints</h2>
            </div>
            <button
              class="button-secondary button-compact"
              type="button"
              :disabled="webhooksStore.isBusy"
              @click="webhooksStore.load()"
            >
              Refresh
            </button>
          </div>
          <p v-if="webhooksStore.loading" role="status">Loading Webhooks…</p>
          <p v-else-if="webhooksStore.items.length === 0">No Webhooks configured.</p>
          <ul v-else class="api-key-list">
            <li
              v-for="item in webhooksStore.items"
              :key="item.id"
              :class="{ 'selected-row': item.id === selectedId }"
            >
              <button class="text-button" type="button" @click="select(item.id)">
                <strong>{{ item.display_name }}</strong
                ><span class="status-pill">{{ item.state }}</span>
              </button>
              <code>{{ item.url }}</code>
              <small>{{ item.event_types.join(', ') }} · version {{ item.version }}</small>
            </li>
          </ul>
        </article>
      </section>

      <section v-if="selected" class="workflow-panel">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Version {{ selected.version }}</span>
            <h2>{{ selected.display_name }}</h2>
          </div>
          <span class="status-pill">{{ selected.state }}</span>
        </div>
        <form v-if="canWrite" class="form-stack" @submit.prevent="save">
          <label class="field"
            ><span>Name</span><input v-model="editName" maxlength="100" required
          /></label>
          <label class="field"
            ><span>HTTPS URL</span><input v-model="editURL" type="url" required
          /></label>
          <div class="button-row">
            <button type="submit" :disabled="webhooksStore.isBusy">Save endpoint</button
            ><button
              class="button-secondary"
              type="button"
              :disabled="webhooksStore.isBusy"
              @click="toggleState"
            >
              {{ selected.state === 'enabled' ? 'Disable' : 'Enable' }}</button
            ><button
              class="button-secondary"
              type="button"
              :disabled="webhooksStore.isBusy || Boolean(webhooksStore.oneTimeSecret)"
              @click="rotate"
            >
              Rotate secret</button
            ><button
              class="button-secondary"
              type="button"
              :disabled="webhooksStore.isBusy || selected.state !== 'enabled'"
              @click="sendTest"
            >
              Send test
            </button>
          </div>
        </form>
        <div class="section-heading">
          <div>
            <span class="eyebrow">Delivery history</span>
            <h3>Recent attempts</h3>
          </div>
          <button
            class="button-secondary button-compact"
            type="button"
            :disabled="webhooksStore.isBusy"
            @click="webhooksStore.loadDeliveries(selected.id)"
          >
            Refresh
          </button>
        </div>
        <p v-if="webhooksStore.deliveries.length === 0">No deliveries recorded.</p>
        <ul v-else class="api-key-list">
          <li v-for="delivery in webhooksStore.deliveries" :key="delivery.id">
            <strong>{{ delivery.event_type }}</strong
            ><span class="status-pill">{{ delivery.state }}</span
            ><small
              >{{ delivery.attempts }}/{{ delivery.max_attempts }} attempts{{
                delivery.response_status ? ` · HTTP ${delivery.response_status}` : ''
              }}{{ delivery.last_error_code ? ` · ${delivery.last_error_code}` : '' }}</small
            >
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
