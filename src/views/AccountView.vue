<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import { useAccountStore } from '@/stores/account'
import { useAssetsStore } from '@/stores/assets'
import { useConsoleStore } from '@/stores/console'

const accountStore = useAccountStore()
const assetsStore = useAssetsStore()
const consoleStore = useConsoleStore()

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const feedback = ref('')

async function initialize(): Promise<void> {
  accountStore.reset()
  if (assetsStore.sessionStatus !== 'authenticated') await assetsStore.restoreSession()
}

async function submitPasswordChange(): Promise<void> {
  const input = {
    current_password: currentPassword.value,
    new_password: newPassword.value,
  }
  const confirmation = confirmPassword.value

  currentPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
  feedback.value = ''

  if (input.new_password !== confirmation) {
    accountStore.setValidationError('New password confirmation does not match.')
    return
  }
  if (input.current_password === input.new_password) {
    accountStore.setValidationError('New password must differ from the current password.')
    return
  }
  if (await accountStore.changePassword(input)) {
    assetsStore.clearLocalSession()
    feedback.value = 'Password changed. Every existing session was revoked; sign in again.'
  }
}

onMounted(() => {
  void initialize()
})
</script>

<template>
  <div class="page-stack">
    <header class="page-heading">
      <span class="eyebrow">Personal security</span>
      <h1>Account</h1>
      <p>
        Change your password from an authenticated browser session. A successful change signs out
        every device and requires a fresh login.
      </p>
    </header>

    <aside v-if="!consoleStore.isReady" class="connection-warning" role="status">
      <strong>Server compatibility: {{ consoleStore.apiStatus }}</strong>
      <span>{{ consoleStore.compatibilityIssue ?? 'Waiting for the capability check.' }}</span>
    </aside>

    <p v-if="accountStore.error" class="error-message" role="alert">
      {{ accountStore.error }}
    </p>
    <p v-if="feedback" class="success-message" role="status">{{ feedback }}</p>

    <section v-if="assetsStore.sessionStatus === 'checking'" class="workflow-panel" role="status">
      <span class="eyebrow">Session</span>
      <h2>Checking account access</h2>
      <p>The Console uses the Server-managed HttpOnly session.</p>
    </section>

    <section v-else-if="!assetsStore.isAuthenticated" class="empty-state">
      <span class="empty-state__mark" aria-hidden="true">401</span>
      <h2>Sign in to manage your account</h2>
      <p>Password changes require a current browser session and your existing password.</p>
      <RouterLink class="text-link" to="/assets">Go to secure sign in</RouterLink>
    </section>

    <template v-else>
      <section class="session-bar" aria-label="Current session">
        <div>
          <span class="eyebrow">Signed in</span>
          <strong>{{ assetsStore.user?.email }}</strong>
          <small>Changing the password revokes this session too.</small>
        </div>
      </section>

      <section class="workflow-panel" aria-labelledby="password-change-title">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Credentials</span>
            <h2 id="password-change-title">Change password</h2>
          </div>
          <p>Use at least 12 characters. Password fields are cleared as soon as you submit.</p>
        </div>

        <form class="form-stack" @submit.prevent="submitPasswordChange">
          <label class="field">
            <span>Current password</span>
            <input
              v-model="currentPassword"
              type="password"
              autocomplete="current-password"
              maxlength="1024"
              :disabled="accountStore.changing"
              required
            />
          </label>
          <label class="field">
            <span>New password</span>
            <input
              v-model="newPassword"
              type="password"
              autocomplete="new-password"
              minlength="12"
              maxlength="1024"
              :disabled="accountStore.changing"
              required
            />
          </label>
          <label class="field">
            <span>Confirm new password</span>
            <input
              v-model="confirmPassword"
              type="password"
              autocomplete="new-password"
              minlength="12"
              maxlength="1024"
              :disabled="accountStore.changing"
              required
            />
          </label>
          <button type="submit" :disabled="accountStore.changing">
            {{ accountStore.changing ? 'Changing password…' : 'Change password' }}
          </button>
        </form>
      </section>
    </template>
  </div>
</template>
