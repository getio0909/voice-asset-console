import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { GlossarySet, LLMCapabilities, LLMCredentials, LLMProfile } from '@/api/client'

import { useLLMProvidersStore } from '../llmProviders'
import type { LLMAdminClient } from '../llmProviders'

const workspaceId = '12000000-0000-4000-8000-000000000001'
const profileId = '23000000-0000-4000-8000-000000000002'
const glossaryId = '34000000-0000-4000-8000-000000000003'
const now = '2026-07-16T22:00:00Z'

const capabilities: LLMCapabilities[] = [
  {
    provider_id: 'mock_llm',
    structured_patch: true,
    custom_headers: false,
    max_context_tokens: 1_000_000,
    max_concurrency: 128,
  },
  {
    provider_id: 'openai_compatible_llm',
    structured_patch: true,
    custom_headers: true,
    max_context_tokens: 1_000_000,
    max_concurrency: 128,
  },
]

const profile: LLMProfile = {
  id: profileId,
  workspace_id: workspaceId,
  provider_id: 'openai_compatible_llm',
  display_name: 'Compatible correction',
  config: {
    base_url: 'https://llm.example.com/v1',
    model: 'fixture-model',
    custom_header_names: ['X-Tenant'],
    timeout: '30s',
    concurrency: 4,
    temperature: 0,
    context_limit: 64_000,
    structured_output: true,
    prompt_template: 'correction.v1',
    default_glossary_id: glossaryId,
    auto_approval_policy: 'never',
  },
  state: 'disabled',
  priority: 100,
  version: 1,
  secret_configured: true,
  created_at: now,
  updated_at: now,
}

const glossary: GlossarySet = {
  id: glossaryId,
  workspace_id: workspaceId,
  display_name: 'Product corrections',
  scope_type: 'workspace',
  scope_id: null,
  state: 'enabled',
  current_version: 1,
  resource_version: 1,
  entries: [
    {
      canonical_form: 'VoiceAsset',
      aliases: ['Voice Asset'],
      language: 'en-US',
      priority: 100,
    },
  ],
  created_at: now,
  updated_at: now,
}

function createClient(): LLMAdminClient {
  return {
    listLLMProviderCapabilities: vi.fn(async () => ({ items: capabilities })),
    listLLMProfiles: vi.fn(async () => ({ items: [profile] })),
    listGlossarySets: vi.fn(async () => ({ items: [glossary] })),
    createLLMProfile: vi.fn(
      async (input) => ({ ...profile, ...input, secret_configured: true }) as LLMProfile,
    ),
    updateLLMProfile: vi.fn(
      async (_id, _provider, version, input) =>
        ({ ...profile, ...input, version: version + 1, secret_configured: true }) as LLMProfile,
    ),
    checkLLMProfileHealth: vi.fn(async () => ({
      profile_id: profileId,
      status: 'healthy' as const,
      checked_at: now,
    })),
    createGlossarySet: vi.fn(async () => glossary),
    createGlossarySetVersion: vi.fn(async (_id, version, input) => ({
      ...glossary,
      entries: input.entries,
      current_version: glossary.current_version + 1,
      resource_version: version + 1,
    })),
    updateGlossarySet: vi.fn(async (_id, version, state) => ({
      ...glossary,
      state,
      resource_version: version + 1,
    })),
  }
}

describe('LLM providers store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('loads both capability models and credential-free public resources', async () => {
    const store = useLLMProvidersStore()
    const client = createClient()

    await expect(store.load(client)).resolves.toBe(true)

    expect(store.capabilities.map((item) => item.provider_id)).toEqual([
      'mock_llm',
      'openai_compatible_llm',
    ])
    expect(store.profiles).toEqual([profile])
    expect(store.glossaries).toEqual([glossary])
    expect(store.error).toBeNull()
  })

  it('never retains create or rotation credentials in Pinia state', async () => {
    const store = useLLMProvidersStore()
    const client = createClient()
    await store.load(client)
    const createCredentials: LLMCredentials = {
      api_key: 'fixture-create-api-key',
      custom_headers: { 'X-Tenant': 'fixture-create-tenant' },
    }
    const rotationCredentials: LLMCredentials = {
      api_key: 'fixture-rotated-api-key',
      custom_headers: { 'X-Tenant': 'fixture-rotated-tenant' },
    }

    await expect(
      store.createProfile(
        {
          provider_id: 'openai_compatible_llm',
          display_name: profile.display_name,
          config: profile.config,
          credentials: createCredentials,
        },
        client,
      ),
    ).resolves.toBe(true)
    await expect(store.rotateCredentials(profileId, rotationCredentials, client)).resolves.toBe(
      true,
    )

    expect(client.updateLLMProfile).toHaveBeenCalledWith(profileId, 'openai_compatible_llm', 1, {
      credentials: rotationCredentials,
    })
    const state = JSON.stringify(store.$state)
    for (const secret of [
      'fixture-create-api-key',
      'fixture-create-tenant',
      'fixture-rotated-api-key',
      'fixture-rotated-tenant',
    ]) {
      expect(state).not.toContain(secret)
    }
  })

  it('publishes immutable glossary versions and advances ETags for state changes', async () => {
    const store = useLLMProvidersStore()
    const client = createClient()
    await store.load(client)

    await expect(
      store.publishGlossaryVersion(
        glossaryId,
        {
          entries: [
            {
              canonical_form: 'VoiceAssets',
              aliases: ['Voice Assets'],
              language: 'en-US',
              priority: 110,
            },
          ],
        },
        client,
      ),
    ).resolves.toBe(true)
    expect(client.createGlossarySetVersion).toHaveBeenCalledWith(glossaryId, 1, expect.any(Object))
    expect(store.glossaries[0]?.current_version).toBe(2)
    expect(store.glossaries[0]?.resource_version).toBe(2)

    await expect(store.setGlossaryState(glossaryId, 'disabled', client)).resolves.toBe(true)
    expect(client.updateGlossarySet).toHaveBeenCalledWith(glossaryId, 2, 'disabled')
    expect(store.glossaries[0]?.resource_version).toBe(3)
  })

  it('updates the explicit auto-approval policy with the current profile ETag', async () => {
    const store = useLLMProvidersStore()
    const client = createClient()
    await store.load(client)

    await expect(
      store.setAutoApprovalPolicy(profileId, 'validated_glossary_only', client),
    ).resolves.toBe(true)

    expect(client.updateLLMProfile).toHaveBeenCalledWith(profileId, 'openai_compatible_llm', 1, {
      config: { ...profile.config, auto_approval_policy: 'validated_glossary_only' },
    })
    expect(store.profiles[0]?.config.auto_approval_policy).toBe('validated_glossary_only')
    expect(store.profiles[0]?.version).toBe(2)
  })

  it('fails closed when either required capability model is absent', async () => {
    const store = useLLMProvidersStore()
    const client = createClient()
    vi.mocked(client.listLLMProviderCapabilities).mockResolvedValue({
      items: capabilities.slice(0, 1),
    })

    await expect(store.load(client)).resolves.toBe(false)

    expect(store.capabilities).toEqual([])
    expect(store.profiles).toEqual([])
    expect(store.glossaries).toEqual([])
    expect(store.error).toBe('Server returned an incomplete LLM capability model.')
  })
})
