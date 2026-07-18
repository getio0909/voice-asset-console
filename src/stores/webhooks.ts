import { computed, readonly, ref } from 'vue'
import { defineStore } from 'pinia'

import { ApiError, apiClient } from '@/api/client'
import type {
  CreateWebhookRequest,
  UpdateWebhookRequest,
  Webhook,
  WebhookDelivery,
  WebhookDeliveryList,
  WebhookList,
  WebhookSecret,
} from '@/api/client'

export interface WebhooksClient {
  listAdminWebhooks(): Promise<WebhookList>
  createAdminWebhook(input: CreateWebhookRequest): Promise<WebhookSecret>
  updateAdminWebhook(id: string, version: number, input: UpdateWebhookRequest): Promise<Webhook>
  rotateAdminWebhookSecret(id: string, version: number): Promise<WebhookSecret>
  testAdminWebhook(id: string): Promise<WebhookDelivery>
  listAdminWebhookDeliveries(id: string, limit?: number): Promise<WebhookDeliveryList>
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const request = error.requestId ? ` Request ID: ${error.requestId}.` : ''
    return `${error.message}${request}`
  }
  if (error instanceof Error && error.message.trim()) return error.message
  return 'The Webhook operation could not be completed.'
}

function newestFirst(items: Webhook[]): Webhook[] {
  return [...items].sort((left, right) => right.updated_at.localeCompare(left.updated_at))
}

export const useWebhooksStore = defineStore('webhooks', () => {
  const items = ref<Webhook[]>([])
  const deliveries = ref<WebhookDelivery[]>([])
  const loading = ref(false)
  const mutating = ref(false)
  const error = ref<string | null>(null)
  const oneTimeSecret = ref<WebhookSecret | null>(null)
  const isBusy = computed(() => loading.value || mutating.value)

  async function load(client: WebhooksClient = apiClient): Promise<boolean> {
    if (isBusy.value) {
      error.value = 'Wait for the current Webhook operation to finish.'
      return false
    }
    loading.value = true
    error.value = null
    try {
      const result = await client.listAdminWebhooks()
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
    input: CreateWebhookRequest,
    client: WebhooksClient = apiClient,
  ): Promise<boolean> {
    if (isBusy.value || oneTimeSecret.value) {
      error.value = oneTimeSecret.value
        ? 'Copy or dismiss the current one-time secret before creating another Webhook.'
        : 'Wait for the current Webhook operation to finish.'
      return false
    }
    mutating.value = true
    error.value = null
    try {
      const created = await client.createAdminWebhook(input)
      items.value = newestFirst([created, ...items.value.filter((item) => item.id !== created.id)])
      oneTimeSecret.value = Object.freeze(created)
      return true
    } catch (cause) {
      error.value = safeErrorMessage(cause)
      return false
    } finally {
      mutating.value = false
    }
  }

  async function update(
    id: string,
    version: number,
    input: UpdateWebhookRequest,
    client: WebhooksClient = apiClient,
  ): Promise<boolean> {
    return mutate(async () => {
      const updated = await client.updateAdminWebhook(id, version, input)
      replace(updated)
    })
  }

  async function rotate(
    id: string,
    version: number,
    client: WebhooksClient = apiClient,
  ): Promise<boolean> {
    if (oneTimeSecret.value) {
      error.value = 'Copy or dismiss the current one-time secret before rotating another Webhook.'
      return false
    }
    return mutate(async () => {
      const rotated = await client.rotateAdminWebhookSecret(id, version)
      replace(rotated)
      oneTimeSecret.value = Object.freeze(rotated)
    })
  }

  async function test(id: string, client: WebhooksClient = apiClient): Promise<boolean> {
    return mutate(async () => {
      await client.testAdminWebhook(id)
    })
  }

  async function loadDeliveries(id: string, client: WebhooksClient = apiClient): Promise<boolean> {
    if (isBusy.value) {
      error.value = 'Wait for the current Webhook operation to finish.'
      return false
    }
    loading.value = true
    error.value = null
    try {
      const result = await client.listAdminWebhookDeliveries(id)
      deliveries.value = result.items
      return true
    } catch (cause) {
      error.value = safeErrorMessage(cause)
      return false
    } finally {
      loading.value = false
    }
  }

  async function mutate(operation: () => Promise<void>): Promise<boolean> {
    if (isBusy.value) {
      error.value = 'Wait for the current Webhook operation to finish.'
      return false
    }
    mutating.value = true
    error.value = null
    try {
      await operation()
      return true
    } catch (cause) {
      error.value = safeErrorMessage(cause)
      return false
    } finally {
      mutating.value = false
    }
  }

  function replace(item: Webhook): void {
    items.value = newestFirst([item, ...items.value.filter((existing) => existing.id !== item.id)])
  }

  function clearOneTimeSecret(): void {
    oneTimeSecret.value = null
  }

  function reset(): void {
    items.value = []
    deliveries.value = []
    error.value = null
    clearOneTimeSecret()
  }

  return {
    clearOneTimeSecret,
    create,
    deliveries: readonly(deliveries),
    error: readonly(error),
    isBusy,
    items: readonly(items),
    load,
    loadDeliveries,
    loading: readonly(loading),
    mutating: readonly(mutating),
    oneTimeSecret: readonly(oneTimeSecret),
    reset,
    rotate,
    test,
    update,
  }
})
