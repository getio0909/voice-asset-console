import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  ASRProviderCapabilities,
  HotwordEntryInput,
  HotwordSet,
  ProviderProfile,
} from '@/api/client'

import { useProvidersStore } from '../providers'
import type { ProviderAdminClient } from '../providers'

const workspaceId = '10000000-0000-4000-8000-000000000001'
const profileId = '20000000-0000-4000-8000-000000000002'
const hotwordSetId = '30000000-0000-4000-8000-000000000003'
const now = '2026-07-16T12:00:00Z'

const capabilities: ASRProviderCapabilities[] = [
  {
    provider_id: 'mock_asr',
    batch: true,
    realtime: false,
    sentence: false,
    languages: ['*'],
    models: ['deterministic_fixture'],
    formats: ['wav', 'm4a'],
    sample_rates: [8_000, 16_000],
    hotwords: false,
    temporary_hotwords: false,
    timestamps: true,
    word_timestamps: true,
    speaker_diarization: false,
    punctuation: true,
    number_normalization: false,
    max_duration_ms: 43_200_000,
    max_file_size_bytes: 536_870_912,
    max_concurrency: 128,
  },
  {
    provider_id: 'aliyun_asr',
    batch: true,
    realtime: false,
    sentence: false,
    languages: ['*'],
    models: ['project_configured'],
    formats: ['wav', 'm4a'],
    sample_rates: [8_000, 16_000],
    hotwords: true,
    temporary_hotwords: false,
    timestamps: true,
    word_timestamps: true,
    speaker_diarization: false,
    punctuation: true,
    number_normalization: true,
    max_duration_ms: 7_200_000,
    max_file_size_bytes: 536_870_912,
    max_concurrency: 2,
  },
  {
    provider_id: 'tencent_asr',
    batch: true,
    realtime: false,
    sentence: false,
    languages: ['*'],
    models: ['16k_zh'],
    formats: ['wav', 'm4a'],
    sample_rates: [8_000, 16_000],
    hotwords: true,
    temporary_hotwords: true,
    timestamps: true,
    word_timestamps: true,
    speaker_diarization: true,
    punctuation: true,
    number_normalization: true,
    max_duration_ms: 7_200_000,
    max_file_size_bytes: 536_870_912,
    max_concurrency: 20,
  },
]

const profile: ProviderProfile = {
  id: profileId,
  workspace_id: workspaceId,
  provider_id: 'tencent_asr',
  display_name: 'Tencent Flash',
  config: {
    model: '16k_zh',
    language: 'zh-CN',
    sample_rate: 16_000,
    audio_format: 'm4a',
    punctuation: true,
    timestamps: true,
    word_timestamps: true,
    speaker_diarization: false,
    number_normalization: true,
    timeout: '2m',
    retry: { max_attempts: 3, base_delay: '1s', max_delay: '30s' },
    concurrency: 5,
    vendor_extension: { appid: '1234567890' },
  },
  state: 'disabled',
  priority: 100,
  version: 1,
  secret_configured: true,
  created_at: now,
  updated_at: now,
}

const hotwordSet: HotwordSet = {
  id: hotwordSetId,
  workspace_id: workspaceId,
  display_name: 'Product terms',
  scope_type: 'workspace',
  scope_id: null,
  state: 'enabled',
  current_version: 1,
  resource_version: 1,
  entries: [
    {
      term: 'VoiceAsset',
      aliases: ['Voice Asset'],
      language: 'en-US',
      weight: 90,
      provider_mapping: {},
      enabled: true,
    },
  ],
  created_at: now,
  updated_at: now,
}

function createClient(): ProviderAdminClient {
  return {
    listASRProviderCapabilities: vi.fn(async () => ({ items: capabilities })),
    listProviderProfiles: vi.fn(async () => ({ items: [profile] })),
    listHotwordSets: vi.fn(async () => ({ items: [hotwordSet] })),
    createProviderProfile: vi.fn(async () => profile),
    updateProviderProfile: vi.fn(async (_id, _provider, version, input) => ({
      ...profile,
      ...input,
      version: version + 1,
      secret_configured: true,
    })),
    checkProviderProfileHealth: vi.fn(async () => ({
      profile_id: profileId,
      status: 'healthy' as const,
      checked_at: now,
    })),
    createHotwordSet: vi.fn(async () => hotwordSet),
    createHotwordSetVersion: vi.fn(async (_id, version, input) => ({
      ...hotwordSet,
      entries: input.entries.map((entry: HotwordEntryInput) => ({
        term: entry.term,
        aliases: entry.aliases ?? [],
        language: entry.language,
        weight: entry.weight,
        provider_mapping: entry.provider_mapping ?? {},
        enabled: entry.enabled ?? true,
      })),
      current_version: hotwordSet.current_version + 1,
      resource_version: version + 1,
    })),
    updateHotwordSet: vi.fn(async (_id, version, state) => ({
      ...hotwordSet,
      state,
      resource_version: version + 1,
    })),
  }
}

describe('providers store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('loads the complete capability model, redacted profiles, and hotword sets', async () => {
    const store = useProvidersStore()
    const client = createClient()

    await expect(store.load(client)).resolves.toBe(true)

    expect(store.capabilities.map((item) => item.provider_id)).toEqual([
      'mock_asr',
      'aliyun_asr',
      'tencent_asr',
    ])
    expect(store.profiles).toEqual([profile])
    expect(store.profiles[0]?.secret_configured).toBe(true)
    expect(store.hotwordSets).toEqual([hotwordSet])
    expect(store.error).toBeNull()
  })

  it('does not retain create or rotation credentials in Pinia state', async () => {
    const store = useProvidersStore()
    const client = createClient()
    await store.load(client)

    await expect(
      store.createProvider(
        {
          provider_id: 'tencent_asr',
          display_name: 'Tencent Flash',
          config: profile.config,
          credentials: { secret_id: 'secret-id-value', secret_key: 'secret-key-value' },
        },
        client,
      ),
    ).resolves.toBe(true)
    await expect(
      store.rotateProviderCredentials(
        profileId,
        { secret_id: 'rotated-secret-id', secret_key: 'rotated-secret-key' },
        client,
      ),
    ).resolves.toBe(true)

    expect(client.updateProviderProfile).toHaveBeenCalledWith(profileId, 'tencent_asr', 1, {
      credentials: { secret_id: 'rotated-secret-id', secret_key: 'rotated-secret-key' },
    })
    const serializedState = JSON.stringify(store.$state)
    expect(serializedState).not.toContain('secret-id-value')
    expect(serializedState).not.toContain('secret-key-value')
    expect(serializedState).not.toContain('rotated-secret-id')
    expect(serializedState).not.toContain('rotated-secret-key')
  })

  it('publishes immutable hotword versions and advances ETags for state changes', async () => {
    const store = useProvidersStore()
    const client = createClient()
    await store.load(client)

    await expect(
      store.publishHotwordVersion(
        hotwordSetId,
        [{ term: 'VoiceAsset', language: 'en-US', weight: 95 }],
        client,
      ),
    ).resolves.toBe(true)
    expect(client.createHotwordSetVersion).toHaveBeenCalledWith(hotwordSetId, 1, {
      entries: [{ term: 'VoiceAsset', language: 'en-US', weight: 95 }],
    })
    expect(store.hotwordSets[0]?.current_version).toBe(2)
    expect(store.hotwordSets[0]?.resource_version).toBe(2)

    await expect(store.setHotwordState(hotwordSetId, 'disabled', client)).resolves.toBe(true)
    expect(client.updateHotwordSet).toHaveBeenCalledWith(hotwordSetId, 2, 'disabled')
    expect(store.hotwordSets[0]?.resource_version).toBe(3)
  })

  it('fails closed on incomplete capability models without replacing prior state', async () => {
    const store = useProvidersStore()
    const client = createClient()
    vi.mocked(client.listASRProviderCapabilities).mockResolvedValue({
      items: capabilities.slice(0, 2),
    })

    await expect(store.load(client)).resolves.toBe(false)

    expect(store.capabilities).toEqual([])
    expect(store.profiles).toEqual([])
    expect(store.hotwordSets).toEqual([])
    expect(store.error).toBe('Server returned an incomplete ASR capability model.')
  })
})
