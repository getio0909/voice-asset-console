import { computed, readonly, ref } from 'vue'
import { defineStore } from 'pinia'

import { ApiError, apiClient } from '@/api/client'
import type {
  ASRProviderCapabilities,
  ASRProviderCapabilitiesList,
  CreateHotwordSetRequest,
  CreateProviderProfileRequest,
  HotwordEntryInput,
  HotwordSet,
  HotwordSetList,
  ProviderCredentials,
  ProviderHealth,
  ProviderProfile,
  ProviderProfileList,
  ResourceState,
} from '@/api/client'

const REQUIRED_PROVIDER_IDS: ASRProviderCapabilities['provider_id'][] = [
  'mock_asr',
  'aliyun_asr',
  'tencent_asr',
]

export interface ProviderAdminClient {
  listASRProviderCapabilities(): Promise<ASRProviderCapabilitiesList>
  listProviderProfiles(): Promise<ProviderProfileList>
  listHotwordSets(): Promise<HotwordSetList>
  createProviderProfile(input: CreateProviderProfileRequest): Promise<ProviderProfile>
  updateProviderProfile(
    profileId: string,
    providerId: ProviderProfile['provider_id'],
    version: number,
    input: {
      credentials?: ProviderCredentials
      state?: ResourceState
    },
  ): Promise<ProviderProfile>
  checkProviderProfileHealth(profileId: string): Promise<ProviderHealth>
  createHotwordSet(input: CreateHotwordSetRequest): Promise<HotwordSet>
  createHotwordSetVersion(
    hotwordSetId: string,
    resourceVersion: number,
    input: { entries: HotwordEntryInput[] },
  ): Promise<HotwordSet>
  updateHotwordSet(
    hotwordSetId: string,
    resourceVersion: number,
    state: ResourceState,
  ): Promise<HotwordSet>
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const request = error.requestId ? ` Request ID: ${error.requestId}.` : ''
    return `${error.message}${request}`
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  return 'The provider administration operation could not be completed.'
}

function sortedProfiles(profiles: ProviderProfile[]): ProviderProfile[] {
  return profiles
    .map(publicProviderProfile)
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        left.display_name.localeCompare(right.display_name) ||
        left.id.localeCompare(right.id),
    )
}

function publicProviderProfile(profile: ProviderProfile): ProviderProfile {
  return {
    id: profile.id,
    workspace_id: profile.workspace_id,
    provider_id: profile.provider_id,
    display_name: profile.display_name,
    config: {
      ...(profile.config.endpoint ? { endpoint: profile.config.endpoint } : {}),
      ...(profile.config.region ? { region: profile.config.region } : {}),
      model: profile.config.model,
      language: profile.config.language,
      ...(profile.config.dialect ? { dialect: profile.config.dialect } : {}),
      sample_rate: profile.config.sample_rate,
      audio_format: profile.config.audio_format,
      punctuation: profile.config.punctuation,
      timestamps: profile.config.timestamps,
      word_timestamps: profile.config.word_timestamps,
      speaker_diarization: profile.config.speaker_diarization,
      number_normalization: profile.config.number_normalization,
      ...(profile.config.hotword_set_id ? { hotword_set_id: profile.config.hotword_set_id } : {}),
      timeout: profile.config.timeout,
      retry: {
        max_attempts: profile.config.retry.max_attempts,
        base_delay: profile.config.retry.base_delay,
        max_delay: profile.config.retry.max_delay,
      },
      concurrency: profile.config.concurrency,
      vendor_extension: { ...profile.config.vendor_extension },
    },
    state: profile.state,
    priority: profile.priority,
    version: profile.version,
    secret_configured: profile.secret_configured,
    created_at: profile.created_at,
    updated_at: profile.updated_at,
  }
}

function sortedHotwordSets(sets: HotwordSet[]): HotwordSet[] {
  return [...sets].sort(
    (left, right) =>
      left.scope_type.localeCompare(right.scope_type) ||
      left.display_name.localeCompare(right.display_name) ||
      left.id.localeCompare(right.id),
  )
}

export const useProvidersStore = defineStore('providers', () => {
  const capabilities = ref<ASRProviderCapabilities[]>([])
  const profiles = ref<ProviderProfile[]>([])
  const hotwordSets = ref<HotwordSet[]>([])
  const health = ref<Record<string, ProviderHealth>>({})
  const loading = ref(false)
  const mutation = ref<string | null>(null)
  const error = ref<string | null>(null)

  const isBusy = computed(() => loading.value || mutation.value !== null)

  async function load(client: ProviderAdminClient = apiClient): Promise<boolean> {
    if (loading.value) {
      return false
    }
    loading.value = true
    error.value = null
    try {
      const [capabilityList, profileList, hotwordList] = await Promise.all([
        client.listASRProviderCapabilities(),
        client.listProviderProfiles(),
        client.listHotwordSets(),
      ])
      const providerIds = capabilityList.items.map((item) => item.provider_id)
      if (
        capabilityList.items.length !== 3 ||
        new Set(providerIds).size !== 3 ||
        !REQUIRED_PROVIDER_IDS.every((id) => providerIds.includes(id))
      ) {
        throw new TypeError('Server returned an incomplete ASR capability model.')
      }
      capabilities.value = capabilityList.items
      profiles.value = sortedProfiles(profileList.items)
      hotwordSets.value = sortedHotwordSets(hotwordList.items)
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
      error.value = 'Wait for the current provider administration operation to finish.'
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

  function replaceProfile(updated: ProviderProfile): void {
    profiles.value = sortedProfiles([
      updated,
      ...profiles.value.filter((profile) => profile.id !== updated.id),
    ])
  }

  function replaceHotwordSet(updated: HotwordSet): void {
    hotwordSets.value = sortedHotwordSets([
      updated,
      ...hotwordSets.value.filter((set) => set.id !== updated.id),
    ])
  }

  async function createProvider(
    input: CreateProviderProfileRequest,
    client: ProviderAdminClient = apiClient,
  ): Promise<boolean> {
    return mutate('create-provider', () => client.createProviderProfile(input), replaceProfile)
  }

  async function setProviderState(
    profileId: string,
    state: ResourceState,
    client: ProviderAdminClient = apiClient,
  ): Promise<boolean> {
    const profile = profiles.value.find((item) => item.id === profileId)
    if (!profile) {
      error.value = 'Refresh provider profiles before changing this state.'
      return false
    }
    return mutate(
      `state-provider-${profileId}`,
      () =>
        client.updateProviderProfile(profile.id, profile.provider_id, profile.version, { state }),
      replaceProfile,
    )
  }

  async function rotateProviderCredentials(
    profileId: string,
    credentials: ProviderCredentials,
    client: ProviderAdminClient = apiClient,
  ): Promise<boolean> {
    const profile = profiles.value.find((item) => item.id === profileId)
    if (!profile || profile.provider_id === 'mock_asr') {
      error.value = 'Refresh provider profiles before rotating this credential.'
      return false
    }
    return mutate(
      `credentials-provider-${profileId}`,
      () =>
        client.updateProviderProfile(profile.id, profile.provider_id, profile.version, {
          credentials,
        }),
      replaceProfile,
    )
  }

  async function checkProvider(
    profileId: string,
    client: ProviderAdminClient = apiClient,
  ): Promise<boolean> {
    if (!profiles.value.some((profile) => profile.id === profileId)) {
      error.value = 'Refresh provider profiles before checking this provider.'
      return false
    }
    return mutate(
      `health-provider-${profileId}`,
      () => client.checkProviderProfileHealth(profileId),
      (result) => {
        health.value = { ...health.value, [profileId]: result }
      },
    )
  }

  async function createHotwordSet(
    input: CreateHotwordSetRequest,
    client: ProviderAdminClient = apiClient,
  ): Promise<boolean> {
    return mutate('create-hotword-set', () => client.createHotwordSet(input), replaceHotwordSet)
  }

  async function publishHotwordVersion(
    hotwordSetId: string,
    entries: HotwordEntryInput[],
    client: ProviderAdminClient = apiClient,
  ): Promise<boolean> {
    const set = hotwordSets.value.find((item) => item.id === hotwordSetId)
    if (!set) {
      error.value = 'Refresh hotword sets before publishing a version.'
      return false
    }
    return mutate(
      `version-hotword-${hotwordSetId}`,
      () =>
        client.createHotwordSetVersion(set.id, set.resource_version, {
          entries,
        }),
      replaceHotwordSet,
    )
  }

  async function setHotwordState(
    hotwordSetId: string,
    state: ResourceState,
    client: ProviderAdminClient = apiClient,
  ): Promise<boolean> {
    const set = hotwordSets.value.find((item) => item.id === hotwordSetId)
    if (!set) {
      error.value = 'Refresh hotword sets before changing this state.'
      return false
    }
    return mutate(
      `state-hotword-${hotwordSetId}`,
      () => client.updateHotwordSet(set.id, set.resource_version, state),
      replaceHotwordSet,
    )
  }

  function reset(): void {
    if (mutation.value) {
      throw new Error('Wait for the current provider administration operation to finish.')
    }
    capabilities.value = []
    profiles.value = []
    hotwordSets.value = []
    health.value = {}
    loading.value = false
    error.value = null
  }

  return {
    capabilities: readonly(capabilities),
    checkProvider,
    createHotwordSet,
    createProvider,
    error: readonly(error),
    health: readonly(health),
    hotwordSets: readonly(hotwordSets),
    isBusy,
    load,
    loading: readonly(loading),
    mutation: readonly(mutation),
    profiles: readonly(profiles),
    publishHotwordVersion,
    reset,
    rotateProviderCredentials,
    setHotwordState,
    setProviderState,
  }
})
