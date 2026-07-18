import { computed, readonly, ref } from 'vue'
import { defineStore } from 'pinia'

import { ApiError, apiClient } from '@/api/client'
import type {
  AddGlossarySetVersionRequest,
  CreateGlossarySetRequest,
  CreateLLMProfileRequest,
  GlossarySet,
  GlossarySetList,
  LLMCapabilities,
  LLMCapabilitiesList,
  LLMConfig,
  LLMCredentials,
  LLMHealth,
  LLMProfile,
  LLMProfileList,
  ResourceState,
  UpdateLLMProfileRequest,
} from '@/api/client'

const REQUIRED_PROVIDER_IDS: LLMCapabilities['provider_id'][] = [
  'mock_llm',
  'openai_compatible_llm',
]

export interface LLMAdminClient {
  listLLMProviderCapabilities(): Promise<LLMCapabilitiesList>
  listLLMProfiles(): Promise<LLMProfileList>
  listGlossarySets(): Promise<GlossarySetList>
  createLLMProfile(input: CreateLLMProfileRequest): Promise<LLMProfile>
  updateLLMProfile(
    profileId: string,
    providerId: LLMProfile['provider_id'],
    version: number,
    input: UpdateLLMProfileRequest,
  ): Promise<LLMProfile>
  checkLLMProfileHealth(profileId: string): Promise<LLMHealth>
  createGlossarySet(input: CreateGlossarySetRequest): Promise<GlossarySet>
  createGlossarySetVersion(
    glossarySetId: string,
    resourceVersion: number,
    input: AddGlossarySetVersionRequest,
  ): Promise<GlossarySet>
  updateGlossarySet(
    glossarySetId: string,
    resourceVersion: number,
    state: ResourceState,
  ): Promise<GlossarySet>
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const request = error.requestId ? ` Request ID: ${error.requestId}.` : ''
    return `${error.message}${request}`
  }
  if (error instanceof Error && error.message.trim()) return error.message
  return 'The LLM administration operation could not be completed.'
}

function publicProfile(profile: LLMProfile): LLMProfile {
  return {
    id: profile.id,
    workspace_id: profile.workspace_id,
    provider_id: profile.provider_id,
    display_name: profile.display_name,
    config: {
      ...(profile.config.base_url ? { base_url: profile.config.base_url } : {}),
      model: profile.config.model,
      ...(profile.config.custom_header_names
        ? { custom_header_names: [...profile.config.custom_header_names] }
        : {}),
      timeout: profile.config.timeout,
      concurrency: profile.config.concurrency,
      temperature: profile.config.temperature,
      context_limit: profile.config.context_limit,
      structured_output: true,
      prompt_template: profile.config.prompt_template,
      ...(profile.config.default_glossary_id
        ? { default_glossary_id: profile.config.default_glossary_id }
        : {}),
      auto_approval_policy: profile.config.auto_approval_policy,
    },
    state: profile.state,
    priority: profile.priority,
    version: profile.version,
    secret_configured: profile.secret_configured,
    created_at: profile.created_at,
    updated_at: profile.updated_at,
  }
}

function sortedProfiles(profiles: LLMProfile[]): LLMProfile[] {
  return profiles
    .map(publicProfile)
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        left.display_name.localeCompare(right.display_name) ||
        left.id.localeCompare(right.id),
    )
}

function sortedGlossaries(glossaries: GlossarySet[]): GlossarySet[] {
  return [...glossaries].sort(
    (left, right) =>
      left.scope_type.localeCompare(right.scope_type) ||
      left.display_name.localeCompare(right.display_name) ||
      left.id.localeCompare(right.id),
  )
}

export const useLLMProvidersStore = defineStore('llm-providers', () => {
  const capabilities = ref<LLMCapabilities[]>([])
  const profiles = ref<LLMProfile[]>([])
  const glossaries = ref<GlossarySet[]>([])
  const health = ref<Record<string, LLMHealth>>({})
  const loading = ref(false)
  const mutation = ref<string | null>(null)
  const error = ref<string | null>(null)

  const isBusy = computed(() => loading.value || mutation.value !== null)

  async function load(client: LLMAdminClient = apiClient): Promise<boolean> {
    if (loading.value) return false
    loading.value = true
    error.value = null
    try {
      const [capabilityList, profileList, glossaryList] = await Promise.all([
        client.listLLMProviderCapabilities(),
        client.listLLMProfiles(),
        client.listGlossarySets(),
      ])
      const providerIds = capabilityList.items.map((item) => item.provider_id)
      if (
        capabilityList.items.length !== 2 ||
        new Set(providerIds).size !== 2 ||
        !REQUIRED_PROVIDER_IDS.every((id) => providerIds.includes(id))
      ) {
        throw new TypeError('Server returned an incomplete LLM capability model.')
      }
      capabilities.value = capabilityList.items
      profiles.value = sortedProfiles(profileList.items)
      glossaries.value = sortedGlossaries(glossaryList.items)
      return true
    } catch (reason) {
      error.value = safeErrorMessage(reason)
      return false
    } finally {
      loading.value = false
    }
  }

  async function mutate<T>(
    operation: string,
    request: () => Promise<T>,
    apply: (result: T) => void,
  ): Promise<boolean> {
    if (mutation.value) {
      error.value = 'Wait for the current LLM administration operation to finish.'
      return false
    }
    mutation.value = operation
    error.value = null
    try {
      const result = await request()
      apply(result)
      return true
    } catch (reason) {
      error.value = safeErrorMessage(reason)
      return false
    } finally {
      mutation.value = null
    }
  }

  function replaceProfile(updated: LLMProfile): void {
    profiles.value = sortedProfiles([
      updated,
      ...profiles.value.filter((profile) => profile.id !== updated.id),
    ])
  }

  function replaceGlossary(updated: GlossarySet): void {
    glossaries.value = sortedGlossaries([
      updated,
      ...glossaries.value.filter((glossary) => glossary.id !== updated.id),
    ])
  }

  async function createProfile(
    input: CreateLLMProfileRequest,
    client: LLMAdminClient = apiClient,
  ): Promise<boolean> {
    return mutate('create-profile', () => client.createLLMProfile(input), replaceProfile)
  }

  async function setProfileState(
    profileId: string,
    state: ResourceState,
    client: LLMAdminClient = apiClient,
  ): Promise<boolean> {
    const profile = profiles.value.find((item) => item.id === profileId)
    if (!profile) {
      error.value = 'Refresh LLM profiles before changing this state.'
      return false
    }
    return mutate(
      `state-profile-${profileId}`,
      () => client.updateLLMProfile(profile.id, profile.provider_id, profile.version, { state }),
      replaceProfile,
    )
  }

  async function setAutoApprovalPolicy(
    profileId: string,
    policy: LLMConfig['auto_approval_policy'],
    client: LLMAdminClient = apiClient,
  ): Promise<boolean> {
    if (policy !== 'never' && policy !== 'validated_glossary_only') {
      error.value = 'Select a supported auto-approval policy.'
      return false
    }
    const profile = profiles.value.find((item) => item.id === profileId)
    if (!profile) {
      error.value = 'Refresh LLM profiles before changing this policy.'
      return false
    }
    return mutate(
      `policy-profile-${profileId}`,
      () =>
        client.updateLLMProfile(profile.id, profile.provider_id, profile.version, {
          config: {
            ...profile.config,
            ...(profile.config.custom_header_names
              ? { custom_header_names: [...profile.config.custom_header_names] }
              : {}),
            auto_approval_policy: policy,
          },
        }),
      replaceProfile,
    )
  }

  async function rotateCredentials(
    profileId: string,
    credentials: LLMCredentials,
    client: LLMAdminClient = apiClient,
  ): Promise<boolean> {
    const profile = profiles.value.find((item) => item.id === profileId)
    if (!profile || profile.provider_id !== 'openai_compatible_llm') {
      error.value = 'Refresh LLM profiles before rotating this credential.'
      return false
    }
    return mutate(
      `credentials-profile-${profileId}`,
      () =>
        client.updateLLMProfile(profile.id, profile.provider_id, profile.version, {
          credentials,
        }),
      replaceProfile,
    )
  }

  async function checkProfile(
    profileId: string,
    client: LLMAdminClient = apiClient,
  ): Promise<boolean> {
    if (!profiles.value.some((profile) => profile.id === profileId)) {
      error.value = 'Refresh LLM profiles before checking this provider.'
      return false
    }
    return mutate(
      `health-profile-${profileId}`,
      () => client.checkLLMProfileHealth(profileId),
      (result) => {
        health.value = { ...health.value, [profileId]: result }
      },
    )
  }

  async function createGlossary(
    input: CreateGlossarySetRequest,
    client: LLMAdminClient = apiClient,
  ): Promise<boolean> {
    return mutate('create-glossary', () => client.createGlossarySet(input), replaceGlossary)
  }

  async function publishGlossaryVersion(
    glossaryId: string,
    input: AddGlossarySetVersionRequest,
    client: LLMAdminClient = apiClient,
  ): Promise<boolean> {
    const glossary = glossaries.value.find((item) => item.id === glossaryId)
    if (!glossary) {
      error.value = 'Refresh glossary sets before publishing a version.'
      return false
    }
    return mutate(
      `version-glossary-${glossaryId}`,
      () => client.createGlossarySetVersion(glossary.id, glossary.resource_version, input),
      replaceGlossary,
    )
  }

  async function setGlossaryState(
    glossaryId: string,
    state: ResourceState,
    client: LLMAdminClient = apiClient,
  ): Promise<boolean> {
    const glossary = glossaries.value.find((item) => item.id === glossaryId)
    if (!glossary) {
      error.value = 'Refresh glossary sets before changing this state.'
      return false
    }
    return mutate(
      `state-glossary-${glossaryId}`,
      () => client.updateGlossarySet(glossary.id, glossary.resource_version, state),
      replaceGlossary,
    )
  }

  function reset(): void {
    if (mutation.value) {
      throw new Error('Wait for the current LLM administration operation to finish.')
    }
    capabilities.value = []
    profiles.value = []
    glossaries.value = []
    health.value = {}
    loading.value = false
    error.value = null
  }

  return {
    capabilities: readonly(capabilities),
    checkProfile,
    createGlossary,
    createProfile,
    error: readonly(error),
    glossaries: readonly(glossaries),
    health: readonly(health),
    isBusy,
    load,
    loading: readonly(loading),
    mutation: readonly(mutation),
    profiles: readonly(profiles),
    publishGlossaryVersion,
    reset,
    rotateCredentials,
    setAutoApprovalPolicy,
    setGlossaryState,
    setProfileState,
  }
})
