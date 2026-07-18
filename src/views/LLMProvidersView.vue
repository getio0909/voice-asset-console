<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import type {
  CreateLLMProfileRequest,
  GlossaryEntry,
  GlossaryScope,
  LLMConfig,
  LLMCredentials,
  LLMProviderId,
  ResourceState,
} from '@/api/client'
import { useAssetsStore } from '@/stores/assets'
import { useConsoleStore } from '@/stores/console'
import { useLLMProvidersStore } from '@/stores/llmProviders'

interface HeaderRow {
  name: string
  value: string
}

const providerLabels: Readonly<Record<LLMProviderId, string>> = Object.freeze({
  mock_llm: 'Mock LLM',
  openai_compatible_llm: 'OpenAI-compatible LLM',
})

const assetsStore = useAssetsStore()
const consoleStore = useConsoleStore()
const llmStore = useLLMProvidersStore()

const glossaryName = ref('Product terminology')
const glossaryScope = ref<GlossaryScope>('workspace')
const glossaryScopeId = ref('')
const glossaryCanonical = ref('')
const glossaryAliases = ref('')
const glossaryLanguage = ref('zh-CN')
const glossaryContexts = ref('')
const glossaryForbiddenContexts = ref('')
const glossaryRegex = ref(false)
const glossaryCaseSensitive = ref(false)
const glossaryPriority = ref(100)
const glossaryDescription = ref('')

const versionTargetId = ref('')
const versionCanonical = ref('')
const versionAliases = ref('')
const versionLanguage = ref('zh-CN')
const versionPriority = ref(100)

const providerId = ref<LLMProviderId>('mock_llm')
const profileName = ref('')
const baseUrl = ref('')
const model = ref('')
const timeout = ref('1m')
const concurrency = ref(1)
const temperature = ref(0)
const contextLimit = ref(8_000)
const promptTemplate = ref('Return a structured correction patch using the supplied glossary.')
const defaultGlossaryId = ref('')
const autoApprovalPolicy = ref<LLMConfig['auto_approval_policy']>('never')
const profilePriority = ref(100)
const profileState = ref<ResourceState>('enabled')
const apiKey = ref('')
const customHeaders = ref<HeaderRow[]>([])

const rotationProfileId = ref('')
const rotationApiKey = ref('')
const rotationHeaderValues = ref<Record<string, string>>({})

const canRead = computed(() => assetsStore.user?.scopes.includes('admin:read') ?? false)
const canWrite = computed(() => assetsStore.user?.scopes.includes('admin:write') ?? false)
const selectedCapability = computed(() =>
  llmStore.capabilities.find((capability) => capability.provider_id === providerId.value),
)
const enabledGlossaries = computed(() =>
  llmStore.glossaries.filter((glossary) => glossary.state === 'enabled'),
)
const rotationProfile = computed(() =>
  llmStore.profiles.find((profile) => profile.id === rotationProfileId.value),
)
const createCredentialReady = computed(
  () =>
    providerId.value === 'mock_llm' ||
    (apiKey.value.length >= 8 &&
      customHeaders.value.every((header) => header.name.trim() && header.value)),
)
const rotationCredentialReady = computed(() => {
  const profile = rotationProfile.value
  if (!profile || rotationApiKey.value.length < 8) return false
  return (profile.config.custom_header_names ?? []).every(
    (name) => rotationHeaderValues.value[name],
  )
})

function listFrom(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ]
}

function glossaryEntry(
  canonical: string,
  aliases: string,
  language: string,
  priority: number,
  extras: {
    contexts?: string
    forbiddenContexts?: string
    regex?: boolean
    caseSensitive?: boolean
    description?: string
  } = {},
): GlossaryEntry {
  const contexts = listFrom(extras.contexts ?? '')
  const forbiddenContexts = listFrom(extras.forbiddenContexts ?? '')
  return {
    canonical_form: canonical.trim(),
    aliases: listFrom(aliases),
    language: language.trim(),
    ...(contexts.length ? { context_terms: contexts } : {}),
    ...(forbiddenContexts.length ? { forbidden_contexts: forbiddenContexts } : {}),
    regex: extras.regex ?? false,
    case_sensitive: extras.caseSensitive ?? false,
    priority,
    ...(extras.description?.trim() ? { description: extras.description.trim() } : {}),
  }
}

function clearCreateSecrets(): void {
  apiKey.value = ''
  customHeaders.value = []
}

function clearRotationSecrets(): void {
  rotationApiKey.value = ''
  rotationHeaderValues.value = {}
}

function applyProviderDefaults(nextProvider: LLMProviderId): void {
  clearCreateSecrets()
  defaultGlossaryId.value = ''
  autoApprovalPolicy.value = 'never'
  temperature.value = 0
  timeout.value = '1m'
  promptTemplate.value = 'Return a structured correction patch using the supplied glossary.'
  if (nextProvider === 'mock_llm') {
    profileName.value = 'Mock LLM'
    baseUrl.value = ''
    model.value = 'deterministic_glossary_v1'
    concurrency.value = 32
    contextLimit.value = 32_000
    profileState.value = 'enabled'
    return
  }
  profileName.value = 'OpenAI-compatible LLM'
  baseUrl.value = 'https://api.example.com/v1'
  model.value = 'gpt-4.1-mini'
  concurrency.value = 2
  contextLimit.value = 128_000
  profileState.value = 'disabled'
}

function addCustomHeader(): void {
  if (customHeaders.value.length < 20) customHeaders.value.push({ name: '', value: '' })
}

function removeCustomHeader(index: number): void {
  customHeaders.value.splice(index, 1)
}

function profileConfig(): LLMConfig {
  const headerNames = customHeaders.value.map((header) => header.name.trim()).filter(Boolean)
  return {
    ...(providerId.value === 'openai_compatible_llm' ? { base_url: baseUrl.value } : {}),
    model: model.value,
    ...(headerNames.length ? { custom_header_names: headerNames } : {}),
    timeout: timeout.value,
    concurrency: concurrency.value,
    temperature: temperature.value,
    context_limit: contextLimit.value,
    structured_output: true,
    prompt_template: promptTemplate.value,
    ...(defaultGlossaryId.value ? { default_glossary_id: defaultGlossaryId.value } : {}),
    auto_approval_policy: autoApprovalPolicy.value,
  }
}

function createCredentials(): LLMCredentials {
  const headers = Object.fromEntries(
    customHeaders.value.map((header) => [header.name.trim(), header.value]),
  )
  return {
    api_key: apiKey.value,
    ...(customHeaders.value.length ? { custom_headers: headers } : {}),
  }
}

async function submitGlossary(): Promise<void> {
  const created = await llmStore.createGlossary({
    display_name: glossaryName.value,
    scope_type: glossaryScope.value,
    ...(glossaryScope.value === 'workspace' ? {} : { scope_id: glossaryScopeId.value }),
    state: 'enabled',
    entries: [
      glossaryEntry(
        glossaryCanonical.value,
        glossaryAliases.value,
        glossaryLanguage.value,
        glossaryPriority.value,
        {
          contexts: glossaryContexts.value,
          forbiddenContexts: glossaryForbiddenContexts.value,
          regex: glossaryRegex.value,
          caseSensitive: glossaryCaseSensitive.value,
          description: glossaryDescription.value,
        },
      ),
    ],
  })
  if (created) {
    glossaryCanonical.value = ''
    glossaryAliases.value = ''
    glossaryContexts.value = ''
    glossaryForbiddenContexts.value = ''
    glossaryDescription.value = ''
  }
}

async function publishGlossaryVersion(): Promise<void> {
  const published = await llmStore.publishGlossaryVersion(versionTargetId.value, {
    entries: [
      glossaryEntry(
        versionCanonical.value,
        versionAliases.value,
        versionLanguage.value,
        versionPriority.value,
      ),
    ],
  })
  if (published) {
    versionCanonical.value = ''
    versionAliases.value = ''
  }
}

async function submitProfile(): Promise<void> {
  const base = {
    display_name: profileName.value,
    config: profileConfig(),
    state: profileState.value,
    priority: profilePriority.value,
  }
  const input: CreateLLMProfileRequest =
    providerId.value === 'mock_llm'
      ? { ...base, provider_id: 'mock_llm' }
      : {
          ...base,
          provider_id: 'openai_compatible_llm',
          credentials: createCredentials(),
        }
  if (await llmStore.createProfile(input)) clearCreateSecrets()
}

function beginRotation(profile: {
  readonly id: string
  readonly config: { readonly custom_header_names?: readonly string[] }
}): void {
  clearRotationSecrets()
  rotationProfileId.value = profile.id
  rotationHeaderValues.value = Object.fromEntries(
    (profile.config.custom_header_names ?? []).map((name) => [name, '']),
  )
}

function cancelRotation(): void {
  clearRotationSecrets()
  rotationProfileId.value = ''
}

async function rotateCredentials(): Promise<void> {
  const profile = rotationProfile.value
  if (!profile || profile.provider_id !== 'openai_compatible_llm') return
  const names = profile.config.custom_header_names ?? []
  const credentials: LLMCredentials = {
    api_key: rotationApiKey.value,
    ...(names.length ? { custom_headers: { ...rotationHeaderValues.value } } : {}),
  }
  if (await llmStore.rotateCredentials(profile.id, credentials)) cancelRotation()
}

async function logout(): Promise<void> {
  clearCreateSecrets()
  cancelRotation()
  llmStore.reset()
  await assetsStore.logout()
}

watch(providerId, applyProviderDefaults, { immediate: true })

onMounted(async () => {
  const authenticated =
    assetsStore.sessionStatus === 'authenticated' || (await assetsStore.restoreSession())
  if (authenticated && canRead.value) await llmStore.load()
})

onBeforeUnmount(() => {
  clearCreateSecrets()
  clearRotationSecrets()
})
</script>

<template>
  <div class="page-stack">
    <header class="page-heading">
      <span class="eyebrow">Manual-review corrections</span>
      <h1>LLM providers &amp; glossaries</h1>
      <p>
        Publish immutable correction vocabulary and manage write-only LLM credentials. Generated
        patches still require a reviewer in the Correction workflow.
      </p>
    </header>

    <aside v-if="!consoleStore.isReady" class="connection-warning" role="status">
      <strong>Server compatibility: {{ consoleStore.apiStatus }}</strong>
      <span>{{ consoleStore.compatibilityIssue ?? 'Waiting for capability negotiation.' }}</span>
    </aside>

    <section v-if="assetsStore.sessionStatus === 'checking'" class="workflow-panel" role="status">
      <span class="eyebrow">Session</span>
      <h2>Checking the secure web session</h2>
      <p>LLM API keys and custom header values remain write-only.</p>
    </section>

    <section v-else-if="!assetsStore.isAuthenticated" class="empty-state">
      <span class="empty-state__mark" aria-hidden="true">04</span>
      <h2>Sign in before managing LLM providers</h2>
      <p>Use the Assets workspace to establish the same HttpOnly server session.</p>
      <RouterLink class="text-link" to="/assets">Go to secure sign in</RouterLink>
    </section>

    <template v-else>
      <section class="session-bar" aria-label="Current session">
        <div>
          <span class="eyebrow">Signed in</span>
          <strong>{{ assetsStore.user?.email }}</strong>
          <small>{{ canWrite ? 'LLM write scope granted' : 'Read-only administration' }}</small>
        </div>
        <div class="button-row">
          <button
            class="button-secondary"
            type="button"
            :disabled="!canRead || llmStore.isBusy"
            @click="llmStore.load()"
          >
            Refresh
          </button>
          <button
            class="button-secondary"
            type="button"
            :disabled="llmStore.isBusy"
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
        <p v-if="llmStore.error" class="error-message" role="alert">{{ llmStore.error }}</p>

        <section class="workflow-panel" aria-labelledby="llm-capabilities-title">
          <div class="section-heading">
            <div>
              <span class="eyebrow">Implemented adapters</span>
              <h2 id="llm-capabilities-title">LLM capability model</h2>
            </div>
            <span class="status-pill">{{ llmStore.capabilities.length }} adapters</span>
          </div>
          <p v-if="llmStore.loading" role="status">Loading safe LLM metadata…</p>
          <div v-else class="capability-grid">
            <article
              v-for="capability in llmStore.capabilities"
              :key="capability.provider_id"
              class="capability-card"
            >
              <strong>{{ providerLabels[capability.provider_id] }}</strong>
              <code>{{ capability.provider_id }}</code>
              <small>
                {{ capability.max_concurrency }} concurrent ·
                {{ capability.max_context_tokens.toLocaleString() }} context tokens
              </small>
              <div class="capability-flags" aria-label="Supported features">
                <span v-if="capability.structured_patch">structured patch</span>
                <span v-if="capability.custom_headers">custom headers</span>
              </div>
            </article>
          </div>
        </section>

        <section class="configuration-grid" aria-label="LLM configuration">
          <article class="workflow-panel">
            <div class="section-heading">
              <div>
                <span class="eyebrow">Correction vocabulary</span>
                <h2>Create a glossary set</h2>
              </div>
            </div>
            <form class="form-stack" @submit.prevent="submitGlossary">
              <label class="field">
                <span>Glossary set name</span>
                <input v-model="glossaryName" maxlength="120" required />
              </label>
              <div class="form-grid">
                <label class="field">
                  <span>Scope</span>
                  <select v-model="glossaryScope">
                    <option value="workspace">Workspace</option>
                    <option value="collection">Collection</option>
                    <option value="asset">Asset</option>
                  </select>
                </label>
                <label v-if="glossaryScope !== 'workspace'" class="field">
                  <span>Scope UUID</span>
                  <input v-model="glossaryScopeId" autocomplete="off" required />
                </label>
              </div>
              <label class="field">
                <span>Canonical form</span>
                <input v-model="glossaryCanonical" maxlength="200" required />
              </label>
              <label class="field">
                <span>Aliases (comma-separated)</span>
                <input v-model="glossaryAliases" required />
              </label>
              <div class="form-grid">
                <label class="field">
                  <span>Language</span>
                  <input v-model="glossaryLanguage" required />
                </label>
                <label class="field">
                  <span>Priority</span>
                  <input
                    v-model.number="glossaryPriority"
                    type="number"
                    min="1"
                    max="1000"
                    required
                  />
                </label>
              </div>
              <label class="field">
                <span>Required context terms (comma-separated)</span>
                <input v-model="glossaryContexts" />
              </label>
              <label class="field">
                <span>Forbidden contexts (comma-separated)</span>
                <input v-model="glossaryForbiddenContexts" />
              </label>
              <label class="field">
                <span>Description</span>
                <input v-model="glossaryDescription" maxlength="500" />
              </label>
              <div class="button-row">
                <label><input v-model="glossaryRegex" type="checkbox" /> Regular expression</label>
                <label
                  ><input v-model="glossaryCaseSensitive" type="checkbox" /> Case-sensitive</label
                >
              </div>
              <button
                type="submit"
                :disabled="
                  !canWrite ||
                  llmStore.isBusy ||
                  !glossaryCanonical.trim() ||
                  !glossaryAliases.trim()
                "
              >
                Create glossary set
              </button>
            </form>
          </article>

          <article class="workflow-panel">
            <div class="section-heading">
              <div>
                <span class="eyebrow">Encrypted configuration</span>
                <h2>Create an LLM profile</h2>
              </div>
            </div>
            <form class="form-stack" @submit.prevent="submitProfile">
              <label class="field">
                <span>LLM provider</span>
                <select v-model="providerId">
                  <option value="mock_llm">Mock LLM</option>
                  <option value="openai_compatible_llm">OpenAI-compatible LLM</option>
                </select>
              </label>
              <label class="field">
                <span>Profile name</span>
                <input v-model="profileName" maxlength="120" required />
              </label>
              <label v-if="providerId === 'openai_compatible_llm'" class="field">
                <span>HTTPS base URL</span>
                <input v-model="baseUrl" type="url" required />
              </label>
              <label class="field">
                <span>Model</span>
                <input v-model="model" :readonly="providerId === 'mock_llm'" required />
              </label>
              <div class="form-grid">
                <label class="field">
                  <span>Timeout</span>
                  <input v-model="timeout" required />
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
                  <span>Temperature</span>
                  <input
                    v-model.number="temperature"
                    type="number"
                    min="0"
                    max="1"
                    step="0.1"
                    required
                  />
                </label>
                <label class="field">
                  <span>Context limit</span>
                  <input
                    v-model.number="contextLimit"
                    type="number"
                    min="1000"
                    :max="selectedCapability?.max_context_tokens ?? 1000000"
                    required
                  />
                </label>
              </div>
              <label class="field">
                <span>Prompt template</span>
                <input v-model="promptTemplate" maxlength="8000" required />
              </label>
              <label class="field">
                <span>Default glossary</span>
                <select v-model="defaultGlossaryId">
                  <option value="">No default glossary</option>
                  <option
                    v-for="glossary in enabledGlossaries"
                    :key="glossary.id"
                    :value="glossary.id"
                  >
                    {{ glossary.display_name }} (v{{ glossary.current_version }})
                  </option>
                </select>
              </label>
              <label class="field">
                <span>Auto-approval policy</span>
                <select v-model="autoApprovalPolicy">
                  <option value="never">Never — require manual review</option>
                  <option value="validated_glossary_only">Validated glossary changes only</option>
                </select>
              </label>
              <div class="form-grid">
                <label class="field">
                  <span>Priority</span>
                  <input
                    v-model.number="profilePriority"
                    type="number"
                    min="1"
                    max="1000"
                    required
                  />
                </label>
                <label class="field">
                  <span>Initial state</span>
                  <select v-model="profileState">
                    <option value="enabled">Enabled</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </label>
              </div>
              <aside class="connection-warning">
                <strong>
                  {{
                    autoApprovalPolicy === 'never'
                      ? 'Manual review enforced'
                      : 'Conservative automation enabled'
                  }}
                </strong>
                <span v-if="autoApprovalPolicy === 'never'">
                  Every correction remains pending until a reviewer approves it.
                </span>
                <span v-else>
                  Server approves only non-empty changes that exactly match an immutable glossary
                  snapshot and pass every semantic safety check; all other results remain pending.
                </span>
              </aside>

              <section v-if="providerId === 'openai_compatible_llm'" class="credential-panel">
                <strong>Write-only credentials</strong>
                <p>Values are encrypted by Server and never returned to this browser.</p>
                <label class="field">
                  <span>API key</span>
                  <input
                    v-model="apiKey"
                    type="password"
                    minlength="8"
                    maxlength="4096"
                    autocomplete="new-password"
                    required
                  />
                </label>
                <div v-for="(header, index) in customHeaders" :key="index" class="form-grid">
                  <label class="field">
                    <span>Custom header name {{ index + 1 }}</span>
                    <input v-model="header.name" maxlength="100" autocomplete="off" required />
                  </label>
                  <label class="field">
                    <span>Custom header value {{ index + 1 }}</span>
                    <input
                      v-model="header.value"
                      type="password"
                      maxlength="4096"
                      autocomplete="new-password"
                      required
                    />
                  </label>
                  <button
                    class="button-secondary button-compact"
                    type="button"
                    :aria-label="`Remove custom header ${index + 1}`"
                    @click="removeCustomHeader(index)"
                  >
                    Remove header
                  </button>
                </div>
                <button
                  class="button-secondary"
                  type="button"
                  :disabled="customHeaders.length >= 20"
                  @click="addCustomHeader"
                >
                  Add custom header
                </button>
              </section>
              <button
                type="submit"
                :disabled="
                  !canWrite || llmStore.isBusy || !profileName.trim() || !createCredentialReady
                "
              >
                Create LLM profile
              </button>
            </form>
          </article>
        </section>

        <section class="configuration-grid" aria-label="Managed LLM resources">
          <article class="workflow-panel">
            <div class="section-heading">
              <div>
                <span class="eyebrow">Immutable versions</span>
                <h2>Glossary sets</h2>
              </div>
              <span class="status-pill">{{ llmStore.glossaries.length }} sets</span>
            </div>
            <ul v-if="llmStore.glossaries.length" class="management-list">
              <li v-for="glossary in llmStore.glossaries" :key="glossary.id">
                <div>
                  <strong>{{ glossary.display_name }}</strong>
                  <small>
                    {{ glossary.scope_type }} · v{{ glossary.current_version }} ·
                    {{ glossary.entries.length }} entries
                  </small>
                </div>
                <span class="status-pill">{{ glossary.state }}</span>
                <div class="button-row">
                  <button
                    class="button-secondary button-compact"
                    type="button"
                    :disabled="!canWrite || llmStore.isBusy"
                    :aria-label="`${glossary.state === 'enabled' ? 'Disable' : 'Enable'} ${glossary.display_name}`"
                    @click="
                      llmStore.setGlossaryState(
                        glossary.id,
                        glossary.state === 'enabled' ? 'disabled' : 'enabled',
                      )
                    "
                  >
                    {{ glossary.state === 'enabled' ? 'Disable' : 'Enable' }}
                  </button>
                </div>
              </li>
            </ul>
            <p v-else>No glossary sets have been created.</p>

            <form class="form-stack nested-form" @submit.prevent="publishGlossaryVersion">
              <h3>Publish a replacement version</h3>
              <p>Publishing replaces the complete entry list; prior versions stay immutable.</p>
              <label class="field">
                <span>Version target</span>
                <select v-model="versionTargetId" required>
                  <option value="" disabled>Select a glossary</option>
                  <option
                    v-for="glossary in llmStore.glossaries"
                    :key="glossary.id"
                    :value="glossary.id"
                  >
                    {{ glossary.display_name }} (v{{ glossary.current_version }})
                  </option>
                </select>
              </label>
              <label class="field">
                <span>Replacement canonical form</span>
                <input v-model="versionCanonical" maxlength="200" required />
              </label>
              <label class="field">
                <span>Replacement aliases</span>
                <input v-model="versionAliases" required />
              </label>
              <div class="form-grid">
                <label class="field">
                  <span>Replacement language</span>
                  <input v-model="versionLanguage" required />
                </label>
                <label class="field">
                  <span>Replacement priority</span>
                  <input
                    v-model.number="versionPriority"
                    type="number"
                    min="1"
                    max="1000"
                    required
                  />
                </label>
              </div>
              <button
                type="submit"
                :disabled="
                  !canWrite ||
                  llmStore.isBusy ||
                  !versionTargetId ||
                  !versionCanonical.trim() ||
                  !versionAliases.trim()
                "
              >
                Publish glossary version
              </button>
            </form>
          </article>

          <article class="workflow-panel">
            <div class="section-heading">
              <div>
                <span class="eyebrow">Credential-free inventory</span>
                <h2>LLM profiles</h2>
              </div>
              <span class="status-pill">{{ llmStore.profiles.length }} profiles</span>
            </div>
            <ul v-if="llmStore.profiles.length" class="management-list">
              <li v-for="profile in llmStore.profiles" :key="profile.id">
                <div>
                  <strong>{{ profile.display_name }}</strong>
                  <small>
                    {{ profile.provider_id }} · {{ profile.config.model }} · priority
                    {{ profile.priority }} · v{{ profile.version }}
                  </small>
                  <small>
                    {{
                      profile.secret_configured
                        ? 'encrypted credential configured'
                        : 'no credential required'
                    }}
                  </small>
                  <small>policy: {{ profile.config.auto_approval_policy }}</small>
                </div>
                <span class="status-pill">{{ profile.state }}</span>
                <div class="button-row">
                  <button
                    class="button-secondary button-compact"
                    type="button"
                    :disabled="llmStore.isBusy"
                    :aria-label="`Check health for ${profile.display_name}`"
                    @click="llmStore.checkProfile(profile.id)"
                  >
                    {{ llmStore.health[profile.id]?.status ?? 'Check health' }}
                  </button>
                  <button
                    class="button-secondary button-compact"
                    type="button"
                    :disabled="!canWrite || llmStore.isBusy"
                    :aria-label="`${profile.state === 'enabled' ? 'Disable' : 'Enable'} ${profile.display_name}`"
                    @click="
                      llmStore.setProfileState(
                        profile.id,
                        profile.state === 'enabled' ? 'disabled' : 'enabled',
                      )
                    "
                  >
                    {{ profile.state === 'enabled' ? 'Disable' : 'Enable' }}
                  </button>
                  <button
                    class="button-secondary button-compact"
                    type="button"
                    :disabled="!canWrite || llmStore.isBusy"
                    :aria-label="`${
                      profile.config.auto_approval_policy === 'never'
                        ? 'Enable glossary-only auto-approval for'
                        : 'Require manual review for'
                    } ${profile.display_name}`"
                    @click="
                      llmStore.setAutoApprovalPolicy(
                        profile.id,
                        profile.config.auto_approval_policy === 'never'
                          ? 'validated_glossary_only'
                          : 'never',
                      )
                    "
                  >
                    {{
                      profile.config.auto_approval_policy === 'never'
                        ? 'Enable glossary-only auto-approval'
                        : 'Require manual review'
                    }}
                  </button>
                  <button
                    v-if="profile.provider_id === 'openai_compatible_llm'"
                    class="button-secondary button-compact"
                    type="button"
                    :disabled="!canWrite || llmStore.isBusy"
                    :aria-label="`Rotate credentials for ${profile.display_name}`"
                    @click="beginRotation(profile)"
                  >
                    Rotate credential
                  </button>
                </div>
              </li>
            </ul>
            <p v-else>No LLM profiles have been created.</p>

            <form
              v-if="rotationProfile"
              class="form-stack credential-panel nested-form"
              @submit.prevent="rotateCredentials"
            >
              <h3>Rotate {{ rotationProfile.display_name }}</h3>
              <p>The current credential cannot be displayed. Submission atomically replaces it.</p>
              <label class="field">
                <span>New API key</span>
                <input
                  v-model="rotationApiKey"
                  type="password"
                  minlength="8"
                  maxlength="4096"
                  autocomplete="new-password"
                  required
                />
              </label>
              <label
                v-for="name in rotationProfile.config.custom_header_names ?? []"
                :key="name"
                class="field"
              >
                <span>New {{ name }} value</span>
                <input
                  v-model="rotationHeaderValues[name]"
                  type="password"
                  maxlength="4096"
                  autocomplete="new-password"
                  required
                />
              </label>
              <div class="button-row">
                <button type="submit" :disabled="llmStore.isBusy || !rotationCredentialReady">
                  Replace credential
                </button>
                <button class="button-secondary" type="button" @click="cancelRotation">
                  Cancel
                </button>
              </div>
            </form>

            <RouterLink class="text-link" to="/corrections">Open correction review</RouterLink>
          </article>
        </section>
      </template>
    </template>
  </div>
</template>
