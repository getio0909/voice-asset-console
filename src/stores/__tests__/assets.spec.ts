import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/client'
import type {
  Asset,
  Principal,
  TranscriptRevision,
  TranscriptionJob,
  UploadSession,
} from '@/api/client'

import { useAssetsStore } from '../assets'
import type { PhaseOneClient } from '../assets'

const userId = '10000000-0000-4000-8000-000000000001'
const workspaceId = '20000000-0000-4000-8000-000000000002'
const assetId = '30000000-0000-4000-8000-000000000003'
const uploadId = '40000000-0000-4000-8000-000000000004'
const jobId = '50000000-0000-4000-8000-000000000005'
const revisionId = '60000000-0000-4000-8000-000000000006'
const transcriptId = '70000000-0000-4000-8000-000000000007'
const objectId = '80000000-0000-4000-8000-000000000008'
const now = '2026-07-16T08:00:00Z'

const principal: Principal = {
  id: userId,
  workspace_id: workspaceId,
  role: 'owner',
  email: 'owner@example.com',
  scopes: ['assets:write', 'audio:read', 'transcriptions:write', 'transcripts:read'],
}

const asset: Asset = {
  id: assetId,
  workspace_id: workspaceId,
  collection_id: null,
  title: 'Field note',
  language: 'en-US',
  status: 'draft',
  duration_ms: null,
  version: 1,
  created_at: now,
  updated_at: now,
}

function upload(state: UploadSession['state']): UploadSession {
  return {
    id: uploadId,
    asset_id: assetId,
    workspace_id: workspaceId,
    filename: 'field-note.wav',
    mime_type: 'audio/wav',
    expected_size: 44,
    expected_sha256: 'a'.repeat(64),
    part_size: 5_242_880,
    state,
    expires_at: '2026-07-17T08:00:00Z',
    created_at: now,
    updated_at: now,
    completed_at: state === 'completed' ? now : null,
    error_code: null,
    parts: null,
  }
}

function transcriptionJob(
  state: TranscriptionJob['state'],
  options: Partial<TranscriptionJob> = {},
): TranscriptionJob {
  return {
    id: jobId,
    workspace_id: workspaceId,
    asset_id: assetId,
    created_by: userId,
    kind: 'mock_transcribe',
    state,
    payload: { asset_id: assetId },
    attempts: state === 'queued' ? 0 : 1,
    max_attempts: 3,
    available_at: now,
    created_at: now,
    updated_at: now,
    ...options,
  }
}

const revision: TranscriptRevision = {
  id: revisionId,
  transcript_id: transcriptId,
  asset_id: assetId,
  parent_revision_id: objectId,
  kind: 'normalized',
  language: 'en-US',
  text: 'Mock transcript.',
  provider_snapshot: {
    provider_id: 'mock_asr',
    raw_schema: 'voiceasset.normalized.v1',
    version: '1',
  },
  hotword_snapshot: {},
  glossary_snapshot: {},
  diff: { changes: [] },
  validation_result: { normalizer: 'identity_v1', valid: true },
  source_job_id: jobId,
  created_by: userId,
  created_by_type: 'system',
  review_status: 'pending',
  created_at: now,
  segments: [
    {
      id: '90000000-0000-4000-8000-000000000009',
      ordinal: 0,
      start_ms: 0,
      end_ms: 800,
      speaker: null,
      text: 'Mock transcript.',
      confidence: 1,
      words: [],
    },
  ],
}

function createClient(): PhaseOneClient {
  return {
    login: vi.fn(async () => ({
      expires_at: '2026-07-17T08:00:00Z',
      refresh_expires_at: '2026-08-16T08:00:00Z',
      user: principal,
    })),
    getSession: vi.fn(async () => ({ user: principal })),
    refreshSession: vi.fn(async () => ({
      expires_at: '2026-07-17T08:00:00Z',
      refresh_expires_at: '2026-08-16T08:00:00Z',
      user: principal,
    })),
    logout: vi.fn(async () => undefined),
    createAsset: vi.fn(async () => asset),
    createUpload: vi.fn(async () => upload('active')),
    putUploadPart: vi.fn(async (_uploadId, number, body, partSha256) => ({
      number,
      size_bytes: body instanceof Blob ? body.size : body.byteLength,
      sha256: partSha256,
      created_at: now,
    })),
    completeUpload: vi.fn(async () => upload('completed')),
    createTranscription: vi.fn(async () => transcriptionJob('queued')),
    getJob: vi.fn(async () => transcriptionJob('succeeded', { result_revision_id: revisionId })),
    listTranscripts: vi.fn(async () => ({ items: [] })),
    getRevision: vi.fn(async () => revision),
    audioUrl: vi.fn(() => `/api/v1/assets/${assetId}/audio`),
  }
}

describe('assets store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('restores a cookie session without handling a browser token', async () => {
    const store = useAssetsStore()
    const client = createClient()

    await expect(store.restoreSession(client)).resolves.toBe(true)

    expect(store.sessionStatus).toBe('authenticated')
    expect(store.user).toEqual(principal)
    expect(store.sessionError).toBeNull()
  })

  it('treats an expected 401 restore response as an anonymous session', async () => {
    const store = useAssetsStore()
    const client = createClient()
    vi.mocked(client.getSession).mockRejectedValue(
      new ApiError('Authentication is required.', { status: 401, code: 'unauthorized' }),
    )
    vi.mocked(client.refreshSession).mockRejectedValue(
      new ApiError('Authentication is required.', { status: 401, code: 'unauthorized' }),
    )

    await expect(store.restoreSession(client)).resolves.toBe(false)

    expect(store.sessionStatus).toBe('anonymous')
    expect(store.user).toBeNull()
    expect(store.sessionError).toBeNull()
  })

  it('rotates the refresh cookie when the access session has expired', async () => {
    const store = useAssetsStore()
    const client = createClient()
    vi.mocked(client.getSession).mockRejectedValue(
      new ApiError('Authentication is required.', { status: 401, code: 'unauthorized' }),
    )

    await expect(store.restoreSession(client)).resolves.toBe(true)

    expect(client.refreshSession).toHaveBeenCalledOnce()
    expect(store.sessionStatus).toBe('authenticated')
    expect(store.user).toEqual(principal)
  })

  it('clears revoked session state locally without issuing a second logout request', async () => {
    const store = useAssetsStore()
    const client = createClient()
    await store.login('owner@example.com', 'password', client)

    store.clearLocalSession()

    expect(store.sessionStatus).toBe('anonymous')
    expect(store.user).toBeNull()
    expect(store.sessionError).toBeNull()
    expect(client.logout).not.toHaveBeenCalled()
  })

  it('runs the complete verified upload and Mock ASR workflow', async () => {
    const store = useAssetsStore()
    const client = createClient()
    const hash = vi
      .fn<(value: Blob | ArrayBuffer) => Promise<string>>()
      .mockResolvedValueOnce('a'.repeat(64))
      .mockResolvedValueOnce('b'.repeat(64))
    const delay = vi.fn(async () => undefined)
    const createId = vi
      .fn<() => string>()
      .mockReturnValueOnce('asset-key')
      .mockReturnValueOnce('upload-key')
      .mockReturnValueOnce('transcription-key')
    const file = new File([new Uint8Array(44)], 'field-note.wav', { type: 'audio/wav' })
    await store.login('owner@example.com', 'password', client)

    await expect(
      store.processAsset(
        { title: 'Field note', language: 'en-US', file },
        { client, hash, delay, createId, pollIntervalMs: 0, maxPolls: 3 },
      ),
    ).resolves.toBe(true)

    expect(client.createAsset).toHaveBeenCalledWith(
      { title: 'Field note', language: 'en-US' },
      'asset-key',
    )
    expect(client.createUpload).toHaveBeenCalledWith(
      expect.objectContaining({ asset_id: assetId, size_bytes: 44, sha256: 'a'.repeat(64) }),
      'upload-key',
    )
    expect(client.putUploadPart).toHaveBeenCalledWith(uploadId, 1, expect.any(Blob), 'b'.repeat(64))
    expect(client.createTranscription).toHaveBeenCalledWith(assetId, 'transcription-key')
    expect(client.getRevision).toHaveBeenCalledWith(revisionId)
    expect(store.stage).toBe('ready')
    expect(store.progressPercent).toBe(100)
    expect(store.uploadedParts).toBe(1)
    expect(store.revision).toEqual(revision)
    expect(store.audioSource).toBe(`/api/v1/assets/${assetId}/audio`)
    expect(store.workflowError).toBeNull()

    expect(store.clearAssetWorkflow('31000000-0000-4000-8000-000000000003')).toBe(false)
    expect(store.revision).toEqual(revision)
    expect(store.clearAssetWorkflow(assetId)).toBe(true)
    expect(store.stage).toBe('idle')
    expect(store.asset).toBeNull()
    expect(store.revision).toBeNull()
    expect(store.audioSource).toBeNull()
  })

  it('reports a terminal worker error without loading a transcript', async () => {
    const store = useAssetsStore()
    const client = createClient()
    vi.mocked(client.createTranscription).mockResolvedValue(
      transcriptionJob('failed', { last_error_code: 'invalid_audio' }),
    )
    const file = new File([new Uint8Array(44)], 'broken.wav', { type: 'audio/wav' })
    await store.login('owner@example.com', 'password', client)

    await expect(
      store.processAsset(
        { title: 'Broken', language: 'und', file },
        {
          client,
          hash: vi.fn(async () => 'a'.repeat(64)),
          createId: vi.fn(() => 'idempotency-key'),
        },
      ),
    ).resolves.toBe(false)

    expect(store.stage).toBe('failed')
    expect(store.workflowError).toContain('invalid_audio')
    expect(client.getRevision).not.toHaveBeenCalled()
  })

  it('rejects files outside the declared WAV boundary before server mutation', async () => {
    const store = useAssetsStore()
    const client = createClient()
    await store.login('owner@example.com', 'password', client)
    const file = new File([new Uint8Array(12)], 'short.wav', { type: 'audio/wav' })

    await expect(
      store.processAsset(
        { title: 'Too short', language: 'und', file },
        { client, hash: vi.fn(async () => 'a'.repeat(64)) },
      ),
    ).resolves.toBe(false)

    expect(store.stage).toBe('failed')
    expect(store.workflowError).toContain('between 44')
    expect(client.createAsset).not.toHaveBeenCalled()
  })
})
