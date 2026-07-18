import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/client'
import type { Webhook, WebhookDelivery, WebhookSecret } from '@/api/client'

import { useWebhooksStore } from '../webhooks'
import type { WebhooksClient } from '../webhooks'

const workspaceId = '10000000-0000-4000-8000-000000000001'
const webhookId = '20000000-0000-4000-8000-000000000002'

function webhook(overrides: Partial<Webhook> = {}): Webhook {
  return {
    id: webhookId,
    workspace_id: workspaceId,
    display_name: 'Build notifications',
    url: 'https://hooks.example.test/voiceasset',
    event_types: ['job.succeeded'],
    state: 'enabled',
    version: 1,
    secret_configured: true,
    created_at: '2026-07-18T10:00:00Z',
    updated_at: '2026-07-18T10:00:00Z',
    ...overrides,
  }
}

function secret(overrides: Partial<WebhookSecret> = {}): WebhookSecret {
  return {
    ...webhook(),
    signing_secret: 'va_whsec_one-time-secret',
    ...overrides,
  }
}

function delivery(): WebhookDelivery {
  return {
    id: '30000000-0000-4000-8000-000000000003',
    workspace_id: workspaceId,
    webhook_id: webhookId,
    webhook_version: 1,
    event_id: '40000000-0000-4000-8000-000000000004',
    event_type: 'webhook.test',
    state: 'pending',
    attempts: 0,
    max_attempts: 5,
    available_at: '2026-07-18T10:00:00Z',
    created_at: '2026-07-18T10:00:00Z',
    updated_at: '2026-07-18T10:00:00Z',
  }
}

function createClient(): WebhooksClient {
  return {
    listAdminWebhooks: vi.fn(async () => ({
      items: [
        webhook({ id: '50000000-0000-4000-8000-000000000005', updated_at: '2026-07-18T10:01:00Z' }),
        webhook(),
      ],
    })),
    createAdminWebhook: vi.fn(async () => secret()),
    updateAdminWebhook: vi.fn(async (_id, version) =>
      webhook({ version: version + 1, display_name: 'Updated notifications' }),
    ),
    rotateAdminWebhookSecret: vi.fn(async (_id, version) =>
      secret({ version: version + 1, signing_secret: 'va_whsec_rotated' }),
    ),
    testAdminWebhook: vi.fn(async () => delivery()),
    listAdminWebhookDeliveries: vi.fn(async () => ({ items: [delivery()] })),
  }
}

describe('Webhooks store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('loads endpoints newest first and keeps delivery history separate', async () => {
    const store = useWebhooksStore()
    const client = createClient()

    await expect(store.load(client)).resolves.toBe(true)
    await expect(store.loadDeliveries(webhookId, client)).resolves.toBe(true)

    expect(store.items.map((item) => item.updated_at)).toEqual([
      '2026-07-18T10:01:00Z',
      '2026-07-18T10:00:00Z',
    ])
    expect(store.deliveries).toHaveLength(1)
    expect(client.listAdminWebhookDeliveries).toHaveBeenCalledWith(webhookId)
  })

  it('keeps a created secret one-time and blocks another mutation until dismissed', async () => {
    const store = useWebhooksStore()
    const client = createClient()

    await expect(
      store.create(
        {
          display_name: 'Build notifications',
          url: 'https://hooks.example.test/voiceasset',
          event_types: ['job.succeeded'],
        },
        client,
      ),
    ).resolves.toBe(true)

    expect(store.oneTimeSecret?.signing_secret).toBe('va_whsec_one-time-secret')
    await expect(store.rotate(webhookId, 1, client)).resolves.toBe(false)
    expect(client.rotateAdminWebhookSecret).not.toHaveBeenCalled()

    store.clearOneTimeSecret()
    await expect(store.rotate(webhookId, 1, client)).resolves.toBe(true)
    expect(store.oneTimeSecret?.signing_secret).toBe('va_whsec_rotated')
  })

  it('returns a safe request error without exposing a secret', async () => {
    const store = useWebhooksStore()
    const client = createClient()
    vi.mocked(client.listAdminWebhooks).mockRejectedValue(
      new ApiError('Administrative scope required.', {
        status: 403,
        code: 'forbidden',
        requestId: 'request-webhook-123',
      }),
    )

    await expect(store.load(client)).resolves.toBe(false)
    expect(store.error).toBe('Administrative scope required. Request ID: request-webhook-123.')
    expect(store.error).not.toContain('va_whsec')
  })
})
