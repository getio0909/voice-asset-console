import { createHash } from 'node:crypto'

import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { CONTRACT_VERSION } from '../src/config/contract'
import { createWav } from './wav'

const userId = '10000000-0000-4000-8000-000000000001'
const workspaceId = '20000000-0000-4000-8000-000000000002'
const assetId = '30000000-0000-4000-8000-000000000003'
const uploadId = '40000000-0000-4000-8000-000000000004'
const jobId = '50000000-0000-4000-8000-000000000005'
const revisionId = '60000000-0000-4000-8000-000000000006'
const transcriptId = '70000000-0000-4000-8000-000000000007'
const objectId = '80000000-0000-4000-8000-000000000008'
const segmentId = '90000000-0000-4000-8000-000000000009'
const glossaryId = 'a0000000-0000-4000-8000-00000000000a'
const profileId = 'b0000000-0000-4000-8000-00000000000b'
const correctionJobId = 'c0000000-0000-4000-8000-00000000000c'
const correctedRevisionId = 'd0000000-0000-4000-8000-00000000000d'
const humanRevisionId = 'e0000000-0000-4000-8000-00000000000e'
const approvedRevisionId = 'f0000000-0000-4000-8000-00000000000f'
const correctedSegmentId = '91000000-0000-4000-8000-000000000010'
const humanSegmentId = '92000000-0000-4000-8000-000000000011'
const approvedSegmentId = '93000000-0000-4000-8000-000000000012'
const currentSessionId = '94000000-0000-4000-8000-000000000013'
const otherSessionId = '95000000-0000-4000-8000-000000000014'
const apiKeyId = '96000000-0000-4000-8000-000000000015'
const collectionId = '97000000-0000-4000-8000-000000000016'
const tagId = '98000000-0000-4000-8000-000000000017'
const annotationId = '98000000-0000-4000-8000-000000000017'
const exportId = '99000000-0000-4000-8000-000000000018'
const purgeJobId = '9a000000-0000-4000-8000-000000000019'
const now = '2026-07-16T08:00:00Z'
const waveformPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Xw5nAAAAAElFTkSuQmCC',
  'base64',
)

const principal = {
  id: userId,
  workspace_id: workspaceId,
  role: 'owner',
  email: 'owner@example.com',
  scopes: [
    'admin:read',
    'admin:write',
    'assets:read',
    'assets:write',
    'audio:read',
    'corrections:write',
    'metadata:write',
    'transcriptions:write',
    'transcripts:read',
  ],
}

function derivedRevision(
  id: string,
  kind: 'llm_corrected' | 'human_edited' | 'approved',
  parentRevisionId: string,
  segment: string,
) {
  return {
    id,
    transcript_id: transcriptId,
    asset_id: assetId,
    parent_revision_id: parentRevisionId,
    kind,
    language: 'en-US',
    text: 'VoiceAsset transcript from the verified recording.',
    provider_snapshot: {
      provider_id: 'mock_llm',
      model: 'deterministic_glossary_v1',
      prompt_version: 'correction.v1',
    },
    hotword_snapshot: {},
    glossary_snapshot: { sets: [{ id: glossaryId, version: 1, scope_type: 'workspace' }] },
    diff:
      kind === 'llm_corrected'
        ? {
            changes: [
              {
                segment_id: segmentId,
                original: 'Mock transcript from the verified recording.',
                replacement: 'VoiceAsset transcript from the verified recording.',
                confidence: 1,
                reason: 'glossary match',
              },
            ],
          }
        : { changes: [] },
    validation_result: { valid: true, timeline_preserved: true },
    created_by: userId,
    created_by_type: kind === 'llm_corrected' ? 'system' : 'user',
    model: 'deterministic_glossary_v1',
    prompt_version: 'correction.v1',
    review_status:
      kind === 'approved' ? 'approved' : kind === 'human_edited' ? 'reviewed' : 'pending',
    created_at: now,
    segments: [
      {
        id: segment,
        ordinal: 0,
        start_ms: 0,
        end_ms: 100,
        speaker: null,
        text: 'VoiceAsset transcript from the verified recording.',
        confidence: 1,
        words: [],
      },
    ],
  }
}

test('completes the asset, session, correction, and API-key administration workflows', async ({
  page,
}) => {
  const wav = createWav()
  const fileSha256 = createHash('sha256').update(wav).digest('hex')
  let authenticated = false
  let uploadedPart = false
  let jobPolls = 0
  const unsafeRequests: Array<{ method: string; path: string; authorization: string | null }> = []
  let loginPayload: unknown
  let assetPayload: unknown
  let assetIdempotencyKey: string | null = null
  let assetCreated = false
  let assetTitle = 'Field note'
  let assetLanguage = 'en-US'
  let assetCollectionId: string | null = null
  let assetStatus = 'draft'
  let assetDurationMs: number | null = null
  let assetVersion = 1
  let assetStatusBeforeTrash = 'draft'
  let assignedTagIds = new Set<string>()
  let tagMutationIfMatch: string | null = null
  const trashIfMatches: Array<string | null> = []
  let restoreIfMatch: string | null = null
  let purgeIfMatch: string | null = null
  let purgeIdempotencyKey: string | null = null
  let purgePayload: unknown
  let purgeState: 'queued' | 'succeeded' = 'queued'
  let metadataPayload: unknown
  let metadataIfMatch: string | null = null
  let waveformFetches = 0
  let annotationPayload: unknown
  const annotationItems: Array<Record<string, unknown>> = []
  const assetSearchQueries: string[] = []
  const assetSearchFilters: Array<{ provider: string; speaker: string }> = []
  let uploadPayload: unknown
  let uploadIdempotencyKey: string | null = null
  let uploadedPartMatches = false
  let uploadedPartContentType: string | null = null
  let uploadedPartSha256: string | null = null
  let completedAfterPart = false
  let transcriptionIdempotencyKey: string | null = null
  let glossaryPayload: unknown
  let profilePayload: unknown
  let correctionIdempotencyKey: string | null = null
  let reviewPayload: unknown
  let approvalPayload: unknown
  let exportPayload: unknown
  let apiKeyPayload: unknown
  let glossaryCreated = false
  let profileCreated = false
  let apiKeyRevokedAt: string | null = null
  let apiKeyExpiresAt = '2099-01-01T00:00:00.000Z'
  let deviceSessions = [
    {
      id: currentSessionId,
      device_name: 'VoiceAsset Console',
      current: true,
      created_at: now,
      last_seen_at: now,
      expires_at: '2026-07-17T08:00:00Z',
      refresh_expires_at: '2026-08-16T08:00:00Z',
    },
    {
      id: otherSessionId,
      device_name: 'Pixel 9 Pro',
      current: false,
      created_at: '2026-07-15T08:00:00Z',
      last_seen_at: '2026-07-16T07:00:00Z',
      expires_at: '2026-07-17T07:00:00Z',
      refresh_expires_at: '2026-08-15T08:00:00Z',
    },
  ]

  const glossaryRecord = {
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
        canonical_form: 'VoiceAsset',
        aliases: ['Voice asset'],
        language: 'en-US',
        context_terms: [],
        forbidden_contexts: [],
        regex: false,
        case_sensitive: false,
        priority: 100,
        description: 'Created in VoiceAsset Console',
      },
    ],
    created_at: now,
    updated_at: now,
  }
  const profileRecord = {
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
  const apiKeyRecord = () => ({
    id: apiKeyId,
    workspace_id: workspaceId,
    name: 'CI reader',
    token_prefix: 'va_pat_example1',
    scopes: ['assets:read', 'transcripts:read'],
    expires_at: apiKeyExpiresAt,
    revoked_at: apiKeyRevokedAt,
    last_used_at: null,
    created_at: now,
  })
  const assetRecord = () => ({
    id: assetId,
    workspace_id: workspaceId,
    collection_id: assetCollectionId,
    title: assetTitle,
    language: assetLanguage,
    status: assetStatus,
    duration_ms: assetDurationMs,
    version: assetVersion,
    created_at: now,
    updated_at: now,
  })
  let apiKeyItems: ReturnType<typeof apiKeyRecord>[] = []
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()
    if (!['GET', 'HEAD'].includes(method)) {
      unsafeRequests.push({
        method,
        path,
        authorization: await request.headerValue('authorization'),
      })
    }

    if (method === 'GET' && path === '/api/v1/system/capabilities') {
      await route.fulfill({
        json: {
          server_version: '0.2.0-dev',
          api_version: 'v1',
          contract_version: CONTRACT_VERSION,
          features: [
            'account_password_change',
            'admin_operations',
            'aliyun_asr',
            'asr_hotwords',
            'asset_filters',
            'asset_lifecycle',
            'asset_purge',
            'authenticated_audio',
            'capability_negotiation',
            'deployment_settings_read',
            'device_pairing',
            'device_sessions',
            'encrypted_provider_profiles',
            'full_text_search',
            'health_checks',
            'incremental_sync',
            'llm_corrections',
            'llm_glossaries',
            'llm_provider_profiles',
            'local_auth',
            'membership_management',
            'mock_asr',
            'raw_transcripts',
            'refresh_sessions',
            'request_ids',
            'resumable_uploads',
            'structured_errors',
            'tencent_asr',
            'transcript_approval',
            'transcription_jobs',
            'waveforms',
            'workspace_management',
          ],
        },
      })
      return
    }

    if (method === 'GET' && path === '/api/v1/auth/session') {
      if (!authenticated) {
        await route.fulfill({
          status: 401,
          json: {
            error: {
              code: 'unauthorized',
              message: 'Authentication is required.',
              request_id: 'request-session',
            },
          },
        })
        return
      }
      await route.fulfill({ json: { user: principal } })
      return
    }

    if (method === 'POST' && path === '/api/v1/auth/sessions') {
      loginPayload = request.postDataJSON()
      authenticated = true
      await route.fulfill({
        status: 201,
        json: {
          expires_at: '2026-07-17T08:00:00Z',
          refresh_expires_at: '2026-08-16T08:00:00Z',
          user: principal,
        },
      })
      return
    }

    if (method === 'POST' && path === '/api/v1/auth/session/refresh') {
      await route.fulfill({
        status: 401,
        json: {
          error: {
            code: 'unauthorized',
            message: 'Authentication is required.',
            request_id: 'request-refresh',
          },
        },
      })
      return
    }

    if (method === 'GET' && path === '/api/v1/auth/device-sessions') {
      await route.fulfill({ json: { items: deviceSessions } })
      return
    }

    if (method === 'DELETE' && path.startsWith('/api/v1/auth/device-sessions/')) {
      const revokedId = path.slice('/api/v1/auth/device-sessions/'.length)
      deviceSessions = deviceSessions.filter((session) => session.id !== revokedId)
      await route.fulfill({ status: 204 })
      return
    }

    if (method === 'GET' && path === '/api/v1/api-keys') {
      await route.fulfill({ json: { items: apiKeyItems } })
      return
    }

    if (method === 'POST' && path === '/api/v1/api-keys') {
      apiKeyPayload = request.postDataJSON()
      apiKeyExpiresAt = (apiKeyPayload as { expires_at: string }).expires_at
      apiKeyItems = [apiKeyRecord()]
      await route.fulfill({
        status: 201,
        json: { api_key: apiKeyRecord(), token: 'one-time-plaintext-token' },
      })
      return
    }

    if (method === 'DELETE' && path === `/api/v1/api-keys/${apiKeyId}`) {
      apiKeyRevokedAt = now
      apiKeyItems = [apiKeyRecord()]
      await route.fulfill({ json: apiKeyRecord() })
      return
    }

    if (method === 'GET' && path === '/api/v1/admin/jobs') {
      await route.fulfill({
        json: {
          items: [
            {
              id: jobId,
              asset_id: assetId,
              created_by: userId,
              kind: 'llm_correct',
              state: 'succeeded',
              attempts: 1,
              max_attempts: 3,
              available_at: now,
              result_revision_id: correctedRevisionId,
              created_at: now,
              updated_at: now,
            },
          ],
        },
      })
      return
    }

    if (method === 'GET' && path === '/api/v1/admin/audit-logs') {
      await route.fulfill({
        json: {
          items: [
            {
              id: currentSessionId,
              actor_id: userId,
              actor_email: 'owner@example.com',
              actor_type: 'user',
              action: 'admin.job.listed',
              target_type: 'job_collection',
              request_id: 'request-admin-jobs',
              metadata: { result_count: 1 },
              occurred_at: now,
            },
          ],
        },
      })
      return
    }

    if (method === 'GET' && path === '/api/v1/admin/system-status') {
      await route.fulfill({
        json: {
          generated_at: now,
          active_users: 1,
          assets: {
            total: 1,
            active: 1,
            trashed: 0,
            purging: 0,
            failed: 0,
            audio_duration_ms: 100,
          },
          storage: { object_count: 2, bytes: 256 },
          transcripts: { transcript_count: 1, revision_count: 3 },
          jobs: {
            total: 2,
            queued: 0,
            running: 0,
            retry_wait: 0,
            succeeded: 2,
            failed: 0,
            cancelled: 0,
          },
          providers: { enabled_asr: 1, enabled_llm: 1 },
        },
      })
      return
    }

    if (method === 'GET' && path === '/api/v1/assets') {
      const query = url.searchParams.get('q') ?? ''
      const status = url.searchParams.get('status')
      const provider = url.searchParams.get('provider_id') ?? ''
      const speaker = url.searchParams.get('speaker') ?? ''
      const requestedTagId = url.searchParams.get('tag_id')
      const requestedCollectionId = url.searchParams.get('collection_id')
      assetSearchQueries.push(query)
      assetSearchFilters.push({ provider, speaker })
      const titleMatches = assetTitle.toLocaleLowerCase().includes(query.toLocaleLowerCase())
      const transcriptText = 'VoiceAsset transcript from the verified recording.'
      const transcriptMatches = transcriptText
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase())
      const matches = !query || titleMatches || transcriptMatches
      const statusMatches = status ? assetStatus === status : assetStatus !== 'trashed'
      const providerMatches = !provider || provider === 'mock_asr'
      const speakerMatches = !speaker || speaker.toLocaleLowerCase() === 'speaker-1'
      const tagMatches = !requestedTagId || assignedTagIds.has(requestedTagId)
      const collectionMatches =
        !requestedCollectionId || assetCollectionId === requestedCollectionId
      const searchRequested = Boolean(query || provider || speaker)
      const matchingAsset = {
        ...assetRecord(),
        ...(searchRequested
          ? {
              search: {
                title: titleMatches,
                provider_ids: ['mock_asr'],
                segments:
                  transcriptMatches && speakerMatches
                    ? [
                        {
                          transcript_id: transcriptId,
                          revision_id: revisionId,
                          segment_id: segmentId,
                          ordinal: 0,
                          start_ms: 0,
                          end_ms: 100,
                          speaker: 'speaker-1',
                          text: transcriptText,
                        },
                      ]
                    : [],
              },
            }
          : {}),
      }
      await route.fulfill({
        json: {
          items:
            assetCreated &&
            matches &&
            statusMatches &&
            providerMatches &&
            speakerMatches &&
            tagMatches &&
            collectionMatches
              ? [matchingAsset]
              : [],
        },
      })
      return
    }

    if (method === 'GET' && path === '/api/v1/collections') {
      await route.fulfill({
        json: {
          items: [
            {
              id: collectionId,
              workspace_id: workspaceId,
              name: 'Research calls',
              description: 'Recorded research interviews',
              version: 1,
              asset_count: assetCollectionId === collectionId ? 1 : 0,
              created_at: now,
              updated_at: now,
            },
          ],
        },
      })
      return
    }

    if (method === 'GET' && path === '/api/v1/tags') {
      await route.fulfill({
        json: {
          items: [
            {
              id: tagId,
              workspace_id: workspaceId,
              name: 'Important',
              color: '#ff8800',
              asset_count: assignedTagIds.has(tagId) && assetStatus !== 'trashed' ? 1 : 0,
              created_at: now,
            },
          ],
        },
      })
      return
    }

    if (method === 'GET' && path === `/api/v1/assets/${assetId}/tags`) {
      await route.fulfill({
        json: {
          items: assignedTagIds.has(tagId)
            ? [
                {
                  id: tagId,
                  workspace_id: workspaceId,
                  name: 'Important',
                  color: '#ff8800',
                  asset_count: 1,
                  created_at: now,
                },
              ]
            : [],
        },
      })
      return
    }

    if ((method === 'POST' || method === 'DELETE') && path === `/api/v1/assets/${assetId}/tags`) {
      tagMutationIfMatch = await request.headerValue('if-match')
      const input = request.postDataJSON() as { tag_ids: string[] }
      if (method === 'POST') assignedTagIds = new Set([...assignedTagIds, ...input.tag_ids])
      else assignedTagIds = new Set([...assignedTagIds].filter((id) => !input.tag_ids.includes(id)))
      await route.fulfill({
        json: { asset_id: assetId, tag_ids: input.tag_ids, changed_count: 1 },
      })
      return
    }

    if (method === 'GET' && path === `/api/v1/assets/${assetId}`) {
      await route.fulfill({ json: assetRecord() })
      return
    }

    if (method === 'DELETE' && path === `/api/v1/assets/${assetId}`) {
      trashIfMatches.push(await request.headerValue('if-match'))
      assetStatusBeforeTrash = assetStatus
      assetStatus = 'trashed'
      assetVersion += 1
      await route.fulfill({ json: assetRecord() })
      return
    }

    if (method === 'POST' && path === `/api/v1/assets/${assetId}/restore`) {
      restoreIfMatch = await request.headerValue('if-match')
      assetStatus = assetStatusBeforeTrash
      assetVersion += 1
      await route.fulfill({ json: assetRecord() })
      return
    }

    if (method === 'POST' && path === `/api/v1/assets/${assetId}/purge`) {
      purgeIfMatch = await request.headerValue('if-match')
      purgeIdempotencyKey = await request.headerValue('idempotency-key')
      purgePayload = request.postDataJSON()
      assetVersion += 1
      assetCreated = false
      purgeState = 'queued'
      await route.fulfill({
        status: 202,
        json: {
          job_id: purgeJobId,
          asset_id: assetId,
          asset_version: assetVersion,
          state: purgeState,
          requested_at: now,
        },
      })
      return
    }

    if (method === 'GET' && path === `/api/v1/asset-purge-jobs/${purgeJobId}`) {
      purgeState = 'succeeded'
      await route.fulfill({
        json: {
          job_id: purgeJobId,
          asset_id: assetId,
          asset_version: assetVersion,
          state: purgeState,
          requested_at: now,
        },
      })
      return
    }

    if (method === 'GET' && path === `/api/v1/assets/${assetId}/annotations`) {
      await route.fulfill({ json: { items: annotationItems } })
      return
    }

    if (method === 'POST' && path === `/api/v1/assets/${assetId}/annotations`) {
      annotationPayload = request.postDataJSON()
      const input = annotationPayload as {
        kind: 'bookmark' | 'note'
        start_ms: number
        end_ms?: number | null
        body: string
      }
      const created = {
        id: annotationId,
        workspace_id: workspaceId,
        asset_id: assetId,
        kind: input.kind,
        start_ms: input.start_ms,
        end_ms: input.end_ms ?? null,
        body: input.body,
        version: 1,
        created_by: userId,
        created_at: now,
        updated_at: now,
      }
      annotationItems.unshift(created)
      await route.fulfill({ status: 201, json: created })
      return
    }

    if (method === 'GET' && path === `/api/v1/assets/${assetId}/processing-status`) {
      await route.fulfill({
        json: {
          asset_id: assetId,
          asset_status: assetStatus,
          active: false,
          jobs: [
            {
              id: jobId,
              kind: 'mock_transcribe',
              state: 'succeeded',
              attempts: 1,
              max_attempts: 3,
              last_error_code: null,
              result_revision_id: revisionId,
              created_at: now,
              updated_at: now,
            },
          ],
          updated_at: now,
        },
      })
      return
    }

    if (method === 'PUT' && path === `/api/v1/assets/${assetId}/metadata`) {
      metadataIfMatch = await request.headerValue('if-match')
      metadataPayload = request.postDataJSON()
      const input = metadataPayload as {
        title: string
        language: string
        collection_id: string | null
      }
      assetTitle = input.title
      assetLanguage = input.language
      assetCollectionId = input.collection_id
      assetVersion += 1
      await route.fulfill({ json: assetRecord() })
      return
    }

    if (method === 'POST' && path === '/api/v1/assets') {
      assetIdempotencyKey = await request.headerValue('idempotency-key')
      assetPayload = request.postDataJSON()
      const input = assetPayload as { title: string; language: string }
      assetTitle = input.title
      assetLanguage = input.language
      assetCreated = true
      await route.fulfill({
        status: 201,
        json: assetRecord(),
      })
      return
    }

    if (method === 'POST' && path === '/api/v1/uploads') {
      uploadIdempotencyKey = await request.headerValue('idempotency-key')
      uploadPayload = request.postDataJSON()
      await route.fulfill({
        status: 201,
        json: {
          id: uploadId,
          asset_id: assetId,
          workspace_id: workspaceId,
          filename: 'field-note.wav',
          mime_type: 'audio/wav',
          expected_size: wav.length,
          expected_sha256: fileSha256,
          part_size: 5_242_880,
          state: 'active',
          expires_at: '2026-07-17T08:00:00Z',
          created_at: now,
          updated_at: now,
          completed_at: null,
          error_code: null,
          parts: null,
        },
      })
      return
    }

    if (method === 'PUT' && path === `/api/v1/uploads/${uploadId}/parts/1`) {
      const body = request.postDataBuffer()
      uploadedPartMatches = body?.equals(wav) ?? false
      uploadedPartContentType = await request.headerValue('content-type')
      uploadedPartSha256 = await request.headerValue('x-part-sha256')
      uploadedPart = true
      await route.fulfill({
        status: 201,
        json: {
          number: 1,
          size_bytes: wav.length,
          sha256: fileSha256,
          created_at: now,
        },
      })
      return
    }

    if (method === 'POST' && path === `/api/v1/uploads/${uploadId}/complete`) {
      completedAfterPart = uploadedPart
      await route.fulfill({
        json: {
          id: uploadId,
          asset_id: assetId,
          workspace_id: workspaceId,
          filename: 'field-note.wav',
          mime_type: 'audio/wav',
          expected_size: wav.length,
          expected_sha256: fileSha256,
          part_size: 5_242_880,
          state: 'completed',
          expires_at: '2026-07-17T08:00:00Z',
          created_at: now,
          updated_at: now,
          completed_at: now,
          error_code: null,
          parts: null,
        },
      })
      return
    }

    if (method === 'POST' && path === `/api/v1/assets/${assetId}/transcriptions`) {
      transcriptionIdempotencyKey = await request.headerValue('idempotency-key')
      await route.fulfill({
        status: 202,
        json: {
          id: jobId,
          workspace_id: workspaceId,
          asset_id: assetId,
          created_by: userId,
          kind: 'mock_transcribe',
          state: 'queued',
          payload: { asset_id: assetId },
          attempts: 0,
          max_attempts: 3,
          available_at: now,
          created_at: now,
          updated_at: now,
        },
      })
      return
    }

    if (method === 'GET' && path === `/api/v1/transcription-jobs/${jobId}`) {
      jobPolls += 1
      assetStatus = 'ready'
      assetDurationMs = 100
      await route.fulfill({
        json: {
          id: jobId,
          workspace_id: workspaceId,
          asset_id: assetId,
          created_by: userId,
          kind: 'mock_transcribe',
          state: 'succeeded',
          payload: { asset_id: assetId },
          attempts: 1,
          max_attempts: 3,
          available_at: now,
          result_revision_id: revisionId,
          created_at: now,
          updated_at: now,
        },
      })
      return
    }

    if (method === 'GET' && path === `/api/v1/transcript-revisions/${revisionId}`) {
      await route.fulfill({
        json: {
          id: revisionId,
          transcript_id: transcriptId,
          asset_id: assetId,
          parent_revision_id: objectId,
          kind: 'normalized',
          language: 'en-US',
          text: 'Mock transcript from the verified recording.',
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
              id: segmentId,
              ordinal: 0,
              start_ms: 0,
              end_ms: 100,
              speaker: null,
              text: 'Mock transcript from the verified recording.',
              confidence: 1,
              words: [],
            },
          ],
        },
      })
      return
    }

    if (method === 'GET' && path === '/api/v1/glossary-sets') {
      await route.fulfill({ json: { items: glossaryCreated ? [glossaryRecord] : [] } })
      return
    }

    if (method === 'POST' && path === '/api/v1/glossary-sets') {
      glossaryPayload = request.postDataJSON()
      glossaryCreated = true
      await route.fulfill({ status: 201, json: glossaryRecord })
      return
    }

    if (method === 'GET' && path === '/api/v1/llm-profiles') {
      await route.fulfill({ json: { items: profileCreated ? [profileRecord] : [] } })
      return
    }

    if (method === 'POST' && path === '/api/v1/llm-profiles') {
      profilePayload = request.postDataJSON()
      profileCreated = true
      await route.fulfill({ status: 201, json: profileRecord })
      return
    }

    if (method === 'POST' && path === `/api/v1/transcript-revisions/${revisionId}/corrections`) {
      correctionIdempotencyKey = await request.headerValue('idempotency-key')
      await route.fulfill({
        status: 202,
        json: {
          id: correctionJobId,
          workspace_id: workspaceId,
          asset_id: assetId,
          created_by: userId,
          kind: 'llm_correct',
          state: 'queued',
          payload: { source_revision_id: revisionId },
          attempts: 0,
          max_attempts: 3,
          available_at: now,
          created_at: now,
          updated_at: now,
        },
      })
      return
    }

    if (method === 'GET' && path === `/api/v1/transcription-jobs/${correctionJobId}`) {
      await route.fulfill({
        json: {
          id: correctionJobId,
          workspace_id: workspaceId,
          asset_id: assetId,
          created_by: userId,
          kind: 'llm_correct',
          state: 'succeeded',
          payload: { source_revision_id: revisionId },
          attempts: 1,
          max_attempts: 3,
          available_at: now,
          result_revision_id: correctedRevisionId,
          created_at: now,
          updated_at: now,
        },
      })
      return
    }

    if (method === 'GET' && path === `/api/v1/transcript-revisions/${correctedRevisionId}`) {
      await route.fulfill({
        json: derivedRevision(correctedRevisionId, 'llm_corrected', revisionId, correctedSegmentId),
      })
      return
    }

    if (
      method === 'POST' &&
      path === `/api/v1/transcript-revisions/${correctedRevisionId}/reviews`
    ) {
      reviewPayload = request.postDataJSON()
      await route.fulfill({
        status: 201,
        json: {
          id: '94000000-0000-4000-8000-000000000013',
          revision_id: correctedRevisionId,
          reviewer_id: userId,
          action: 'accept_change',
          change_index: 0,
          created_at: now,
        },
      })
      return
    }

    if (
      method === 'POST' &&
      path === `/api/v1/transcript-revisions/${correctedRevisionId}/approve`
    ) {
      approvalPayload = request.postDataJSON()
      await route.fulfill({
        status: 201,
        json: {
          review: {
            id: '95000000-0000-4000-8000-000000000014',
            revision_id: correctedRevisionId,
            reviewer_id: userId,
            action: 'approve',
            resulting_revision_id: approvedRevisionId,
            created_at: now,
          },
          human_revision: derivedRevision(
            humanRevisionId,
            'human_edited',
            correctedRevisionId,
            humanSegmentId,
          ),
          approved_revision: derivedRevision(
            approvedRevisionId,
            'approved',
            humanRevisionId,
            approvedSegmentId,
          ),
        },
      })
      return
    }

    if (
      method === 'POST' &&
      path === `/api/v1/transcript-revisions/${approvedRevisionId}/exports`
    ) {
      exportPayload = request.postDataJSON()
      await route.fulfill({
        status: 201,
        json: {
          id: exportId,
          asset_id: assetId,
          revision_id: approvedRevisionId,
          format: 'markdown',
          mime_type: 'text/markdown; charset=utf-8',
          file_size: 512,
          sha256: 'c'.repeat(64),
          download_url: `/api/v1/transcript-exports/${exportId}`,
          created_at: now,
          expires_at: '2026-07-16T09:00:00Z',
        },
      })
      return
    }

    if (method === 'GET' && path === `/api/v1/assets/${assetId}/audio`) {
      await route.fulfill({
        status: 200,
        contentType: 'audio/wav',
        headers: { 'Accept-Ranges': 'bytes' },
        body: wav,
      })
      return
    }

    if (method === 'GET' && path === `/api/v1/assets/${assetId}/waveform`) {
      waveformFetches += 1
      await route.fulfill({ status: 200, contentType: 'image/png', body: waveformPng })
      return
    }

    await route.fulfill({
      status: 500,
      json: {
        error: {
          code: 'unexpected_request',
          message: `${method} ${path} was not expected.`,
          request_id: 'request-unexpected',
        },
      },
    })
  })

  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Reviewable correction workflow' })).toBeVisible()

  await page.getByRole('link', { name: 'Assets' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Sign in' })).toBeVisible()
  await page.getByLabel('Email').fill('owner@example.com')
  await page.getByLabel('Password').fill('correct horse battery staple')
  await page.getByRole('button', { name: 'Sign in securely' }).click()
  await expect(page.getByText('owner@example.com')).toBeVisible()

  await page.getByRole('link', { name: 'Sessions' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Device sessions' })).toBeVisible()
  await expect(page.getByText('Pixel 9 Pro')).toBeVisible()
  await page.getByRole('button', { name: 'Revoke Pixel 9 Pro' }).click()
  await expect(page.getByText('Pixel 9 Pro')).toHaveCount(0)
  expect(deviceSessions.map((session) => session.id)).toEqual([currentSessionId])

  await page.getByRole('link', { name: 'Job Center' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Job Center' })).toBeVisible()
  await expect(page.getByText('llm_correct', { exact: true })).toBeVisible()
  await page.getByLabel('State').selectOption('succeeded')
  await page.getByLabel('Kind').fill('llm_correct')
  await page.getByRole('button', { name: 'Apply filters' }).click()
  await expect(page.getByText(jobId, { exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Audit Log' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Audit Log' })).toBeVisible()
  await expect(page.getByText('admin.job.listed', { exact: true })).toBeVisible()
  await expect(page.getByText('request-admin-jobs', { exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'System Status' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'System Status' })).toBeVisible()
  await expect(page.getByText('1 active · 0 trashed', { exact: true })).toBeVisible()
  await expect(page.getByText('256 B', { exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Version', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Version Information' })).toBeVisible()
  await expect(page.getByText('0.2.0-dev', { exact: true })).toBeVisible()
  await expect(page.getByText('account_password_change', { exact: true })).toBeVisible()
  const versionAccessibility = await new AxeBuilder({ page }).analyze()
  expect(versionAccessibility.violations).toEqual([])

  await page.getByRole('link', { name: 'Assets' }).click()

  await page.getByLabel('WAV file').setInputFiles({
    name: 'field-note.wav',
    mimeType: 'audio/wav',
    buffer: wav,
  })
  await expect(page.getByLabel('Asset title')).toHaveValue('field-note')
  await page.getByLabel('Asset title').fill('Field note')
  await page.getByLabel('Language').fill('en-US')
  await page.getByRole('button', { name: 'Upload and transcribe' }).click()

  await expect(page.getByRole('heading', { level: 2, name: 'Field note' })).toBeVisible()
  await expect(page.getByText('Mock transcript from the verified recording.')).toBeVisible()
  await expect(page.getByText('normalized', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Field note' }).locator('audio')).toHaveAttribute(
    'src',
    `/api/v1/assets/${assetId}/audio`,
  )
  const waveform = page.getByRole('button', { name: 'Seek Field note by waveform' })
  await expect(waveform).toBeVisible()
  await waveform.click()
  await page.getByLabel('Playback speed').selectOption('1.5')
  await expect
    .poll(() => page.locator('.asset-detail-grid audio').evaluate((player) => player.playbackRate))
    .toBe(1.5)
  expect(waveformFetches).toBeGreaterThan(0)
  expect(jobPolls).toBe(1)
  expect(loginPayload).toEqual({
    email: 'owner@example.com',
    password: 'correct horse battery staple',
    device_name: 'VoiceAsset Console',
  })
  expect(assetPayload).toEqual({ title: 'Field note', language: 'en-US' })
  expect(assetIdempotencyKey).toBeTruthy()
  expect(uploadPayload).toEqual({
    asset_id: assetId,
    filename: 'field-note.wav',
    mime_type: 'audio/wav',
    size_bytes: wav.length,
    sha256: fileSha256,
  })
  expect(uploadIdempotencyKey).toBeTruthy()
  expect(uploadedPartMatches).toBe(true)
  expect(uploadedPartContentType).toBe('application/octet-stream')
  expect(uploadedPartSha256).toBe(fileSha256)
  expect(completedAfterPart).toBe(true)
  expect(transcriptionIdempotencyKey).toBeTruthy()

  await expect(page.getByRole('heading', { level: 2, name: 'Asset metadata' })).toBeVisible()
  await expect(page.getByLabel('Metadata title')).toHaveValue('Field note')
  await page.getByLabel('Metadata title').fill('Edited field note')
  await page.getByLabel('Metadata language').fill('zh-CN')
  await page.locator('select[name="metadata-collection"]').selectOption(collectionId)
  await page.getByRole('button', { name: 'Save metadata' }).click()
  await expect(page.getByText('Saved metadata version 2.')).toBeVisible()
  await page.getByLabel('Search assets').fill('VoiceAsset transcript')
  await page.getByLabel('Filter by ASR provider').selectOption('mock_asr')
  await page.getByLabel('Filter by speaker').fill('speaker-1')
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
  await expect(page.locator('.asset-summary strong')).toHaveText('Edited field note')
  await expect(page.getByText('00:00.000–00:00.100 · speaker-1')).toBeVisible()
  await expect(page.getByText('VoiceAsset transcript from the verified recording.')).toBeVisible()
  await expect(page.getByRole('heading', { level: 3, name: 'Processing status' })).toBeVisible()
  await expect(page.getByText('mock_transcribe', { exact: true })).toBeVisible()
  await page.getByLabel('Start (milliseconds)').fill('1250')
  await page.getByLabel('End (milliseconds, optional)').fill('2500')
  await page.getByLabel('Annotation body').fill('Decision confirmed')
  await page.getByRole('button', { name: 'Create annotation' }).click()
  await expect(page.getByText('Created note at 1250 ms.')).toBeVisible()
  await expect(page.getByText('Decision confirmed', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Assign Important' }).click()
  await expect(page.getByRole('button', { name: 'Remove Important' })).toBeVisible()
  await page.getByRole('button', { name: 'Remove Important' }).click()
  await expect(page.getByRole('button', { name: 'Assign Important' })).toBeVisible()
  await page.getByRole('checkbox', { name: 'Select Edited field note' }).check()
  page.once('dialog', async (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Move 1 selected asset to trash' }).click()
  await expect(page.getByText('Moved 1 selected asset to trash.')).toBeVisible()
  await page.getByLabel('Filter by status').selectOption('trashed')
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Select Edited field note' }).check()
  await page.getByRole('button', { name: 'Restore 1 selected asset' }).click()
  await expect(page.getByText('Restored 1 selected asset.')).toBeVisible()
  await page.getByLabel('Filter by status').selectOption('')
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
  await page.locator('.asset-summary').click()

  await page.getByRole('link', { name: 'Correct and review this revision' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Correction review' })).toBeVisible()
  await expect(page.getByLabel('Source revision ID')).toHaveValue(revisionId)

  await page.getByLabel('Canonical form').fill('VoiceAsset')
  await page.getByLabel('Aliases').fill('Voice asset')
  await page.getByLabel('Language').fill('en-US')
  await page.getByRole('button', { name: 'Create version 1' }).click()
  await expect(page.getByText('v1 · 1 entries')).toBeVisible()

  await page.getByRole('button', { name: 'Create enabled Mock profile' }).click()
  await expect(page.getByText('mock_llm · enabled · v1')).toBeVisible()

  await page.getByRole('button', { name: 'Queue Mock LLM correction' }).click()
  await expect(page.getByRole('heading', { name: 'Review 1 changes' })).toBeVisible()
  await expect(
    page.getByText('Mock transcript from the verified recording.', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('VoiceAsset transcript from the verified recording.', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Accept', exact: true }).click()
  await expect(page.getByText('accepted', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Create approved revision' }).click()
  await expect(page.locator('.approval-result h2')).toHaveText('approved')
  await expect(page.locator('.approval-result code')).toHaveText(approvedRevisionId)
  await page.getByRole('button', { name: 'Prepare download' }).click()
  const exportLink = page.getByRole('link', { name: 'Download Markdown' })
  await expect(exportLink).toHaveAttribute('href', `/api/v1/transcript-exports/${exportId}`)
  await expect(exportLink).toHaveAttribute('download', `transcript-${approvedRevisionId}.md`)
  await expect(page.getByText(`SHA-256 ${'c'.repeat(64)}`)).toBeVisible()

  await page.getByRole('link', { name: 'API keys' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'API keys' })).toBeVisible()
  await page.getByLabel('Name').fill('CI reader')
  await page.getByRole('checkbox', { name: /^assets:read\b/ }).check()
  await page.getByRole('checkbox', { name: /^transcripts:read\b/ }).check()
  await page.getByRole('button', { name: 'Create one-time token' }).click()
  await expect(page.getByRole('heading', { name: 'Copy this token now' })).toBeVisible()
  await expect(page.getByLabel('Plaintext API token')).toHaveValue('one-time-plaintext-token')
  await page.getByRole('button', { name: 'I have stored it; dismiss' }).click()
  await expect(page.getByLabel('Plaintext API token')).toHaveCount(0)
  await page.getByRole('button', { name: 'Revoke CI reader' }).click()
  await expect(page.getByText('Revoked', { exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Assets' }).click()
  page.once('dialog', async (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Move to trash', exact: true }).click()
  await page.getByLabel('Type the asset ID to confirm permanent deletion').fill(assetId)
  await page.getByRole('button', { name: 'Permanently delete asset' }).click()
  await expect(page.getByRole('heading', { name: 'Last purge request' })).toBeVisible()
  await page.getByRole('button', { name: 'Check purge status' }).click()
  await expect(page.getByText(`Asset ${assetId} was permanently deleted.`)).toBeVisible()
  await expect(page.getByText('succeeded', { exact: true })).toBeVisible()
  await expect(page.getByText('Immutable result', { exact: true })).toHaveCount(0)

  expect(glossaryPayload).toEqual({
    display_name: 'Platform corrections',
    scope_type: 'workspace',
    state: 'enabled',
    entries: [
      {
        canonical_form: 'VoiceAsset',
        aliases: ['Voice asset'],
        language: 'en-US',
        context_terms: [],
        forbidden_contexts: [],
        regex: false,
        case_sensitive: false,
        priority: 100,
        description: 'Created in VoiceAsset Console',
      },
    ],
  })
  expect(profilePayload).toEqual(
    expect.objectContaining({
      provider_id: 'mock_llm',
      state: 'enabled',
      config: expect.objectContaining({ default_glossary_id: glossaryId }),
    }),
  )
  expect(correctionIdempotencyKey).toBeTruthy()
  expect(reviewPayload).toEqual({ action: 'accept_change', change_index: 0 })
  expect(approvalPayload).toEqual({ accept_pending: false })
  expect(exportPayload).toEqual({ format: 'markdown' })
  expect(metadataIfMatch).toBe('"1"')
  expect(metadataPayload).toEqual({
    title: 'Edited field note',
    language: 'zh-CN',
    collection_id: collectionId,
  })
  expect(tagMutationIfMatch).toBeNull()
  expect(trashIfMatches).toEqual(['"2"', '"4"'])
  expect(restoreIfMatch).toBe('"3"')
  expect(purgeIfMatch).toBe('"5"')
  expect(purgeIdempotencyKey).toMatch(/^console-purge-/)
  expect(purgePayload).toEqual({ confirmation: assetId })
  expect(annotationPayload).toEqual({
    kind: 'note',
    start_ms: 1_250,
    end_ms: 2_500,
    body: 'Decision confirmed',
  })
  expect(assetSearchQueries).toContain('VoiceAsset transcript')
  expect(assetSearchFilters).toContainEqual({ provider: 'mock_asr', speaker: 'speaker-1' })
  expect(apiKeyPayload).toEqual({
    name: 'CI reader',
    scopes: ['assets:read', 'transcripts:read'],
    expires_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
  })
  expect(unsafeRequests.every((request) => request.authorization === null)).toBe(true)
  expect(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
  ).toEqual({ local: [], session: [] })

  const accessibility = await new AxeBuilder({ page }).analyze()
  expect(accessibility.violations).toEqual([])
})
