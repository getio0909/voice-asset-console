<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import type {
  ASRProviderConfig,
  ASRProviderId,
  CreateProviderProfileRequest,
  HotwordEntryInput,
  HotwordScope,
  ProviderCredentials,
  ProviderProfile,
  ResourceState,
} from '@/api/client'
import { useAssetsStore } from '@/stores/assets'
import { useConsoleStore } from '@/stores/console'
import { useProvidersStore } from '@/stores/providers'

type AliyunCredentialMode = 'access-token' | 'access-key'

const providerLabels: Readonly<Record<ASRProviderId, string>> = Object.freeze({
  mock_asr: 'Mock ASR',
  aliyun_asr: 'Alibaba Cloud Flash ASR',
  tencent_asr: 'Tencent Cloud Flash ASR',
})

const assetsStore = useAssetsStore()
const consoleStore = useConsoleStore()
const providersStore = useProvidersStore()

const hotwordName = ref('Product terminology')
const hotwordScope = ref<HotwordScope>('workspace')
const hotwordScopeId = ref('')
const hotwordTerm = ref('')
const hotwordAliases = ref('')
const hotwordLanguage = ref('zh-CN')
const hotwordWeight = ref(90)
const hotwordDescription = ref('')

const versionTargetId = ref('')
const versionTerm = ref('')
const versionAliases = ref('')
const versionLanguage = ref('zh-CN')
const versionWeight = ref(90)

const providerId = ref<ASRProviderId>('mock_asr')
const profileName = ref('')
const model = ref('')
const asrLanguage = ref('zh-CN')
const sampleRate = ref(16_000)
const audioFormat = ref('wav')
const concurrency = ref(1)
const priority = ref(100)
const timeout = ref('1m')
const maxAttempts = ref(1)
const baseDelay = ref('100ms')
const maxDelay = ref('1s')
const profileState = ref<ResourceState>('enabled')
const punctuation = ref(true)
const timestamps = ref(true)
const wordTimestamps = ref(true)
const speakerDiarization = ref(false)
const numberNormalization = ref(false)
const profileHotwordSetId = ref('')
const aliyunAppKey = ref('')
const aliyunVocabularyId = ref('')
const tencentAppId = ref('')
const tencentHotwordId = ref('')

const aliyunCredentialMode = ref<AliyunCredentialMode>('access-token')
const aliyunAccessToken = ref('')
const aliyunAccessKeyId = ref('')
const aliyunAccessKeySecret = ref('')
const tencentSecretId = ref('')
const tencentSecretKey = ref('')

const rotationProfileId = ref('')
const rotationAliyunMode = ref<AliyunCredentialMode>('access-token')
const rotationAliyunToken = ref('')
const rotationAliyunKeyId = ref('')
const rotationAliyunKeySecret = ref('')
const rotationTencentSecretId = ref('')
const rotationTencentSecretKey = ref('')

const canRead = computed(() => assetsStore.user?.scopes.includes('admin:read') ?? false)
const canWrite = computed(() => assetsStore.user?.scopes.includes('admin:write') ?? false)
const selectedCapability = computed(() =>
  providersStore.capabilities.find((item) => item.provider_id === providerId.value),
)
const availableHotwordSets = computed(() =>
  providersStore.hotwordSets.filter((set) => set.state === 'enabled'),
)
const rotationProfile = computed(() =>
  providersStore.profiles.find((profile) => profile.id === rotationProfileId.value),
)

const credentialReady = computed(() => {
  if (providerId.value === 'mock_asr') return true
  if (providerId.value === 'aliyun_asr') {
    return aliyunCredentialMode.value === 'access-token'
      ? aliyunAccessToken.value.length >= 8
      : aliyunAccessKeyId.value.length >= 8 && aliyunAccessKeySecret.value.length >= 8
  }
  return tencentSecretId.value.length >= 8 && tencentSecretKey.value.length >= 8
})

const vendorConfigurationReady = computed(() => {
  if (providerId.value === 'aliyun_asr') return Boolean(aliyunAppKey.value.trim())
  if (providerId.value === 'tencent_asr') return Boolean(tencentAppId.value.trim())
  return true
})

function aliasesFrom(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((alias) => alias.trim())
        .filter(Boolean),
    ),
  ]
}

function entryFrom(
  term: string,
  aliases: string,
  language: string,
  weight: number,
  description?: string,
): HotwordEntryInput {
  return {
    term: term.trim(),
    aliases: aliasesFrom(aliases),
    language: language.trim(),
    weight,
    enabled: true,
    ...(description?.trim() ? { description: description.trim() } : {}),
  }
}

function clearCreateCredentials(): void {
  aliyunAccessToken.value = ''
  aliyunAccessKeyId.value = ''
  aliyunAccessKeySecret.value = ''
  tencentSecretId.value = ''
  tencentSecretKey.value = ''
}

function clearRotationCredentials(): void {
  rotationAliyunToken.value = ''
  rotationAliyunKeyId.value = ''
  rotationAliyunKeySecret.value = ''
  rotationTencentSecretId.value = ''
  rotationTencentSecretKey.value = ''
}

function applyProviderDefaults(nextProvider: ASRProviderId): void {
  clearCreateCredentials()
  profileHotwordSetId.value = ''
  punctuation.value = true
  timestamps.value = true
  wordTimestamps.value = true
  speakerDiarization.value = false
  switch (nextProvider) {
    case 'mock_asr':
      profileName.value = 'Mock ASR'
      model.value = 'deterministic_fixture'
      sampleRate.value = 16_000
      audioFormat.value = 'wav'
      concurrency.value = 32
      timeout.value = '1m'
      maxAttempts.value = 1
      baseDelay.value = '100ms'
      maxDelay.value = '1s'
      profileState.value = 'enabled'
      numberNormalization.value = false
      break
    case 'aliyun_asr':
      profileName.value = 'Alibaba Flash ASR'
      model.value = 'project_configured'
      sampleRate.value = 16_000
      audioFormat.value = 'm4a'
      concurrency.value = 2
      timeout.value = '2m'
      maxAttempts.value = 3
      baseDelay.value = '1s'
      maxDelay.value = '30s'
      profileState.value = 'disabled'
      numberNormalization.value = true
      break
    case 'tencent_asr':
      profileName.value = 'Tencent Flash ASR'
      model.value = '16k_zh'
      sampleRate.value = 16_000
      audioFormat.value = 'm4a'
      concurrency.value = 5
      timeout.value = '2m'
      maxAttempts.value = 3
      baseDelay.value = '1s'
      maxDelay.value = '30s'
      profileState.value = 'disabled'
      numberNormalization.value = true
      break
  }
}

function vendorExtension(): Record<string, unknown> {
  if (providerId.value === 'aliyun_asr') {
    return {
      appkey: aliyunAppKey.value.trim(),
      ...(aliyunVocabularyId.value.trim()
        ? { vocabulary_id: aliyunVocabularyId.value.trim() }
        : {}),
    }
  }
  if (providerId.value === 'tencent_asr') {
    return {
      appid: tencentAppId.value.trim(),
      ...(tencentHotwordId.value.trim() ? { hotword_id: tencentHotwordId.value.trim() } : {}),
    }
  }
  return {}
}

function profileConfig(): ASRProviderConfig {
  return {
    ...(providerId.value === 'aliyun_asr' ? { region: 'cn-shanghai' } : {}),
    model: model.value,
    language: asrLanguage.value,
    sample_rate: sampleRate.value,
    audio_format: audioFormat.value,
    punctuation: punctuation.value,
    timestamps: timestamps.value,
    word_timestamps: wordTimestamps.value,
    speaker_diarization: speakerDiarization.value,
    number_normalization: numberNormalization.value,
    ...(profileHotwordSetId.value ? { hotword_set_id: profileHotwordSetId.value } : {}),
    timeout: timeout.value,
    retry: {
      max_attempts: maxAttempts.value,
      base_delay: baseDelay.value,
      max_delay: maxDelay.value,
    },
    concurrency: concurrency.value,
    vendor_extension: vendorExtension(),
  }
}

function createCredentials(): ProviderCredentials | undefined {
  if (providerId.value === 'aliyun_asr') {
    return aliyunCredentialMode.value === 'access-token'
      ? { access_token: aliyunAccessToken.value }
      : {
          access_key_id: aliyunAccessKeyId.value,
          access_key_secret: aliyunAccessKeySecret.value,
        }
  }
  if (providerId.value === 'tencent_asr') {
    return { secret_id: tencentSecretId.value, secret_key: tencentSecretKey.value }
  }
  return undefined
}

async function submitHotwordSet(): Promise<void> {
  const created = await providersStore.createHotwordSet({
    display_name: hotwordName.value,
    scope_type: hotwordScope.value,
    ...(hotwordScope.value === 'workspace' ? {} : { scope_id: hotwordScopeId.value }),
    state: 'enabled',
    entries: [
      entryFrom(
        hotwordTerm.value,
        hotwordAliases.value,
        hotwordLanguage.value,
        hotwordWeight.value,
        hotwordDescription.value,
      ),
    ],
  })
  if (created) {
    hotwordTerm.value = ''
    hotwordAliases.value = ''
    hotwordDescription.value = ''
  }
}

async function publishHotwordVersion(): Promise<void> {
  const published = await providersStore.publishHotwordVersion(versionTargetId.value, [
    entryFrom(versionTerm.value, versionAliases.value, versionLanguage.value, versionWeight.value),
  ])
  if (published) {
    versionTerm.value = ''
    versionAliases.value = ''
  }
}

async function submitProvider(): Promise<void> {
  const base = {
    display_name: profileName.value,
    config: profileConfig(),
    state: profileState.value,
    priority: priority.value,
  }
  const credentials = createCredentials()
  let input: CreateProviderProfileRequest
  if (providerId.value === 'mock_asr') {
    input = { ...base, provider_id: 'mock_asr' }
  } else if (providerId.value === 'aliyun_asr') {
    input = {
      ...base,
      provider_id: 'aliyun_asr',
      credentials: credentials as Extract<
        CreateProviderProfileRequest,
        { provider_id: 'aliyun_asr' }
      >['credentials'],
    }
  } else {
    input = {
      ...base,
      provider_id: 'tencent_asr',
      credentials: credentials as Extract<
        CreateProviderProfileRequest,
        { provider_id: 'tencent_asr' }
      >['credentials'],
    }
  }
  if (await providersStore.createProvider(input)) {
    clearCreateCredentials()
  }
}

function beginRotation(profile: ProviderProfile): void {
  clearRotationCredentials()
  rotationAliyunMode.value = 'access-token'
  rotationProfileId.value = profile.id
}

function cancelRotation(): void {
  clearRotationCredentials()
  rotationProfileId.value = ''
}

async function rotateCredentials(): Promise<void> {
  const profile = rotationProfile.value
  if (!profile || profile.provider_id === 'mock_asr') return
  let credentials: ProviderCredentials
  if (profile.provider_id === 'aliyun_asr') {
    credentials =
      rotationAliyunMode.value === 'access-token'
        ? { access_token: rotationAliyunToken.value }
        : {
            access_key_id: rotationAliyunKeyId.value,
            access_key_secret: rotationAliyunKeySecret.value,
          }
  } else {
    credentials = {
      secret_id: rotationTencentSecretId.value,
      secret_key: rotationTencentSecretKey.value,
    }
  }
  if (await providersStore.rotateProviderCredentials(profile.id, credentials)) {
    cancelRotation()
  }
}

async function logout(): Promise<void> {
  clearCreateCredentials()
  cancelRotation()
  providersStore.reset()
  await assetsStore.logout()
}

watch(providerId, applyProviderDefaults, { immediate: true })

onMounted(async () => {
  const authenticated =
    assetsStore.sessionStatus === 'authenticated' || (await assetsStore.restoreSession())
  if (authenticated && canRead.value) {
    await providersStore.load()
  }
})

onBeforeUnmount(() => {
  clearCreateCredentials()
  clearRotationCredentials()
})
</script>

<template>
  <div class="page-stack">
    <header class="page-heading">
      <span class="eyebrow">Server-side credentials</span>
      <h1>ASR providers &amp; hotwords</h1>
      <p>
        Compare implemented adapter limits, publish immutable pre-ASR vocabulary, and manage
        encrypted provider profiles without exposing a stored credential to this browser.
      </p>
    </header>

    <aside v-if="!consoleStore.isReady" class="connection-warning" role="status">
      <strong>Server compatibility: {{ consoleStore.apiStatus }}</strong>
      <span>{{ consoleStore.compatibilityIssue ?? 'Waiting for capability negotiation.' }}</span>
    </aside>

    <section v-if="assetsStore.sessionStatus === 'checking'" class="workflow-panel" role="status">
      <span class="eyebrow">Session</span>
      <h2>Checking the secure web session</h2>
      <p>Provider credentials remain write-only and are never loaded from Server.</p>
    </section>

    <section v-else-if="!assetsStore.isAuthenticated" class="empty-state">
      <span class="empty-state__mark" aria-hidden="true">03</span>
      <h2>Sign in before managing providers</h2>
      <p>Use the Assets workspace to establish the same HttpOnly server session.</p>
      <RouterLink class="text-link" to="/assets">Go to secure sign in</RouterLink>
    </section>

    <template v-else>
      <section class="session-bar" aria-label="Current session">
        <div>
          <span class="eyebrow">Signed in</span>
          <strong>{{ assetsStore.user?.email }}</strong>
          <small>{{
            canWrite ? 'Provider write scope granted' : 'Read-only administration'
          }}</small>
        </div>
        <div class="button-row">
          <button
            class="button-secondary"
            type="button"
            :disabled="!canRead || providersStore.isBusy"
            @click="providersStore.load()"
          >
            Refresh
          </button>
          <button
            class="button-secondary"
            type="button"
            :disabled="providersStore.isBusy"
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
        <p v-if="providersStore.error" class="error-message" role="alert">
          {{ providersStore.error }}
        </p>

        <section class="workflow-panel" aria-labelledby="capabilities-title">
          <div class="section-heading">
            <div>
              <span class="eyebrow">Implemented adapters</span>
              <h2 id="capabilities-title">Provider capability model</h2>
            </div>
            <span class="status-pill">{{ providersStore.capabilities.length }} adapters</span>
          </div>
          <p v-if="providersStore.loading" role="status">Loading safe provider metadata…</p>
          <div v-else class="capability-grid">
            <article
              v-for="capability in providersStore.capabilities"
              :key="capability.provider_id"
              class="capability-card"
            >
              <strong>{{ providerLabels[capability.provider_id] }}</strong>
              <code>{{ capability.provider_id }}</code>
              <span>{{ capability.formats.join(', ') }}</span>
              <small>
                {{ capability.max_concurrency }} concurrent ·
                {{ Math.round(capability.max_duration_ms / 60_000) }} min max
              </small>
              <div class="capability-flags" aria-label="Supported features">
                <span v-if="capability.hotwords">hotwords</span>
                <span v-if="capability.word_timestamps">word timestamps</span>
                <span v-if="capability.speaker_diarization">speakers</span>
              </div>
            </article>
          </div>
        </section>

        <section class="configuration-grid" aria-label="Provider configuration">
          <article class="workflow-panel">
            <div class="section-heading">
              <div>
                <span class="eyebrow">Pre-ASR vocabulary</span>
                <h2>Create a hotword set</h2>
              </div>
            </div>
            <form class="form-stack" @submit.prevent="submitHotwordSet">
              <label class="field">
                <span>Hotword set name</span>
                <input v-model="hotwordName" maxlength="100" required />
              </label>
              <label class="field">
                <span>Hotword scope</span>
                <select v-model="hotwordScope">
                  <option value="workspace">Workspace</option>
                  <option value="collection">Collection</option>
                  <option value="asset">Asset</option>
                </select>
              </label>
              <label v-if="hotwordScope !== 'workspace'" class="field">
                <span>Hotword scope ID</span>
                <input v-model.trim="hotwordScopeId" autocomplete="off" required />
              </label>
              <label class="field">
                <span>Hotword term</span>
                <input v-model="hotwordTerm" maxlength="30" required />
              </label>
              <label class="field">
                <span>Hotword aliases</span>
                <input v-model="hotwordAliases" placeholder="Voice Asset, Voice Assets" />
                <small>Optional comma-separated exact aliases.</small>
              </label>
              <div class="form-grid">
                <label class="field">
                  <span>Hotword language</span>
                  <input v-model="hotwordLanguage" maxlength="32" required />
                </label>
                <label class="field">
                  <span>Hotword weight</span>
                  <input v-model.number="hotwordWeight" type="number" min="1" max="100" required />
                </label>
              </div>
              <label class="field">
                <span>Hotword description</span>
                <textarea v-model="hotwordDescription" maxlength="500" rows="3" />
              </label>
              <button
                type="submit"
                :disabled="!canWrite || providersStore.isBusy || !hotwordTerm.trim()"
              >
                Create hotword version 1
              </button>
            </form>
          </article>

          <article class="workflow-panel">
            <div class="section-heading">
              <div>
                <span class="eyebrow">Encrypted configuration</span>
                <h2>Create an ASR profile</h2>
              </div>
            </div>
            <form class="form-stack" @submit.prevent="submitProvider">
              <label class="field">
                <span>ASR provider</span>
                <select v-model="providerId">
                  <option value="mock_asr">Mock ASR</option>
                  <option value="aliyun_asr">Alibaba Cloud Flash ASR</option>
                  <option value="tencent_asr">Tencent Cloud Flash ASR</option>
                </select>
              </label>
              <label class="field">
                <span>ASR profile name</span>
                <input v-model="profileName" maxlength="100" required />
              </label>
              <div class="form-grid">
                <label class="field">
                  <span>ASR model</span>
                  <select v-if="selectedCapability?.models.length" v-model="model">
                    <option v-for="item in selectedCapability.models" :key="item" :value="item">
                      {{ item }}
                    </option>
                  </select>
                  <input v-else v-model="model" required />
                </label>
                <label class="field">
                  <span>ASR language</span>
                  <input v-model="asrLanguage" maxlength="100" required />
                </label>
                <label class="field">
                  <span>Audio format</span>
                  <select v-model="audioFormat">
                    <option
                      v-for="format in selectedCapability?.formats ?? [audioFormat]"
                      :key="format"
                      :value="format"
                    >
                      {{ format }}
                    </option>
                  </select>
                </label>
                <label class="field">
                  <span>Sample rate</span>
                  <select v-model.number="sampleRate">
                    <option
                      v-for="rate in selectedCapability?.sample_rates ?? [sampleRate]"
                      :key="rate"
                      :value="rate"
                    >
                      {{ rate }} Hz
                    </option>
                  </select>
                </label>
                <label class="field">
                  <span>Concurrency</span>
                  <input
                    v-model.number="concurrency"
                    type="number"
                    min="1"
                    :max="selectedCapability?.max_concurrency ?? 128"
                    required
                  />
                </label>
                <label class="field">
                  <span>Priority</span>
                  <input v-model.number="priority" type="number" min="1" max="1000" required />
                </label>
                <label class="field">
                  <span>Timeout</span>
                  <input v-model="timeout" maxlength="32" required />
                </label>
                <label class="field">
                  <span>Initial state</span>
                  <select v-model="profileState">
                    <option value="disabled">Disabled</option>
                    <option value="enabled">Enabled</option>
                  </select>
                </label>
              </div>
              <div class="form-grid">
                <label class="field">
                  <span>Retry attempts</span>
                  <input v-model.number="maxAttempts" type="number" min="1" max="10" required />
                </label>
                <label class="field">
                  <span>Retry base delay</span>
                  <input v-model="baseDelay" maxlength="32" required />
                </label>
                <label class="field">
                  <span>Retry maximum delay</span>
                  <input v-model="maxDelay" maxlength="32" required />
                </label>
              </div>
              <fieldset class="scope-picker">
                <legend>Transcript options</legend>
                <label>
                  <input v-model="punctuation" type="checkbox" />
                  <span><strong>Punctuation</strong></span>
                </label>
                <label>
                  <input v-model="timestamps" type="checkbox" />
                  <span><strong>Segment timestamps</strong></span>
                </label>
                <label>
                  <input v-model="wordTimestamps" type="checkbox" />
                  <span><strong>Word timestamps</strong></span>
                </label>
                <label v-if="selectedCapability?.speaker_diarization">
                  <input v-model="speakerDiarization" type="checkbox" />
                  <span><strong>Speaker diarization</strong></span>
                </label>
                <label v-if="selectedCapability?.number_normalization">
                  <input v-model="numberNormalization" type="checkbox" />
                  <span><strong>Number normalization</strong></span>
                </label>
              </fieldset>
              <label v-if="selectedCapability?.hotwords" class="field">
                <span>ASR hotword set</span>
                <select v-model="profileHotwordSetId">
                  <option value="">No managed set</option>
                  <option v-for="set in availableHotwordSets" :key="set.id" :value="set.id">
                    {{ set.display_name }} (v{{ set.current_version }})
                  </option>
                </select>
              </label>

              <section v-if="providerId !== 'mock_asr'" class="credential-panel">
                <strong>Write-only credential</strong>
                <p>Sent once over the secure session, encrypted by Server, then cleared here.</p>
                <template v-if="providerId === 'aliyun_asr'">
                  <label class="field">
                    <span>Alibaba AppKey</span>
                    <input v-model="aliyunAppKey" autocomplete="off" required />
                  </label>
                  <label class="field">
                    <span>Alibaba vocabulary ID</span>
                    <input v-model="aliyunVocabularyId" autocomplete="off" />
                  </label>
                  <label class="field">
                    <span>Alibaba credential scheme</span>
                    <select v-model="aliyunCredentialMode">
                      <option value="access-token">NLS access token</option>
                      <option value="access-key">AccessKey pair</option>
                    </select>
                  </label>
                  <label v-if="aliyunCredentialMode === 'access-token'" class="field">
                    <span>Alibaba access token</span>
                    <input
                      v-model="aliyunAccessToken"
                      type="password"
                      minlength="8"
                      maxlength="4096"
                      autocomplete="new-password"
                      required
                    />
                  </label>
                  <template v-else>
                    <label class="field">
                      <span>Alibaba AccessKey ID</span>
                      <input
                        v-model="aliyunAccessKeyId"
                        type="password"
                        minlength="8"
                        maxlength="4096"
                        autocomplete="new-password"
                        required
                      />
                    </label>
                    <label class="field">
                      <span>Alibaba AccessKey secret</span>
                      <input
                        v-model="aliyunAccessKeySecret"
                        type="password"
                        minlength="8"
                        maxlength="4096"
                        autocomplete="new-password"
                        required
                      />
                    </label>
                  </template>
                </template>
                <template v-else>
                  <label class="field">
                    <span>Tencent AppID</span>
                    <input v-model="tencentAppId" autocomplete="off" required />
                  </label>
                  <label class="field">
                    <span>Tencent hotword ID</span>
                    <input v-model="tencentHotwordId" autocomplete="off" />
                  </label>
                  <label class="field">
                    <span>Tencent SecretId</span>
                    <input
                      v-model="tencentSecretId"
                      type="password"
                      minlength="8"
                      maxlength="4096"
                      autocomplete="new-password"
                      required
                    />
                  </label>
                  <label class="field">
                    <span>Tencent SecretKey</span>
                    <input
                      v-model="tencentSecretKey"
                      type="password"
                      minlength="8"
                      maxlength="4096"
                      autocomplete="new-password"
                      required
                    />
                  </label>
                </template>
              </section>
              <button
                type="submit"
                :disabled="
                  !canWrite ||
                  providersStore.isBusy ||
                  !profileName.trim() ||
                  !credentialReady ||
                  !vendorConfigurationReady
                "
              >
                Create ASR profile
              </button>
            </form>
          </article>
        </section>

        <section class="configuration-grid" aria-label="Managed provider resources">
          <article class="workflow-panel">
            <div class="section-heading">
              <div>
                <span class="eyebrow">Immutable versions</span>
                <h2>Hotword sets</h2>
              </div>
              <span class="status-pill">{{ providersStore.hotwordSets.length }} sets</span>
            </div>
            <ul v-if="providersStore.hotwordSets.length" class="management-list">
              <li v-for="set in providersStore.hotwordSets" :key="set.id">
                <div>
                  <strong>{{ set.display_name }}</strong>
                  <small>
                    {{ set.scope_type }} · v{{ set.current_version }} ·
                    {{ set.entries.length }} entries
                  </small>
                </div>
                <span class="status-pill">{{ set.state }}</span>
                <div class="button-row">
                  <button
                    class="button-secondary button-compact"
                    type="button"
                    :disabled="!canWrite || providersStore.isBusy"
                    :aria-label="`${set.state === 'enabled' ? 'Disable' : 'Enable'} ${set.display_name}`"
                    @click="
                      providersStore.setHotwordState(
                        set.id,
                        set.state === 'enabled' ? 'disabled' : 'enabled',
                      )
                    "
                  >
                    {{ set.state === 'enabled' ? 'Disable' : 'Enable' }}
                  </button>
                </div>
              </li>
            </ul>
            <p v-else>No hotword sets have been created.</p>

            <form class="form-stack nested-form" @submit.prevent="publishHotwordVersion">
              <h3>Publish a replacement version</h3>
              <p>Publishing replaces the complete entry list; prior versions stay immutable.</p>
              <label class="field">
                <span>Version target</span>
                <select v-model="versionTargetId" required>
                  <option value="" disabled>Select a set</option>
                  <option v-for="set in providersStore.hotwordSets" :key="set.id" :value="set.id">
                    {{ set.display_name }} (v{{ set.current_version }})
                  </option>
                </select>
              </label>
              <label class="field">
                <span>Replacement term</span>
                <input v-model="versionTerm" maxlength="30" required />
              </label>
              <label class="field">
                <span>Replacement aliases</span>
                <input v-model="versionAliases" />
              </label>
              <div class="form-grid">
                <label class="field">
                  <span>Replacement language</span>
                  <input v-model="versionLanguage" required />
                </label>
                <label class="field">
                  <span>Replacement weight</span>
                  <input v-model.number="versionWeight" type="number" min="1" max="100" required />
                </label>
              </div>
              <button
                type="submit"
                :disabled="
                  !canWrite || providersStore.isBusy || !versionTargetId || !versionTerm.trim()
                "
              >
                Publish hotword version
              </button>
            </form>
          </article>

          <article class="workflow-panel">
            <div class="section-heading">
              <div>
                <span class="eyebrow">Credential-free inventory</span>
                <h2>ASR profiles</h2>
              </div>
              <span class="status-pill">{{ providersStore.profiles.length }} profiles</span>
            </div>
            <ul v-if="providersStore.profiles.length" class="management-list">
              <li v-for="profile in providersStore.profiles" :key="profile.id">
                <div>
                  <strong>{{ profile.display_name }}</strong>
                  <small>
                    {{ profile.provider_id }} · priority {{ profile.priority }} · v{{
                      profile.version
                    }}
                  </small>
                  <small>
                    {{
                      profile.secret_configured
                        ? 'encrypted credential configured'
                        : 'no credential required'
                    }}
                  </small>
                </div>
                <span class="status-pill">{{ profile.state }}</span>
                <div class="button-row">
                  <button
                    class="button-secondary button-compact"
                    type="button"
                    :disabled="providersStore.isBusy"
                    :aria-label="`Check health for ${profile.display_name}`"
                    @click="providersStore.checkProvider(profile.id)"
                  >
                    {{ providersStore.health[profile.id]?.status ?? 'Check health' }}
                  </button>
                  <button
                    class="button-secondary button-compact"
                    type="button"
                    :disabled="!canWrite || providersStore.isBusy"
                    :aria-label="`${profile.state === 'enabled' ? 'Disable' : 'Enable'} ${profile.display_name}`"
                    @click="
                      providersStore.setProviderState(
                        profile.id,
                        profile.state === 'enabled' ? 'disabled' : 'enabled',
                      )
                    "
                  >
                    {{ profile.state === 'enabled' ? 'Disable' : 'Enable' }}
                  </button>
                  <button
                    v-if="profile.provider_id !== 'mock_asr'"
                    class="button-secondary button-compact"
                    type="button"
                    :disabled="!canWrite || providersStore.isBusy"
                    :aria-label="`Rotate credentials for ${profile.display_name}`"
                    @click="beginRotation(profile)"
                  >
                    Rotate credential
                  </button>
                </div>
              </li>
            </ul>
            <p v-else>No ASR profiles have been created.</p>

            <form
              v-if="rotationProfile"
              class="form-stack credential-panel nested-form"
              @submit.prevent="rotateCredentials"
            >
              <h3>Rotate {{ rotationProfile.display_name }}</h3>
              <p>The current credential cannot be displayed. Submission atomically replaces it.</p>
              <template v-if="rotationProfile.provider_id === 'aliyun_asr'">
                <label class="field">
                  <span>Rotation credential scheme</span>
                  <select v-model="rotationAliyunMode">
                    <option value="access-token">NLS access token</option>
                    <option value="access-key">AccessKey pair</option>
                  </select>
                </label>
                <label v-if="rotationAliyunMode === 'access-token'" class="field">
                  <span>New Alibaba access token</span>
                  <input
                    v-model="rotationAliyunToken"
                    type="password"
                    minlength="8"
                    autocomplete="new-password"
                    required
                  />
                </label>
                <template v-else>
                  <label class="field">
                    <span>New Alibaba AccessKey ID</span>
                    <input
                      v-model="rotationAliyunKeyId"
                      type="password"
                      minlength="8"
                      autocomplete="new-password"
                      required
                    />
                  </label>
                  <label class="field">
                    <span>New Alibaba AccessKey secret</span>
                    <input
                      v-model="rotationAliyunKeySecret"
                      type="password"
                      minlength="8"
                      autocomplete="new-password"
                      required
                    />
                  </label>
                </template>
              </template>
              <template v-else>
                <label class="field">
                  <span>New Tencent SecretId</span>
                  <input
                    v-model="rotationTencentSecretId"
                    type="password"
                    minlength="8"
                    autocomplete="new-password"
                    required
                  />
                </label>
                <label class="field">
                  <span>New Tencent SecretKey</span>
                  <input
                    v-model="rotationTencentSecretKey"
                    type="password"
                    minlength="8"
                    autocomplete="new-password"
                    required
                  />
                </label>
              </template>
              <div class="button-row">
                <button type="submit" :disabled="providersStore.isBusy">Replace credential</button>
                <button class="button-secondary" type="button" @click="cancelRotation">
                  Cancel
                </button>
              </div>
            </form>
          </article>
        </section>
      </template>
    </template>
  </div>
</template>
