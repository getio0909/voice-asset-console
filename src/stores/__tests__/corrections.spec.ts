import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  ApprovalResult,
  GlossarySet,
  LLMProfile,
  TranscriptExport,
  TranscriptKind,
  TranscriptRevision,
  TranscriptionJob,
} from '@/api/client'

import { useCorrectionsStore } from '../corrections'
import type { PhaseThreeClient } from '../corrections'

const workspaceId = '10000000-0000-4000-8000-000000000001'
const assetId = '20000000-0000-4000-8000-000000000002'
const transcriptId = '30000000-0000-4000-8000-000000000003'
const sourceRevisionId = '40000000-0000-4000-8000-000000000004'
const correctedRevisionId = '50000000-0000-4000-8000-000000000005'
const humanRevisionId = '60000000-0000-4000-8000-000000000006'
const approvedRevisionId = '70000000-0000-4000-8000-000000000007'
const segmentId = '80000000-0000-4000-8000-000000000008'
const profileId = '90000000-0000-4000-8000-000000000009'
const glossaryId = 'a0000000-0000-4000-8000-00000000000a'
const jobId = 'b0000000-0000-4000-8000-00000000000b'
const reviewerId = 'c0000000-0000-4000-8000-00000000000c'
const exportId = 'f0000000-0000-4000-8000-00000000000f'
const now = '2026-07-16T12:00:00Z'

const glossary: GlossarySet = {
  id: glossaryId,
  workspace_id: workspaceId,
  display_name: 'Platform corrections',
  scope_type: 'workspace',
  scope_id: null,
  state: 'enabled',
  current_version: 1,
  resource_version: 1,
  entries: [
    {
      canonical_form: '容器云',
      aliases: ['容易云'],
      language: 'zh-CN',
      priority: 100,
    },
  ],
  created_at: now,
  updated_at: now,
}

const profile: LLMProfile = {
  id: profileId,
  workspace_id: workspaceId,
  provider_id: 'mock_llm',
  display_name: 'Mock correction',
  config: {
    model: 'deterministic_glossary_v1',
    timeout: '30s',
    concurrency: 32,
    temperature: 0,
    context_limit: 64_000,
    structured_output: true,
    prompt_template: 'correction.v1',
    default_glossary_id: glossaryId,
    auto_approval_policy: 'never',
  },
  state: 'enabled',
  priority: 1,
  version: 1,
  secret_configured: false,
  created_at: now,
  updated_at: now,
}

function revision(id: string, kind: TranscriptKind, text: string): TranscriptRevision {
  const parentRevisionId =
    kind === 'llm_corrected'
      ? sourceRevisionId
      : kind === 'human_edited'
        ? correctedRevisionId
        : kind === 'approved'
          ? humanRevisionId
          : undefined
  return {
    id,
    transcript_id: transcriptId,
    asset_id: assetId,
    ...(parentRevisionId ? { parent_revision_id: parentRevisionId } : {}),
    kind,
    language: 'zh-CN',
    text,
    provider_snapshot: { provider_id: 'mock_llm' },
    hotword_snapshot: {},
    glossary_snapshot: { sets: [{ id: glossaryId, version: 1, scope_type: 'workspace' }] },
    diff:
      kind === 'llm_corrected'
        ? {
            changes: [
              {
                segment_id: segmentId,
                original: '容易云调度',
                replacement: '容器云调度',
                confidence: 1,
                reason: 'glossary match',
              },
            ],
          }
        : { changes: [] },
    validation_result: { valid: true },
    created_by_type: 'system',
    review_status: kind === 'approved' ? 'approved' : 'pending',
    created_at: now,
    segments: [
      {
        id: segmentId,
        ordinal: 0,
        start_ms: 0,
        end_ms: 1_000,
        speaker: null,
        text,
        confidence: 1,
        words: [],
      },
    ],
  }
}

const corrected = revision(correctedRevisionId, 'llm_corrected', '容器云调度')
const approval: ApprovalResult = {
  review: {
    id: 'd0000000-0000-4000-8000-00000000000d',
    revision_id: correctedRevisionId,
    reviewer_id: reviewerId,
    action: 'approve',
    resulting_revision_id: approvedRevisionId,
    created_at: now,
  },
  human_revision: revision(humanRevisionId, 'human_edited', '容器云调度'),
  approved_revision: revision(approvedRevisionId, 'approved', '容器云调度'),
}

const transcriptExport: TranscriptExport = {
  id: exportId,
  asset_id: assetId,
  revision_id: approvedRevisionId,
  format: 'markdown',
  mime_type: 'text/markdown; charset=utf-8',
  file_size: 512,
  sha256: 'b'.repeat(64),
  download_url: `/api/v1/transcript-exports/${exportId}`,
  created_at: now,
  expires_at: '2026-07-16T13:00:00Z',
}

function correctionJob(
  state: TranscriptionJob['state'],
  resultRevisionId = correctedRevisionId,
): TranscriptionJob {
  return {
    id: jobId,
    workspace_id: workspaceId,
    asset_id: assetId,
    created_by: reviewerId,
    kind: 'llm_correct',
    state,
    payload: { source_revision_id: sourceRevisionId },
    attempts: state === 'queued' ? 0 : 1,
    max_attempts: 3,
    available_at: now,
    ...(state === 'succeeded' ? { result_revision_id: resultRevisionId } : {}),
    created_at: now,
    updated_at: now,
  }
}

function createClient(): PhaseThreeClient {
  return {
    listGlossarySets: vi.fn(async () => ({ items: [glossary] })),
    createGlossarySet: vi.fn(async () => glossary),
    listLLMProfiles: vi.fn(async () => ({ items: [profile] })),
    createLLMProfile: vi.fn(async () => profile),
    checkLLMProfileHealth: vi.fn(async () => ({
      profile_id: profileId,
      status: 'healthy' as const,
      checked_at: now,
    })),
    createCorrection: vi.fn(async () => correctionJob('queued')),
    getJob: vi.fn(async () => correctionJob('succeeded')),
    getRevision: vi.fn(async () => corrected),
    createReview: vi.fn(async (_revisionId, input) => ({
      id: 'e0000000-0000-4000-8000-00000000000e',
      revision_id: correctedRevisionId,
      reviewer_id: reviewerId,
      action: input.action,
      ...('change_index' in input ? { change_index: input.change_index } : {}),
      created_at: now,
    })),
    approveRevision: vi.fn(async () => approval),
    createTranscriptExport: vi.fn(async () => transcriptExport),
    transcriptExportUrl: vi.fn((id) => `/api/v1/transcript-exports/${id}`),
  }
}

describe('corrections store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('loads separate glossary and credential-free LLM profile records', async () => {
    const store = useCorrectionsStore()
    const client = createClient()

    await expect(store.loadConfiguration(client)).resolves.toBe(true)

    expect(store.glossaries).toEqual([glossary])
    expect(store.profiles).toEqual([profile])
    expect(store.profiles[0]?.secret_configured).toBe(false)
    expect(store.configurationError).toBeNull()
  })

  it('creates safe Mock configuration, reviews one change, and approves conservatively', async () => {
    const store = useCorrectionsStore()
    const client = createClient()

    await expect(store.createMockProfile('Mock correction', glossaryId, client)).resolves.toBe(true)
    expect(client.createLLMProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        provider_id: 'mock_llm',
        state: 'enabled',
        config: expect.objectContaining({ default_glossary_id: glossaryId }),
      }),
    )

    await expect(
      store.runCorrection(sourceRevisionId, {
        client,
        delay: vi.fn(async () => undefined),
        createId: vi.fn(() => 'correction-idempotency-key'),
        pollIntervalMs: 0,
        maxPolls: 2,
      }),
    ).resolves.toBe(true)
    expect(store.stage).toBe('reviewing')
    expect(store.changes).toHaveLength(1)

    await expect(
      store.recordDecision({ action: 'accept_change', change_index: 0 }, client),
    ).resolves.toBe(true)
    expect(store.decisions).toEqual({ 0: 'accepted' })

    await expect(store.approve(client)).resolves.toBe(true)
    expect(client.approveRevision).toHaveBeenCalledWith(correctedRevisionId, false)
    expect(store.stage).toBe('approved')
    expect(store.approval?.approved_revision.kind).toBe('approved')

    await expect(store.createExport(approvedRevisionId, 'markdown', client)).resolves.toBe(true)
    expect(client.createTranscriptExport).toHaveBeenCalledWith(approvedRevisionId, 'markdown')
    expect(client.transcriptExportUrl).toHaveBeenCalledWith(exportId)
    expect(store.exportArtifact).toEqual(transcriptExport)
    expect(store.exportDownloadUrl).toBe(`/api/v1/transcript-exports/${exportId}`)
    expect(store.exportError).toBeNull()
  })

  it('does not expose raw provider failures in workflow state', async () => {
    const store = useCorrectionsStore()
    const client = createClient()
    vi.mocked(client.createCorrection).mockRejectedValue(
      new Error('Correction service unavailable.'),
    )

    await expect(
      store.runCorrection(sourceRevisionId, { client, createId: () => 'key' }),
    ).resolves.toBe(false)

    expect(store.stage).toBe('failed')
    expect(store.operationError).toBe('Correction service unavailable.')
    expect(store.proposal).toBeNull()
  })

  it('recognizes an atomically auto-approved correction result', async () => {
    const store = useCorrectionsStore()
    const client = createClient()
    vi.mocked(client.getJob).mockResolvedValue(correctionJob('succeeded', approvedRevisionId))
    vi.mocked(client.getRevision).mockResolvedValue(approval.approved_revision)

    await expect(
      store.runCorrection(sourceRevisionId, {
        client,
        delay: vi.fn(async () => undefined),
        createId: () => 'auto-correction-key',
        pollIntervalMs: 0,
        maxPolls: 2,
      }),
    ).resolves.toBe(true)

    expect(store.stage).toBe('approved')
    expect(store.proposal).toBeNull()
    expect(store.approval).toBeNull()
    expect(store.autoApprovedRevision?.id).toBe(approvedRevisionId)
  })

  it('fails closed when an export response does not match the approved revision', async () => {
    const store = useCorrectionsStore()
    const client = createClient()

    await store.runCorrection(sourceRevisionId, {
      client,
      delay: vi.fn(async () => undefined),
      createId: () => 'correction-key',
      pollIntervalMs: 0,
      maxPolls: 2,
    })
    await store.recordDecision({ action: 'accept_all' }, client)
    await store.approve(client)
    vi.mocked(client.createTranscriptExport).mockResolvedValue({
      ...transcriptExport,
      revision_id: sourceRevisionId,
    })

    await expect(store.createExport(approvedRevisionId, 'markdown', client)).resolves.toBe(false)

    expect(store.exportArtifact).toBeNull()
    expect(store.exportDownloadUrl).toBeNull()
    expect(store.exportError).toContain('does not match')
  })
})
