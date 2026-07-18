import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/client'
import type {
  DeploymentSystemSettings,
  OperationsAuditEntry,
  OperationsJob,
  OperationsSystemStatus,
} from '@/api/client'

import { useOperationsStore } from '../operations'
import type { OperationsClient } from '../operations'

const firstJobId = '10000000-0000-4000-8000-000000000001'
const secondJobId = '20000000-0000-4000-8000-000000000002'
const firstAuditId = '30000000-0000-4000-8000-000000000003'
const secondAuditId = '40000000-0000-4000-8000-000000000004'
const now = '2026-07-17T12:00:00Z'

function job(id: string): OperationsJob {
  return {
    id,
    created_by: '50000000-0000-4000-8000-000000000005',
    kind: 'llm_correct',
    state: 'succeeded',
    attempts: 1,
    max_attempts: 3,
    available_at: now,
    created_at: now,
    updated_at: now,
  }
}

function audit(id: string): OperationsAuditEntry {
  return {
    id,
    actor_type: 'user',
    actor_email: 'owner@example.com',
    action: 'admin.job.listed',
    target_type: 'job_collection',
    metadata: { result_count: 1 },
    occurred_at: now,
  }
}

function systemStatus(): OperationsSystemStatus {
  return {
    generated_at: now,
    active_users: 2,
    assets: { total: 4, active: 3, trashed: 1, purging: 0, failed: 0, audio_duration_ms: 5_000 },
    storage: { object_count: 6, bytes: 8_192 },
    transcripts: { transcript_count: 2, revision_count: 3 },
    jobs: { total: 2, queued: 0, running: 0, retry_wait: 0, succeeded: 2, failed: 0, cancelled: 0 },
    providers: { enabled_asr: 1, enabled_llm: 1 },
  }
}

function systemSettings(): DeploymentSystemSettings {
  return {
    scope: 'deployment',
    management: 'operator_environment',
    mutable: false,
    brand_name: 'VoiceAsset',
    public_origin: 'https://voice.example.test',
    storage_backend: 'local',
    cookie_secure: true,
    provider_credential_encryption_configured: true,
  }
}

function createClient(): OperationsClient {
  return {
    listAdminJobs: vi
      .fn()
      .mockResolvedValueOnce({ items: [job(firstJobId)], next_cursor: 'next-jobs' })
      .mockResolvedValueOnce({ items: [job(secondJobId)] }),
    listAdminAuditLogs: vi
      .fn()
      .mockResolvedValueOnce({ items: [audit(firstAuditId)], next_cursor: 'next-audit' })
      .mockResolvedValueOnce({ items: [audit(secondAuditId)] }),
    getAdminSystemStatus: vi.fn(async () => systemStatus()),
    getAdminSystemSettings: vi.fn(async () => systemSettings()),
  }
}

describe('operations store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('loads the workspace-scoped status snapshot', async () => {
    const store = useOperationsStore()
    const client = createClient()

    await expect(store.loadStatus(client)).resolves.toBe(true)

    expect(store.status).toEqual(systemStatus())
    expect(store.statusError).toBeNull()
    expect(client.getAdminSystemStatus).toHaveBeenCalledOnce()
  })

  it('loads the read-only deployment settings independently', async () => {
    const store = useOperationsStore()
    const client = createClient()

    await expect(store.loadSettings(client)).resolves.toBe(true)

    expect(store.settings).toEqual(systemSettings())
    expect(store.settingsError).toBeNull()
    expect(client.getAdminSystemSettings).toHaveBeenCalledOnce()
  })

  it('binds job filters to each cursor page', async () => {
    const store = useOperationsStore()
    const client = createClient()

    expect(store.setJobFilters({ state: 'succeeded', kind: ' llm_correct ' })).toBe(true)
    await expect(store.loadJobs(client)).resolves.toBe(true)
    await expect(store.loadMoreJobs(client)).resolves.toBe(true)

    expect(store.jobs.map((item) => item.id)).toEqual([firstJobId, secondJobId])
    expect(store.jobNextCursor).toBeNull()
    expect(client.listAdminJobs).toHaveBeenNthCalledWith(1, {
      limit: 50,
      state: 'succeeded',
      kind: 'llm_correct',
    })
    expect(client.listAdminJobs).toHaveBeenNthCalledWith(2, {
      limit: 50,
      cursor: 'next-jobs',
      state: 'succeeded',
      kind: 'llm_correct',
    })
  })

  it('binds audit filters to each cursor page', async () => {
    const store = useOperationsStore()
    const client = createClient()

    expect(
      store.setAuditFilters({
        actorType: 'user',
        action: ' admin.job.listed ',
        targetType: ' job_collection ',
      }),
    ).toBe(true)
    await expect(store.loadAuditLogs(client)).resolves.toBe(true)
    await expect(store.loadMoreAuditLogs(client)).resolves.toBe(true)

    expect(store.auditEntries.map((item) => item.id)).toEqual([firstAuditId, secondAuditId])
    expect(store.auditNextCursor).toBeNull()
    expect(client.listAdminAuditLogs).toHaveBeenNthCalledWith(2, {
      limit: 50,
      cursor: 'next-audit',
      actorType: 'user',
      action: 'admin.job.listed',
      targetType: 'job_collection',
    })
  })

  it('keeps failures isolated by administration read model', async () => {
    const store = useOperationsStore()
    const client = createClient()
    vi.mocked(client.listAdminJobs).mockReset()
    vi.mocked(client.listAdminJobs).mockRejectedValue(
      new ApiError('Jobs unavailable.', { requestId: 'request-jobs', status: 503 }),
    )

    await expect(store.loadJobs(client)).resolves.toBe(false)
    await expect(store.loadStatus(client)).resolves.toBe(true)

    expect(store.jobsError).toBe('Jobs unavailable. Request ID: request-jobs.')
    expect(store.statusError).toBeNull()
    expect(store.status?.active_users).toBe(2)
  })

  it('clears loaded administration data and filters', async () => {
    const store = useOperationsStore()
    const client = createClient()
    store.setJobFilters({ state: 'failed' })
    store.setAuditFilters({ actorType: 'agent' })
    await store.loadStatus(client)
    await store.loadJobs(client)
    await store.loadAuditLogs(client)

    store.reset()

    expect(store.status).toBeNull()
    expect(store.jobs).toEqual([])
    expect(store.auditEntries).toEqual([])
    expect(store.jobStateFilter).toBe('')
    expect(store.auditActorFilter).toBe('')
  })
})
