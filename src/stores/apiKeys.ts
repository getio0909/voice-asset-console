import { computed, readonly, ref } from 'vue'
import { defineStore } from 'pinia'

import { ApiError, apiClient } from '@/api/client'
import type { APIKey, APIKeyList, CreateAPIKeyRequest, CreatedAPIKey } from '@/api/client'

export interface APIKeysClient {
  listAPIKeys(): Promise<APIKeyList>
  createAPIKey(input: CreateAPIKeyRequest): Promise<CreatedAPIKey>
  revokeAPIKey(apiKeyId: string): Promise<APIKey>
}

export interface OneTimeCredential {
  apiKeyId: string
  token: string
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const request = error.requestId ? ` Request ID: ${error.requestId}.` : ''
    return `${error.message}${request}`
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  return 'The operation could not be completed.'
}

function newestFirst(items: APIKey[]): APIKey[] {
  return [...items].sort((left, right) => right.created_at.localeCompare(left.created_at))
}

export const useAPIKeysStore = defineStore('api-keys', () => {
  const items = ref<APIKey[]>([])
  const loading = ref(false)
  const mutating = ref(false)
  const error = ref<string | null>(null)
  const oneTimeCredential = ref<OneTimeCredential | null>(null)

  const isBusy = computed(() => loading.value || mutating.value)

  async function load(client: APIKeysClient = apiClient): Promise<boolean> {
    if (isBusy.value) {
      error.value = 'Wait for the current API-key operation to finish.'
      return false
    }
    loading.value = true
    error.value = null
    try {
      const result = await client.listAPIKeys()
      items.value = newestFirst(result.items)
      return true
    } catch (cause) {
      error.value = safeErrorMessage(cause)
      return false
    } finally {
      loading.value = false
    }
  }

  async function create(
    input: CreateAPIKeyRequest,
    client: APIKeysClient = apiClient,
  ): Promise<boolean> {
    if (isBusy.value) {
      error.value = 'Wait for the current API-key operation to finish.'
      return false
    }
    if (oneTimeCredential.value) {
      error.value = 'Copy or dismiss the current one-time token before creating another key.'
      return false
    }

    mutating.value = true
    error.value = null
    try {
      const created = await client.createAPIKey(input)
      items.value = newestFirst([
        created.api_key,
        ...items.value.filter((item) => item.id !== created.api_key.id),
      ])
      oneTimeCredential.value = Object.freeze({
        apiKeyId: created.api_key.id,
        token: created.token,
      })
      return true
    } catch (cause) {
      error.value = safeErrorMessage(cause)
      return false
    } finally {
      mutating.value = false
    }
  }

  async function revoke(apiKeyId: string, client: APIKeysClient = apiClient): Promise<boolean> {
    if (isBusy.value) {
      error.value = 'Wait for the current API-key operation to finish.'
      return false
    }

    mutating.value = true
    error.value = null
    try {
      const revoked = await client.revokeAPIKey(apiKeyId)
      items.value = newestFirst([revoked, ...items.value.filter((item) => item.id !== revoked.id)])
      if (oneTimeCredential.value?.apiKeyId === revoked.id) {
        clearOneTimeCredential()
      }
      return true
    } catch (cause) {
      error.value = safeErrorMessage(cause)
      return false
    } finally {
      mutating.value = false
    }
  }

  function clearOneTimeCredential(): void {
    oneTimeCredential.value = null
  }

  function reset(): void {
    items.value = []
    error.value = null
    clearOneTimeCredential()
  }

  return {
    clearOneTimeCredential,
    create,
    error: readonly(error),
    isBusy,
    items: readonly(items),
    load,
    loading: readonly(loading),
    mutating: readonly(mutating),
    oneTimeCredential: readonly(oneTimeCredential),
    reset,
    revoke,
  }
})
