import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/client'
import type { APIKey, CreatedAPIKey } from '@/api/client'

import { useAPIKeysStore } from '../apiKeys'
import type { APIKeysClient } from '../apiKeys'

const workspaceId = '10000000-0000-4000-8000-000000000001'
const firstKeyId = '20000000-0000-4000-8000-000000000002'
const secondKeyId = '30000000-0000-4000-8000-000000000003'

function apiKey(id: string, overrides: Partial<APIKey> = {}): APIKey {
  return {
    id,
    workspace_id: workspaceId,
    name: 'Build agent',
    token_prefix: 'va_pat_example1',
    scopes: ['assets:read'],
    expires_at: '2026-08-16T12:00:00Z',
    revoked_at: null,
    last_used_at: null,
    created_at: '2026-07-16T12:00:00Z',
    ...overrides,
  }
}

function createClient(created?: CreatedAPIKey): APIKeysClient {
  return {
    listAPIKeys: vi.fn(async () => ({
      items: [
        apiKey(firstKeyId, { created_at: '2026-07-15T12:00:00Z' }),
        apiKey(secondKeyId, { created_at: '2026-07-16T12:00:00Z' }),
      ],
    })),
    createAPIKey: vi.fn(
      async () =>
        created ?? {
          api_key: apiKey(secondKeyId),
          token: 'one-time-plaintext-token',
        },
    ),
    revokeAPIKey: vi.fn(async (id) => apiKey(id, { revoked_at: '2026-07-16T13:00:00Z' })),
  }
}

describe('API keys store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('loads redacted metadata in newest-first order', async () => {
    const store = useAPIKeysStore()
    const client = createClient()

    await expect(store.load(client)).resolves.toBe(true)

    expect(store.items.map((item) => item.id)).toEqual([secondKeyId, firstKeyId])
    expect(store.oneTimeCredential).toBeNull()
    expect(store.error).toBeNull()
  })

  it('keeps the created plaintext token only until explicit dismissal', async () => {
    const store = useAPIKeysStore()
    const client = createClient()
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem')

    await expect(
      store.create(
        {
          name: 'Build agent',
          scopes: ['assets:read'],
          expires_at: '2026-08-16T12:00:00Z',
        },
        client,
      ),
    ).resolves.toBe(true)

    expect(store.oneTimeCredential).toEqual({
      apiKeyId: secondKeyId,
      token: 'one-time-plaintext-token',
    })
    expect(storageWrite).not.toHaveBeenCalled()

    await expect(
      store.create(
        {
          name: 'Second key',
          scopes: ['assets:read'],
          expires_at: '2026-08-16T12:00:00Z',
        },
        client,
      ),
    ).resolves.toBe(false)
    expect(client.createAPIKey).toHaveBeenCalledTimes(1)

    store.clearOneTimeCredential()
    expect(store.oneTimeCredential).toBeNull()
    storageWrite.mockRestore()
  })

  it('replaces revoked metadata and clears a matching one-time token', async () => {
    const store = useAPIKeysStore()
    const client = createClient()

    await store.create(
      {
        name: 'Build agent',
        scopes: ['assets:read'],
        expires_at: '2026-08-16T12:00:00Z',
      },
      client,
    )
    await expect(store.revoke(secondKeyId, client)).resolves.toBe(true)

    expect(store.items).toHaveLength(1)
    expect(store.items[0]?.revoked_at).toBe('2026-07-16T13:00:00Z')
    expect(store.oneTimeCredential).toBeNull()
  })

  it('surfaces structured request identifiers without leaking credentials', async () => {
    const store = useAPIKeysStore()
    const client = createClient()
    vi.mocked(client.listAPIKeys).mockRejectedValue(
      new ApiError('Administrative scope required.', {
        status: 403,
        code: 'forbidden',
        requestId: 'request-123',
      }),
    )

    await expect(store.load(client)).resolves.toBe(false)

    expect(store.error).toBe('Administrative scope required. Request ID: request-123.')
    expect(store.items).toEqual([])
  })
})
