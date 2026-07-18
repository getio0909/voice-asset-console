<script setup lang="ts">
import QRCode from 'qrcode'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import { useAssetsStore } from '@/stores/assets'
import { useConsoleStore } from '@/stores/console'
import { useSessionsStore } from '@/stores/sessions'

const assetsStore = useAssetsStore()
const consoleStore = useConsoleStore()
const sessionsStore = useSessionsStore()
const router = useRouter()
const showPairingPayload = ref(false)
const copyStatus = ref('')
const pairingQrCanvas = ref<HTMLCanvasElement | null>(null)
const pairingQrError = ref('')

watch(
  () => sessionsStore.pairingSession?.payload,
  async (payload) => {
    pairingQrError.value = ''
    await nextTick()
    const canvas = pairingQrCanvas.value
    if (!canvas) {
      return
    }
    if (!payload) {
      return
    }
    try {
      await QRCode.toCanvas(canvas, payload, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 240,
      })
    } catch {
      pairingQrError.value = 'The QR code could not be rendered. Copy the payload instead.'
    }
  },
  { flush: 'post' },
)

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

onMounted(async () => {
  const authenticated =
    assetsStore.sessionStatus === 'authenticated' || (await assetsStore.restoreSession())
  if (authenticated) {
    await sessionsStore.load()
  }
})

onBeforeUnmount(() => {
  sessionsStore.clearPairingSession()
})

function clearPairingPayload(): void {
  sessionsStore.clearPairingSession()
  showPairingPayload.value = false
  copyStatus.value = ''
}

async function createPairingPayload(): Promise<void> {
  showPairingPayload.value = false
  copyStatus.value = ''
  await sessionsStore.createPairing()
}

async function copyPairingPayload(): Promise<void> {
  const payload = sessionsStore.pairingSession?.payload
  if (!payload) {
    return
  }
  try {
    await navigator.clipboard.writeText(payload)
    copyStatus.value = 'Copied to the clipboard.'
  } catch {
    copyStatus.value = 'Clipboard access failed. Reveal and copy the payload manually.'
  }
}

async function refresh(): Promise<void> {
  showPairingPayload.value = false
  copyStatus.value = ''
  await sessionsStore.load()
}

async function revoke(deviceSessionId: string): Promise<void> {
  const revoked = await sessionsStore.revoke(deviceSessionId)
  if (!revoked?.current) {
    return
  }
  sessionsStore.reset()
  await assetsStore.restoreSession()
  await router.push('/assets')
}

async function logout(): Promise<void> {
  if (await assetsStore.logout()) {
    sessionsStore.reset()
    await router.push('/assets')
  }
}
</script>

<template>
  <div class="page-stack">
    <header class="page-heading">
      <span class="eyebrow">Personal security</span>
      <h1>Device sessions</h1>
      <p>
        Review active browsers and apps for your account. Revocation invalidates both access and
        refresh credentials for that device.
      </p>
    </header>

    <aside v-if="!consoleStore.isReady" class="connection-warning" role="status">
      <strong>Server compatibility: {{ consoleStore.apiStatus }}</strong>
      <span>{{ consoleStore.compatibilityIssue ?? 'Waiting for the capability check.' }}</span>
    </aside>

    <section v-if="assetsStore.sessionStatus === 'checking'" class="workflow-panel" role="status">
      <span class="eyebrow">Session</span>
      <h2>Checking the secure web session</h2>
      <p>Access and refresh credentials remain in Server-managed HttpOnly cookies.</p>
    </section>

    <section v-else-if="!assetsStore.isAuthenticated" class="empty-state">
      <span class="empty-state__mark" aria-hidden="true">401</span>
      <h2>Sign in to review your devices</h2>
      <p>Device sessions are personal and cannot be listed with an API key.</p>
      <RouterLink class="text-link" to="/assets">Go to secure sign in</RouterLink>
    </section>

    <template v-else>
      <section class="session-bar" aria-label="Current account">
        <div>
          <span class="eyebrow">Signed in</span>
          <strong>{{ assetsStore.user?.email }}</strong>
          <small>{{ assetsStore.user?.role }} · personal sessions only</small>
        </div>
        <div class="button-row">
          <button
            class="button-secondary"
            type="button"
            :disabled="sessionsStore.isBusy"
            @click="refresh"
          >
            Refresh list
          </button>
          <button
            class="button-secondary"
            type="button"
            :disabled="sessionsStore.isBusy"
            @click="logout"
          >
            Sign out
          </button>
        </div>
      </section>

      <p v-if="sessionsStore.error" class="error-message" role="alert">
        {{ sessionsStore.error }}
      </p>

      <section class="workflow-panel" aria-labelledby="device-pairing-title">
        <div class="section-heading">
          <div>
            <span class="eyebrow">One-time handoff</span>
            <h2 id="device-pairing-title">Pair an Android device</h2>
          </div>
          <span class="status-pill">5 minute expiry</span>
        </div>
        <p>
          Create a short-lived payload, scan its QR code with Android, or copy and paste it into the
          app's server-profile pairing field. Creating another payload invalidates the previous
          unclaimed one.
        </p>
        <button
          data-testid="create-pairing"
          type="button"
          :disabled="sessionsStore.isBusy"
          @click="createPairingPayload"
        >
          {{ sessionsStore.creatingPairing ? 'Creating payload…' : 'Create pairing payload' }}
        </button>

        <div v-if="sessionsStore.pairingSession" class="one-time-credential">
          <div>
            <span class="eyebrow">Shown only in this tab</span>
            <h3>Copy this pairing payload now</h3>
            <p>
              It expires at {{ formatDate(sessionsStore.pairingSession.expires_at) }} and is never
              written to browser storage. Clearing it here does not extend or renew its expiry.
            </p>
          </div>
          <div class="pairing-qr" aria-labelledby="pairing-qr-title">
            <div>
              <span class="eyebrow">Camera handoff</span>
              <h3 id="pairing-qr-title">Scan with the Android app</h3>
              <p>Keep this tab visible while the Android scanner reads the one-time code.</p>
            </div>
            <canvas
              ref="pairingQrCanvas"
              data-testid="pairing-qr"
              class="pairing-qr__canvas"
              role="img"
              aria-label="One-time Android pairing QR code"
              width="240"
              height="240"
            />
            <p v-if="pairingQrError" class="error-message" role="alert">{{ pairingQrError }}</p>
          </div>
          <label class="field">
            <span>One-time pairing payload</span>
            <input
              data-testid="pairing-payload"
              :type="showPairingPayload ? 'text' : 'password'"
              :value="sessionsStore.pairingSession.payload"
              readonly
              autocomplete="off"
              spellcheck="false"
              @focus="($event.target as HTMLInputElement).select()"
            />
          </label>
          <div class="button-row">
            <button
              data-testid="toggle-pairing"
              class="button-secondary"
              type="button"
              @click="showPairingPayload = !showPairingPayload"
            >
              {{ showPairingPayload ? 'Hide payload' : 'Reveal payload' }}
            </button>
            <button data-testid="copy-pairing" type="button" @click="copyPairingPayload">
              Copy payload
            </button>
            <button
              data-testid="clear-pairing"
              class="button-secondary"
              type="button"
              @click="clearPairingPayload"
            >
              Clear from this tab
            </button>
          </div>
          <p v-if="copyStatus" class="copy-status" role="status">{{ copyStatus }}</p>
        </div>
      </section>

      <section class="workflow-panel" aria-labelledby="active-sessions-title">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Active inventory</span>
            <h2 id="active-sessions-title">Recognized devices</h2>
          </div>
          <span class="status-pill">{{ sessionsStore.items.length }} active</span>
        </div>
        <p v-if="sessionsStore.loading" role="status">Loading device sessions…</p>
        <p v-else-if="sessionsStore.items.length === 0">No active device sessions were returned.</p>
        <ul v-else class="device-session-list">
          <li v-for="session in sessionsStore.items" :key="session.id">
            <div class="api-key-heading">
              <div>
                <strong>{{ session.device_name }}</strong>
                <small>{{ session.current ? 'This browser' : 'Another signed-in device' }}</small>
              </div>
              <span v-if="session.current" class="status-pill">Current</span>
            </div>
            <dl class="credential-metadata">
              <div>
                <dt>Last seen</dt>
                <dd>{{ formatDate(session.last_seen_at) }}</dd>
              </div>
              <div>
                <dt>Signed in</dt>
                <dd>{{ formatDate(session.created_at) }}</dd>
              </div>
              <div>
                <dt>Refresh until</dt>
                <dd>{{ formatDate(session.refresh_expires_at) }}</dd>
              </div>
            </dl>
            <button
              class="button-secondary button-compact"
              type="button"
              :disabled="sessionsStore.isBusy"
              :aria-label="`Revoke ${session.device_name}`"
              @click="revoke(session.id)"
            >
              {{ session.current ? 'Revoke this browser' : 'Revoke device' }}
            </button>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
