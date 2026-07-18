import { describe, expect, it, vi } from 'vitest'

import { ApiClient, ApiError } from './client'
import type { Fetcher, GlossaryEntry } from './client'
import { CONTRACT_VERSION } from '@/config/contract'

const assetId = '10000000-0000-4000-8000-000000000001'
const uploadId = '20000000-0000-4000-8000-000000000002'
const jobId = '30000000-0000-4000-8000-000000000003'
const revisionId = '40000000-0000-4000-8000-000000000004'
const sha256 = 'a'.repeat(64)
const pairingSessionId = '50000000-0000-4000-8000-000000000005'

function pairingResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString()
  const parameters = new URLSearchParams({
    api_version: 'v1',
    contract_version: CONTRACT_VERSION,
    expires_at: expiresAt,
    origin: 'https://api.example.com:10443',
    pairing_session_id: pairingSessionId,
    secret: `va_pair_${'A'.repeat(43)}`,
    version: '1',
  })
  return {
    id: pairingSessionId,
    expires_at: expiresAt,
    payload: `voiceasset://pair?${parameters.toString()}`,
    ...overrides,
  }
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('ApiClient', () => {
  it('keeps requests on the configured API boundary and includes cookies', async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(
      new Response(JSON.stringify({ id: 'asset_01' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const client = new ApiClient('/api/v1', fetcher)

    await expect(client.request<{ id: string }>('assets')).resolves.toEqual({
      id: 'asset_01',
    })

    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe('/api/v1/assets')
    expect(init?.credentials).toBe('include')
    expect(new Headers(init?.headers).get('Accept')).toBe('application/json')
  })

  it('preserves structured API error identifiers', async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'asset_not_found',
            message: 'Asset was not found.',
            request_id: 'req_01',
          },
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )
    const client = new ApiClient('/api/v1', fetcher)

    const error = await client.request('assets/missing').catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      code: 'asset_not_found',
      requestId: 'req_01',
      status: 404,
    })
  })

  it('does not trust malformed error envelopes', async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 42 } }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'header-request-id' },
      }),
    )
    const client = new ApiClient('/api/v1', fetcher)

    const error = await client.request('assets').catch((reason: unknown) => reason)

    expect(error).toMatchObject({
      code: 'http_error',
      message: 'Request failed with status 500.',
      requestId: 'header-request-id',
    })
  })

  it('validates the capabilities response before exposing it', async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(
      new Response(
        JSON.stringify({
          server_version: '0.1.0-dev',
          api_version: 'v1',
          contract_version: '0.1.0',
          features: ['capability_negotiation', 'health_checks'],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    await expect(new ApiClient('/api/v1', fetcher).getCapabilities()).resolves.toMatchObject({
      contract_version: '0.1.0',
    })
  })

  it('rejects absolute request paths', async () => {
    const client = new ApiClient('/api/v1', vi.fn<Fetcher>())

    await expect(client.request('https://example.com/assets')).rejects.toThrow('must be relative')
  })

  it('creates and revokes cookie sessions without exposing or storing a token', async () => {
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            expires_at: '2026-07-17T00:00:00Z',
            refresh_expires_at: '2026-08-16T00:00:00Z',
            user: {
              id: assetId,
              workspace_id: uploadId,
              role: 'owner',
              email: 'owner@example.com',
              scopes: ['assets:write'],
            },
          },
          201,
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const client = new ApiClient('/api/v1', fetcher)

    await expect(
      client.login(' owner@example.com ', 'not-returned', ' Work laptop '),
    ).resolves.toMatchObject({
      user: { email: 'owner@example.com' },
    })
    await expect(client.logout()).resolves.toBeUndefined()

    const [loginUrl, loginInit] = fetcher.mock.calls[0]!
    expect(loginUrl).toBe('/api/v1/auth/sessions')
    expect(loginInit?.method).toBe('POST')
    expect(JSON.parse(String(loginInit?.body))).toEqual({
      email: 'owner@example.com',
      password: 'not-returned',
      device_name: 'Work laptop',
    })
    expect(new Headers(loginInit?.headers).has('Authorization')).toBe(false)
    expect(new Headers(loginInit?.headers).has('Origin')).toBe(false)
    expect(fetcher.mock.calls[1]?.[0]).toBe('/api/v1/auth/session')
    expect(fetcher.mock.calls[1]?.[1]?.method).toBe('DELETE')
  })

  it('changes the account password through cookies without a bearer token', async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(new Response(null, { status: 204 }))
    const client = new ApiClient('/api/v1', fetcher)

    await expect(
      client.changePassword({
        current_password: 'current-password',
        new_password: 'new-password-456',
      }),
    ).resolves.toBeUndefined()

    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe('/api/v1/auth/password')
    expect(init?.method).toBe('PATCH')
    expect(init?.credentials).toBe('include')
    expect(new Headers(init?.headers).has('Authorization')).toBe(false)
    expect(JSON.parse(String(init?.body))).toEqual({
      current_password: 'current-password',
      new_password: 'new-password-456',
    })
  })

  it('rejects invalid password changes before requesting', async () => {
    const fetcher = vi.fn<Fetcher>()
    const client = new ApiClient('/api/v1', fetcher)

    await expect(
      client.changePassword({ current_password: 'same-password', new_password: 'same-password' }),
    ).rejects.toThrow('must differ')
    await expect(
      client.changePassword({ current_password: 'current-password', new_password: 'short' }),
    ).rejects.toThrow('at least 12 characters')
    await expect(
      client.changePassword({
        current_password: 'current-password',
        new_password: '界'.repeat(342),
      }),
    ).rejects.toThrow('at most 1024 bytes')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rotates HttpOnly session cookies and manages personal device sessions', async () => {
    const deviceSessionId = '60000000-0000-4000-8000-000000000006'
    const webSession = {
      expires_at: '2026-07-17T12:00:00Z',
      refresh_expires_at: '2026-08-16T00:00:00Z',
      user: {
        id: assetId,
        workspace_id: uploadId,
        role: 'owner',
        email: 'owner@example.com',
        scopes: ['assets:write'],
      },
    }
    const deviceSession = {
      id: deviceSessionId,
      device_name: 'Work laptop',
      current: true,
      created_at: '2026-07-16T00:00:00Z',
      last_seen_at: '2026-07-16T12:00:00Z',
      expires_at: webSession.expires_at,
      refresh_expires_at: webSession.refresh_expires_at,
    }
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(jsonResponse(webSession))
      .mockResolvedValueOnce(jsonResponse({ items: [deviceSession] }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const client = new ApiClient('/api/v1', fetcher)

    await expect(client.refreshSession()).resolves.toEqual(webSession)
    await expect(client.listDeviceSessions()).resolves.toEqual({ items: [deviceSession] })
    await expect(client.revokeDeviceSession(deviceSessionId)).resolves.toBeUndefined()

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/auth/session/refresh',
      '/api/v1/auth/device-sessions',
      `/api/v1/auth/device-sessions/${deviceSessionId}`,
    ])
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe('POST')
    expect(fetcher.mock.calls[2]?.[1]?.method).toBe('DELETE')
    for (const [, init] of fetcher.mock.calls) {
      expect(init?.credentials).toBe('include')
      expect(new Headers(init?.headers).has('Authorization')).toBe(false)
    }
  })

  it('creates a strictly validated one-time device-pairing payload', async () => {
    const response = pairingResponse()
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(jsonResponse(response, 201))
    const client = new ApiClient('/api/v1', fetcher)

    await expect(client.createPairingSession()).resolves.toEqual(response)

    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe('/api/v1/auth/pairing-sessions')
    expect(init?.method).toBe('POST')
    expect(init?.credentials).toBe('include')
    expect(init?.body).toBeUndefined()
    expect(new Headers(init?.headers).has('Authorization')).toBe(false)
  })

  it.each([
    ['an additional response field', { unexpected: true }],
    ['a mismatched response identifier', { id: '60000000-0000-4000-8000-000000000006' }],
    [
      'an unknown payload field',
      {
        payload: `${String(pairingResponse().payload)}&redirect=https%3A%2F%2Fevil.example`,
      },
    ],
    [
      'a duplicate payload field',
      {
        payload: `${String(pairingResponse().payload)}&version=1`,
      },
    ],
    [
      'a malformed pairing secret',
      {
        payload: String(pairingResponse().payload).replace(
          `va_pair_${'A'.repeat(43)}`,
          'va_pair_not-valid',
        ),
      },
    ],
  ])('rejects a pairing response with %s', async (_name, override) => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(jsonResponse(pairingResponse(override), 201))

    await expect(new ApiClient('/api/v1', fetcher).createPairingSession()).rejects.toThrow(
      'invalid device-pairing payload',
    )
  })

  it('lists, creates, and revokes scoped API keys on the contract paths', async () => {
    const apiKeyId = '70000000-0000-4000-8000-000000000007'
    const apiKey = {
      id: apiKeyId,
      workspace_id: uploadId,
      name: 'Build agent',
      token_prefix: 'va_pat_example1',
      scopes: ['assets:read'],
      expires_at: '2026-08-16T12:00:00.000Z',
      revoked_at: null,
      last_used_at: null,
      created_at: '2026-07-16T12:00:00.000Z',
    }
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(jsonResponse({ items: [apiKey] }))
      .mockResolvedValueOnce(jsonResponse({ api_key: apiKey, token: 'one-time-token' }, 201))
      .mockResolvedValueOnce(jsonResponse({ ...apiKey, revoked_at: '2026-07-16T13:00:00.000Z' }))
    const client = new ApiClient('/api/v1', fetcher)

    await client.listAPIKeys()
    await client.createAPIKey({
      name: '  Build agent  ',
      scopes: ['assets:read'],
      expires_at: '2026-08-16T12:00:00Z',
    })
    await client.revokeAPIKey(apiKeyId)

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/api-keys',
      '/api/v1/api-keys',
      `/api/v1/api-keys/${apiKeyId}`,
    ])
    expect(fetcher.mock.calls[1]?.[1]?.method).toBe('POST')
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({
      name: 'Build agent',
      scopes: ['assets:read'],
      expires_at: '2026-08-16T12:00:00.000Z',
    })
    expect(fetcher.mock.calls[2]?.[1]?.method).toBe('DELETE')
    expect(new Headers(fetcher.mock.calls[1]?.[1]?.headers).has('Authorization')).toBe(false)
  })

  it('rejects duplicate API-key scopes and invalid expirations before requesting', () => {
    const fetcher = vi.fn<Fetcher>()
    const client = new ApiClient('/api/v1', fetcher)

    expect(() =>
      client.createAPIKey({
        name: 'Build agent',
        scopes: ['assets:read', 'assets:read'],
        expires_at: '2026-08-16T12:00:00Z',
      }),
    ).toThrow('unique supported')
    expect(() =>
      client.createAPIKey({
        name: 'Build agent',
        scopes: ['assets:read'],
        expires_at: 'not-a-date',
      }),
    ).toThrow('valid date-time')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('uses bounded administration paths for jobs, audit logs, status, and settings', async () => {
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(jsonResponse({ items: [], next_cursor: 'next-jobs' }))
      .mockResolvedValueOnce(jsonResponse({ items: [], next_cursor: 'next-audit' }))
      .mockResolvedValueOnce(
        jsonResponse({
          generated_at: '2026-07-17T12:00:00Z',
          active_users: 1,
          assets: {
            total: 2,
            active: 1,
            trashed: 1,
            purging: 0,
            failed: 0,
            audio_duration_ms: 3_000,
          },
          storage: { object_count: 4, bytes: 2_048 },
          transcripts: { transcript_count: 1, revision_count: 2 },
          jobs: {
            total: 3,
            queued: 1,
            running: 0,
            retry_wait: 0,
            succeeded: 2,
            failed: 0,
            cancelled: 0,
          },
          providers: { enabled_asr: 1, enabled_llm: 1 },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          scope: 'deployment',
          management: 'operator_environment',
          mutable: false,
          brand_name: 'VoiceAsset',
          public_origin: 'https://voice.example.test',
          storage_backend: 'local',
          cookie_secure: true,
          provider_credential_encryption_configured: true,
        }),
      )
    const client = new ApiClient('/api/v1', fetcher)

    await client.listAdminJobs({
      limit: 25,
      cursor: 'before-jobs',
      state: 'retry_wait',
      kind: '  llm_correct  ',
    })
    await client.listAdminAuditLogs({
      limit: 10,
      cursor: 'before-audit',
      actorType: 'agent',
      action: '  transcript.read  ',
      targetType: '  transcript_revision  ',
    })
    await expect(client.getAdminSystemStatus()).resolves.toMatchObject({ active_users: 1 })
    await expect(client.getAdminSystemSettings()).resolves.toMatchObject({
      scope: 'deployment',
      mutable: false,
    })

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/admin/jobs?limit=25&cursor=before-jobs&state=retry_wait&kind=llm_correct',
      '/api/v1/admin/audit-logs?limit=10&cursor=before-audit&actor_type=agent&action=transcript.read&target_type=transcript_revision',
      '/api/v1/admin/system-status',
      '/api/v1/admin/system-settings',
    ])
  })

  it('rejects unsafe administration filters before requesting', () => {
    const fetcher = vi.fn<Fetcher>()
    const client = new ApiClient('/api/v1', fetcher)

    expect(() => client.listAdminJobs({ limit: 101 })).toThrow('between 1 and 100')
    expect(() => client.listAdminJobs({ state: 'waiting' as 'queued' })).toThrow(
      'supported operations job state',
    )
    expect(() => client.listAdminJobs({ kind: 'bad/kind' })).toThrow(
      'lowercase operations identifier',
    )
    expect(() => client.listAdminAuditLogs({ actorType: 'robot' as 'agent' })).toThrow(
      'user, agent, or system',
    )
    expect(() => client.listAdminAuditLogs({ action: 'Audit.Read' })).toThrow(
      'lowercase operations identifier',
    )
    expect(() => client.listAdminAuditLogs({ cursor: ' padded ' })).toThrow('safe characters')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('reads and conditionally renames the authenticated workspace', async () => {
    const workspace = {
      id: '20000000-0000-4000-8000-000000000002',
      name: 'Primary',
      version: 3,
      created_at: '2026-07-17T12:00:00Z',
      updated_at: '2026-07-17T12:00:00Z',
    }
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(jsonResponse(workspace))
      .mockResolvedValueOnce(jsonResponse({ ...workspace, name: 'Renamed', version: 4 }))
    const client = new ApiClient('/api/v1', fetcher)

    await client.getAdminWorkspace()
    await client.updateAdminWorkspace(3, { name: '  Renamed  ' })

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/admin/workspace',
      '/api/v1/admin/workspace',
    ])
    expect(fetcher.mock.calls[1]?.[1]?.method).toBe('PATCH')
    expect(new Headers(fetcher.mock.calls[1]?.[1]?.headers).get('If-Match')).toBe('"3"')
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({ name: 'Renamed' })
  })

  it('rejects unsafe workspace updates before requesting', () => {
    const fetcher = vi.fn<Fetcher>()
    const client = new ApiClient('/api/v1', fetcher)

    expect(() => client.updateAdminWorkspace(0, { name: 'Valid' })).toThrow('positive integer')
    expect(() => client.updateAdminWorkspace(1, { name: '  ' })).toThrow('between 1 and 200')
    expect(() => client.updateAdminWorkspace(1, { name: 'bad\nname' })).toThrow('safe characters')
    expect(() => client.updateAdminWorkspace(1, { name: '界'.repeat(201) })).toThrow(
      'between 1 and 200',
    )
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('lists, creates, and conditionally updates workspace members', async () => {
    const memberId = '35000000-0000-4000-8000-000000000003'
    const member = {
      id: memberId,
      workspace_id: '20000000-0000-4000-8000-000000000002',
      email: 'member@example.com',
      role: 'viewer',
      status: 'active',
      version: 1,
      created_at: '2026-07-17T12:00:00Z',
      updated_at: '2026-07-17T12:00:00Z',
    }
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(jsonResponse({ items: [member], next_cursor: 'next-members' }))
      .mockResolvedValueOnce(jsonResponse(member, 201))
      .mockResolvedValueOnce(jsonResponse({ ...member, role: 'editor', version: 2 }))
    const client = new ApiClient('/api/v1', fetcher)

    await client.listAdminMembers({
      limit: 25,
      cursor: 'before-members',
      role: 'viewer',
      status: 'active',
    })
    await client.createAdminMember({
      email: '  MEMBER@example.com  ',
      password: 'long-test-password',
      role: 'viewer',
    })
    await client.updateAdminMember(memberId, 1, { role: 'editor' })

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/admin/members?limit=25&cursor=before-members&role=viewer&status=active',
      '/api/v1/admin/members',
      `/api/v1/admin/members/${memberId}`,
    ])
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({
      email: 'member@example.com',
      password: 'long-test-password',
      role: 'viewer',
    })
    expect(fetcher.mock.calls[2]?.[1]?.method).toBe('PATCH')
    expect(new Headers(fetcher.mock.calls[2]?.[1]?.headers).get('If-Match')).toBe('"1"')
    expect(JSON.parse(String(fetcher.mock.calls[2]?.[1]?.body))).toEqual({ role: 'editor' })
  })

  it('rejects unsafe member administration inputs before requesting', () => {
    const fetcher = vi.fn<Fetcher>()
    const client = new ApiClient('/api/v1', fetcher)
    const memberId = '35000000-0000-4000-8000-000000000003'

    expect(() => client.listAdminMembers({ role: 'superuser' as 'owner' })).toThrow(
      'supported workspace member role',
    )
    expect(() =>
      client.createAdminMember({
        email: 'member@example.com',
        password: 'too-short',
        role: 'viewer',
      }),
    ).toThrow('between 12 and 1024')
    expect(() => client.updateAdminMember(memberId, 1, {})).toThrow('include role or status')
    expect(() => client.updateAdminMember(memberId, 0, { status: 'disabled' })).toThrow(
      'positive integer',
    )
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('uses immutable hotword versions and exact resource ETags', async () => {
    const hotwordSetId = '71000000-0000-4000-8000-000000000007'
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: hotwordSetId, resource_version: 1 }, 201))
      .mockResolvedValueOnce(jsonResponse({ id: hotwordSetId, resource_version: 2 }, 201))
      .mockResolvedValueOnce(
        jsonResponse({ id: hotwordSetId, resource_version: 3, state: 'disabled' }),
      )
    const client = new ApiClient('/api/v1', fetcher)

    await client.listHotwordSets()
    await client.createHotwordSet({
      display_name: '  Platform terms  ',
      scope_type: 'workspace',
      entries: [
        {
          term: ' VoiceAsset ',
          aliases: ['Voice Asset'],
          language: 'en-US',
          weight: 90,
          enabled: true,
        },
      ],
    })
    await client.createHotwordSetVersion(hotwordSetId, 1, {
      entries: [{ term: 'VoiceAsset', language: 'en-US', weight: 95 }],
    })
    await client.updateHotwordSet(hotwordSetId, 2, 'disabled')

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/hotword-sets',
      '/api/v1/hotword-sets',
      `/api/v1/hotword-sets/${hotwordSetId}/versions`,
      `/api/v1/hotword-sets/${hotwordSetId}`,
    ])
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({
      display_name: 'Platform terms',
      scope_type: 'workspace',
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
    })
    expect(new Headers(fetcher.mock.calls[2]?.[1]?.headers).get('If-Match')).toBe('"1"')
    expect(new Headers(fetcher.mock.calls[3]?.[1]?.headers).get('If-Match')).toBe('"2"')
    expect(JSON.parse(String(fetcher.mock.calls[3]?.[1]?.body))).toEqual({ state: 'disabled' })
  })

  it('creates write-only ASR credentials and uses exact profile ETags', async () => {
    const profileId = '72000000-0000-4000-8000-000000000007'
    const returnedProfile = {
      id: profileId,
      provider_id: 'tencent_asr',
      secret_configured: true,
      version: 1,
    }
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse(returnedProfile, 201))
      .mockResolvedValueOnce(jsonResponse({ ...returnedProfile, state: 'enabled', version: 2 }))
      .mockResolvedValueOnce(
        jsonResponse({
          profile_id: profileId,
          status: 'healthy',
          checked_at: '2026-07-16T12:00:00Z',
        }),
      )
    const client = new ApiClient('/api/v1', fetcher)

    await client.listASRProviderCapabilities()
    await client.listProviderProfiles()
    const created = await client.createProviderProfile({
      provider_id: 'tencent_asr',
      display_name: ' Tencent Flash ',
      config: {
        model: '16k_zh',
        language: 'zh-CN',
        sample_rate: 16_000,
        audio_format: 'M4A',
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
      credentials: { secret_id: 'secret-id-value', secret_key: 'secret-key-value' },
      state: 'disabled',
      priority: 100,
    })
    await client.updateProviderProfile(profileId, 'tencent_asr', 1, { state: 'enabled' })
    await client.checkProviderProfileHealth(profileId)

    expect(created).not.toHaveProperty('credentials')
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/asr/provider-capabilities',
      '/api/v1/provider-profiles',
      '/api/v1/provider-profiles',
      `/api/v1/provider-profiles/${profileId}`,
      `/api/v1/provider-profiles/${profileId}/health`,
    ])
    expect(JSON.parse(String(fetcher.mock.calls[2]?.[1]?.body))).toEqual(
      expect.objectContaining({
        display_name: 'Tencent Flash',
        credentials: { secret_id: 'secret-id-value', secret_key: 'secret-key-value' },
        config: expect.objectContaining({ audio_format: 'm4a' }),
      }),
    )
    expect(new Headers(fetcher.mock.calls[3]?.[1]?.headers).get('If-Match')).toBe('"1"')
    expect(fetcher.mock.calls[4]?.[1]?.method).toBe('POST')
  })

  it('rejects duplicate hotwords and incomplete provider credentials before requesting', () => {
    const fetcher = vi.fn<Fetcher>()
    const client = new ApiClient('/api/v1', fetcher)

    expect(() =>
      client.createHotwordSet({
        display_name: 'Terms',
        scope_type: 'workspace',
        entries: [{ term: 'VoiceAsset', aliases: ['voiceasset'], language: 'en-US', weight: 90 }],
      }),
    ).toThrow('unique')
    expect(() =>
      client.createProviderProfile({
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
        credentials: { secret_id: 'short', secret_key: 'secret-key-value' },
      }),
    ).toThrow('SecretId')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('sends normalized asset and upload declarations with independent idempotency keys', async () => {
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(jsonResponse({ id: assetId }, 201))
      .mockResolvedValueOnce(jsonResponse({ id: uploadId, part_size: 5_242_880 }, 201))
    const client = new ApiClient('/api/v1', fetcher)

    await client.createAsset({ title: '  Field note  ', language: 'en-US' }, 'asset-key')
    await client.createUpload(
      {
        asset_id: assetId,
        filename: 'field-note.wav',
        mime_type: 'audio/wav',
        size_bytes: 44,
        sha256,
      },
      'upload-key',
    )

    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/v1/assets')
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      title: 'Field note',
      language: 'en-US',
    })
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('Idempotency-Key')).toBe(
      'asset-key',
    )
    expect(fetcher.mock.calls[1]?.[0]).toBe('/api/v1/uploads')
    expect(new Headers(fetcher.mock.calls[1]?.[1]?.headers).get('Idempotency-Key')).toBe(
      'upload-key',
    )
  })

  it('lists, reads, and conditionally updates asset metadata on contract paths', async () => {
    const collectionId = '50000000-0000-4000-8000-000000000005'
    const returnedAsset = {
      id: assetId,
      workspace_id: uploadId,
      collection_id: collectionId,
      title: 'Field note',
      language: 'en-US',
      status: 'ready',
      duration_ms: 1_000,
      version: 4,
      created_at: '2026-07-16T08:00:00Z',
      updated_at: '2026-07-16T09:00:00Z',
    }
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(jsonResponse({ items: [returnedAsset], next_cursor: 'next-page' }))
      .mockResolvedValueOnce(jsonResponse(returnedAsset))
      .mockResolvedValueOnce(jsonResponse({ ...returnedAsset, title: 'Edited', version: 5 }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
    const client = new ApiClient('/api/v1', fetcher)

    await client.listAssets({ query: '  Field note  ', limit: 20, cursor: 'before-page' })
    await client.getAsset(assetId)
    await client.updateAssetMetadata(assetId, 4, {
      title: '  Edited  ',
      language: 'en-US',
      collection_id: collectionId,
    })
    await client.listCollections({ limit: 100 })

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/assets?q=Field+note&limit=20&cursor=before-page',
      `/api/v1/assets/${assetId}`,
      `/api/v1/assets/${assetId}/metadata`,
      '/api/v1/collections?limit=100',
    ])
    expect(fetcher.mock.calls[2]?.[1]?.method).toBe('PUT')
    expect(new Headers(fetcher.mock.calls[2]?.[1]?.headers).get('If-Match')).toBe('"4"')
    expect(JSON.parse(String(fetcher.mock.calls[2]?.[1]?.body))).toEqual({
      title: 'Edited',
      language: 'en-US',
      collection_id: collectionId,
    })
  })

  it('rejects unsafe asset list and metadata inputs before requesting', () => {
    const fetcher = vi.fn<Fetcher>()
    const client = new ApiClient('/api/v1', fetcher)

    expect(() => client.listAssets({ query: 'bad\nquery' })).toThrow('control characters')
    expect(() => client.listAssets({ limit: 101 })).toThrow('between 1 and 100')
    expect(() => client.listAssets({ cursor: ' padded ' })).toThrow('safe characters')
    expect(() => client.listAssets({ collectionId: 'not-a-uuid' })).toThrow('UUID')
    expect(() => client.listAssets({ providerId: 'unknown_asr' as 'mock_asr' })).toThrow(
      'supported ASR provider',
    )
    expect(() => client.listAssets({ speaker: 'bad\nspeaker' })).toThrow('control characters')
    expect(() =>
      client.listAssets({
        createdFrom: '2026-08-01T00:00:00Z',
        createdBefore: '2026-07-01T00:00:00Z',
      }),
    ).toThrow('earlier than')
    expect(() =>
      client.updateAssetMetadata(assetId, 0, {
        title: 'Field note',
        language: 'en-US',
        collection_id: null,
      }),
    ).toThrow('positive integer')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('filters assets and uses conditional lifecycle and tag contract paths', async () => {
    const collectionId = '50000000-0000-4000-8000-000000000005'
    const tagId = '60000000-0000-4000-8000-000000000006'
    const returnedAsset = {
      id: assetId,
      workspace_id: uploadId,
      collection_id: collectionId,
      title: 'Field note',
      language: 'en-US',
      status: 'ready',
      duration_ms: 1_000,
      version: 4,
      created_at: '2026-07-16T08:00:00Z',
      updated_at: '2026-07-16T09:00:00Z',
    }
    const returnedTag = {
      id: tagId,
      workspace_id: uploadId,
      name: 'Important',
      color: '#ff8800',
      asset_count: 1,
      created_at: '2026-07-16T08:00:00Z',
    }
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(jsonResponse({ items: [returnedAsset] }))
      .mockResolvedValueOnce(jsonResponse({ items: [returnedTag] }))
      .mockResolvedValueOnce(jsonResponse({ items: [returnedTag] }))
      .mockResolvedValueOnce(
        jsonResponse({ asset_id: assetId, tag_ids: [tagId], changed_count: 1 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ asset_id: assetId, tag_ids: [tagId], changed_count: 1 }),
      )
      .mockResolvedValueOnce(jsonResponse({ ...returnedAsset, status: 'trashed', version: 5 }))
      .mockResolvedValueOnce(jsonResponse({ ...returnedAsset, version: 6 }))
    const client = new ApiClient('/api/v1', fetcher)

    await client.listAssets({
      query: ' Field ',
      collectionId,
      tagId,
      status: 'ready',
      providerId: 'mock_asr',
      speaker: ' Alice ',
      createdFrom: '2026-07-01T00:00:00Z',
      createdBefore: '2026-08-01T00:00:00Z',
      limit: 20,
    })
    await client.listTags({ limit: 100 })
    await client.listAssetTags(assetId, { limit: 100 })
    await client.addAssetTags(assetId, [tagId])
    await client.removeAssetTags(assetId, [tagId])
    await client.trashAsset(assetId, 4)
    await client.restoreAsset(assetId, 5)

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/assets?q=Field&collection_id=50000000-0000-4000-8000-000000000005&tag_id=60000000-0000-4000-8000-000000000006&status=ready&provider_id=mock_asr&speaker=Alice&created_from=2026-07-01T00%3A00%3A00.000Z&created_before=2026-08-01T00%3A00%3A00.000Z&limit=20',
      '/api/v1/tags?limit=100',
      `/api/v1/assets/${assetId}/tags?limit=100`,
      `/api/v1/assets/${assetId}/tags`,
      `/api/v1/assets/${assetId}/tags`,
      `/api/v1/assets/${assetId}`,
      `/api/v1/assets/${assetId}/restore`,
    ])
    expect(fetcher.mock.calls[3]?.[1]?.method).toBe('POST')
    expect(fetcher.mock.calls[4]?.[1]?.method).toBe('DELETE')
    expect(JSON.parse(String(fetcher.mock.calls[4]?.[1]?.body))).toEqual({ tag_ids: [tagId] })
    expect(fetcher.mock.calls[5]?.[1]?.method).toBe('DELETE')
    expect(new Headers(fetcher.mock.calls[5]?.[1]?.headers).get('If-Match')).toBe('"4"')
    expect(fetcher.mock.calls[6]?.[1]?.method).toBe('POST')
    expect(new Headers(fetcher.mock.calls[6]?.[1]?.headers).get('If-Match')).toBe('"5"')
  })

  it('lists and creates annotations and reads bounded processing status', async () => {
    const annotationId = '60000000-0000-4000-8000-000000000006'
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(jsonResponse({ items: [], next_cursor: 'next-annotation' }))
      .mockResolvedValueOnce(jsonResponse({ id: annotationId, kind: 'note' }, 201))
      .mockResolvedValueOnce(
        jsonResponse({ asset_id: assetId, asset_status: 'ready', active: false, jobs: [] }),
      )
    const client = new ApiClient('/api/v1', fetcher)

    await client.listAssetAnnotations(assetId, { limit: 100, cursor: 'before-annotation' })
    await client.createAssetAnnotation(assetId, {
      kind: 'note',
      start_ms: 1_250,
      end_ms: 2_500,
      body: '  Decision\nconfirmed  ',
    })
    await client.getAssetProcessingStatus(assetId)

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      `/api/v1/assets/${assetId}/annotations?limit=100&cursor=before-annotation`,
      `/api/v1/assets/${assetId}/annotations`,
      `/api/v1/assets/${assetId}/processing-status`,
    ])
    expect(fetcher.mock.calls[1]?.[1]?.method).toBe('POST')
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({
      kind: 'note',
      start_ms: 1_250,
      end_ms: 2_500,
      body: 'Decision\nconfirmed',
    })
  })

  it('uses exact confirmation, version, and idempotency for permanent asset deletion', async () => {
    const purgeJob = {
      job_id: jobId,
      asset_id: assetId,
      asset_version: 5,
      state: 'queued',
      requested_at: '2026-07-17T10:00:00Z',
    }
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(jsonResponse(purgeJob, 202))
      .mockResolvedValueOnce(jsonResponse({ ...purgeJob, state: 'succeeded' }))
    const client = new ApiClient('/api/v1', fetcher)

    await expect(client.requestAssetPurge(assetId, 5, assetId, 'purge-key')).resolves.toEqual(
      purgeJob,
    )
    await expect(client.getAssetPurgeJob(jobId)).resolves.toMatchObject({ state: 'succeeded' })

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      `/api/v1/assets/${assetId}/purge`,
      `/api/v1/asset-purge-jobs/${jobId}`,
    ])
    const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers)
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe('POST')
    expect(headers.get('If-Match')).toBe('"5"')
    expect(headers.get('Idempotency-Key')).toBe('purge-key')
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({ confirmation: assetId })
    expect(() => client.requestAssetPurge(assetId, 5, uploadId, 'another-key')).toThrow(
      'exactly match',
    )
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('rejects invalid annotation ranges and bodies before requesting', () => {
    const fetcher = vi.fn<Fetcher>()
    const client = new ApiClient('/api/v1', fetcher)

    expect(() =>
      client.createAssetAnnotation(assetId, {
        kind: 'note',
        start_ms: 100,
        end_ms: 100,
        body: 'Decision',
      }),
    ).toThrow('greater than startMs')
    expect(() =>
      client.createAssetAnnotation(assetId, {
        kind: 'note',
        start_ms: 0,
        body: '   ',
      }),
    ).toThrow('require a body')
    expect(() =>
      client.createAssetAnnotation(assetId, {
        kind: 'bookmark',
        start_ms: 0,
        body: 'bad\u0001body',
      }),
    ).toThrow('control character')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('uploads exact binary parts with their checksum and completes the session', async () => {
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(jsonResponse({ number: 1 }, 201))
      .mockResolvedValueOnce(jsonResponse({ id: uploadId, state: 'completed' }))
    const client = new ApiClient('/api/v1', fetcher)
    const part = new Blob([new Uint8Array([1, 2, 3])], { type: 'application/octet-stream' })

    await client.putUploadPart(uploadId, 1, part, sha256)
    await client.completeUpload(uploadId)

    const [partUrl, partInit] = fetcher.mock.calls[0]!
    expect(partUrl).toBe(`/api/v1/uploads/${uploadId}/parts/1`)
    expect(partInit?.body).toBe(part)
    expect(new Headers(partInit?.headers).get('Content-Type')).toBe('application/octet-stream')
    expect(new Headers(partInit?.headers).get('X-Part-SHA256')).toBe(sha256)
    expect(fetcher.mock.calls[1]?.[0]).toBe(`/api/v1/uploads/${uploadId}/complete`)
  })

  it('uses the contract paths for job polling, transcript reads, and authenticated audio', async () => {
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(jsonResponse({ id: jobId, state: 'queued' }, 202))
      .mockResolvedValueOnce(jsonResponse({ id: jobId, state: 'succeeded' }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: revisionId, segments: [] }))
    const client = new ApiClient('/api/v1', fetcher)

    await client.createTranscription(assetId, 'transcription-key')
    await client.getJob(jobId)
    await client.listTranscripts(assetId)
    await client.getRevision(revisionId)

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      `/api/v1/assets/${assetId}/transcriptions`,
      `/api/v1/transcription-jobs/${jobId}`,
      `/api/v1/assets/${assetId}/transcripts`,
      `/api/v1/transcript-revisions/${revisionId}`,
    ])
    expect(client.audioUrl(assetId)).toBe(`/api/v1/assets/${assetId}/audio`)
  })

  it('uses the Phase 3 correction, review, approval, and configuration paths', async () => {
    const glossaryId = '50000000-0000-4000-8000-000000000005'
    const profileId = '60000000-0000-4000-8000-000000000006'
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: glossaryId }, 201))
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: profileId }, 201))
      .mockResolvedValueOnce(jsonResponse({ id: profileId, status: 'healthy' }))
      .mockResolvedValueOnce(jsonResponse({ id: jobId, state: 'queued' }, 202))
      .mockResolvedValueOnce(jsonResponse({ id: 'review' }, 201))
      .mockResolvedValueOnce(jsonResponse({ approved_revision: { id: revisionId } }, 201))
    const client = new ApiClient('/api/v1', fetcher)

    await client.listGlossarySets()
    await client.createGlossarySet({
      display_name: '  Platform corrections  ',
      scope_type: 'workspace',
      entries: [
        { canonical_form: '容器云', aliases: ['容易云'], language: 'zh-CN', priority: 100 },
      ],
    })
    await client.listLLMProfiles()
    await client.createLLMProfile({
      provider_id: 'mock_llm',
      display_name: 'Mock correction',
      config: {
        model: 'deterministic_glossary_v1',
        timeout: '30s',
        concurrency: 1,
        temperature: 0,
        context_limit: 8_000,
        structured_output: true,
        prompt_template: 'correction.v1',
        auto_approval_policy: 'never',
      },
      state: 'enabled',
    })
    await client.checkLLMProfileHealth(profileId)
    await client.createCorrection(revisionId, 'correction-key')
    await client.createReview(revisionId, { action: 'accept_change', change_index: 0 })
    await client.approveRevision(revisionId)

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/glossary-sets',
      '/api/v1/glossary-sets',
      '/api/v1/llm-profiles',
      '/api/v1/llm-profiles',
      `/api/v1/llm-profiles/${profileId}/health`,
      `/api/v1/transcript-revisions/${revisionId}/corrections`,
      `/api/v1/transcript-revisions/${revisionId}/reviews`,
      `/api/v1/transcript-revisions/${revisionId}/approve`,
    ])
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body)).display_name).toBe(
      'Platform corrections',
    )
    expect(new Headers(fetcher.mock.calls[5]?.[1]?.headers).get('Idempotency-Key')).toBe(
      'correction-key',
    )
    expect(JSON.parse(String(fetcher.mock.calls[6]?.[1]?.body))).toEqual({
      action: 'accept_change',
      change_index: 0,
    })
    expect(JSON.parse(String(fetcher.mock.calls[7]?.[1]?.body))).toEqual({
      accept_pending: false,
    })
  })

  it('creates an authenticated transcript export on the immutable revision path', async () => {
    const exportId = '70000000-0000-4000-8000-000000000007'
    const fetcher = vi.fn<Fetcher>().mockResolvedValueOnce(
      jsonResponse(
        {
          id: exportId,
          revision_id: revisionId,
          format: 'markdown',
          download_url: `/api/v1/transcript-exports/${exportId}`,
        },
        201,
      ),
    )
    const client = new ApiClient('/api/v1', fetcher)

    await client.createTranscriptExport(revisionId, 'markdown')

    expect(fetcher).toHaveBeenCalledWith(
      `/api/v1/transcript-revisions/${revisionId}/exports`,
      expect.objectContaining({ method: 'POST' }),
    )
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({ format: 'markdown' })
    expect(client.transcriptExportUrl(exportId)).toBe(`/api/v1/transcript-exports/${exportId}`)
    expect(() => client.createTranscriptExport(revisionId, 'pdf' as 'markdown')).toThrow(
      'export format',
    )
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('uses conditional LLM profile and immutable glossary administration paths', async () => {
    const glossaryId = '51000000-0000-4000-8000-000000000005'
    const profileId = '61000000-0000-4000-8000-000000000006'
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(jsonResponse({ items: [] }))
    const client = new ApiClient('/api/v1', fetcher)
    const credentials = {
      api_key: ' fixture-compatible-key ',
      custom_headers: { 'x-tenant': 'tenant-secret' },
    }

    await client.listLLMProviderCapabilities()
    await client.createGlossarySetVersion(glossaryId, 2, {
      entries: [
        {
          canonical_form: ' VoiceAssets ',
          aliases: [' Voice Assets '],
          language: 'en-US',
          priority: 100,
        },
      ],
    })
    await client.updateGlossarySet(glossaryId, 3, 'disabled')
    await client.createLLMProfile({
      provider_id: 'openai_compatible_llm',
      display_name: ' Compatible correction ',
      config: {
        base_url: 'https://llm.example.com/v1/',
        model: 'fixture-model',
        custom_header_names: ['x-tenant'],
        timeout: '30s',
        concurrency: 4,
        temperature: 0,
        context_limit: 64_000,
        structured_output: true,
        prompt_template: 'correction.v1',
        default_glossary_id: glossaryId,
        auto_approval_policy: 'never',
      },
      credentials,
      state: 'disabled',
      priority: 100,
    })
    await client.updateLLMProfile(profileId, 'openai_compatible_llm', 4, {
      credentials: { api_key: 'fixture-rotated-key', custom_headers: { 'X-Tenant': 'rotated' } },
    })

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/llm/provider-capabilities',
      `/api/v1/glossary-sets/${glossaryId}/versions`,
      `/api/v1/glossary-sets/${glossaryId}`,
      '/api/v1/llm-profiles',
      `/api/v1/llm-profiles/${profileId}`,
    ])
    expect(new Headers(fetcher.mock.calls[1]?.[1]?.headers).get('If-Match')).toBe('"2"')
    expect(new Headers(fetcher.mock.calls[2]?.[1]?.headers).get('If-Match')).toBe('"3"')
    expect(new Headers(fetcher.mock.calls[4]?.[1]?.headers).get('If-Match')).toBe('"4"')
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({
      entries: [
        {
          canonical_form: 'VoiceAssets',
          aliases: ['Voice Assets'],
          language: 'en-US',
          priority: 100,
        },
      ],
    })
    expect(JSON.parse(String(fetcher.mock.calls[3]?.[1]?.body))).toMatchObject({
      display_name: 'Compatible correction',
      config: {
        base_url: 'https://llm.example.com/v1',
        custom_header_names: ['X-Tenant'],
      },
      credentials: {
        api_key: 'fixture-compatible-key',
        custom_headers: { 'X-Tenant': 'tenant-secret' },
      },
    })
  })

  it('rejects unsafe or mismatched LLM credentials before making a request', async () => {
    const fetcher = vi.fn<Fetcher>()
    const client = new ApiClient('/api/v1', fetcher)
    const config = {
      base_url: 'https://llm.example.com/v1',
      model: 'fixture-model',
      custom_header_names: ['X-Tenant'],
      timeout: '30s',
      concurrency: 4,
      temperature: 0,
      context_limit: 64_000,
      structured_output: true as const,
      prompt_template: 'correction.v1',
      auto_approval_policy: 'never' as const,
    }

    expect(() =>
      client.createLLMProfile({
        provider_id: 'openai_compatible_llm',
        display_name: 'Unsafe endpoint',
        config: { ...config, base_url: 'http://llm.example.com/v1' },
        credentials: { api_key: 'fixture-api-key', custom_headers: { 'X-Tenant': 'value' } },
      }),
    ).toThrow('HTTPS')
    expect(() =>
      client.createLLMProfile({
        provider_id: 'openai_compatible_llm',
        display_name: 'Forbidden header',
        config: { ...config, custom_header_names: ['Authorization'] },
        credentials: { api_key: 'fixture-api-key', custom_headers: { Authorization: 'value' } },
      }),
    ).toThrow('safe HTTP header')
    expect(() =>
      client.createLLMProfile({
        provider_id: 'openai_compatible_llm',
        display_name: 'Mismatched header',
        config,
        credentials: { api_key: 'fixture-api-key', custom_headers: { 'X-Other': 'value' } },
      }),
    ).toThrow('match encrypted')
    expect(() =>
      client.updateLLMProfile('61000000-0000-4000-8000-000000000006', 'mock_llm', 1, {
        credentials: { api_key: 'fixture-api-key' },
      }),
    ).toThrow('does not accept credentials')
    expect(() =>
      client.createGlossarySet({
        display_name: 'Malformed glossary',
        scope_type: 'workspace',
        entries: [
          {
            canonical_form: 'VoiceAsset',
            aliases: ['Voice Asset'],
            language: 'en-US',
            priority: 100,
            regex: 'false',
          } as unknown as GlossaryEntry,
        ],
      }),
    ).toThrow('regex must be a boolean')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rejects unsafe upload declarations before making a request', async () => {
    const fetcher = vi.fn<Fetcher>()
    const client = new ApiClient('/api/v1', fetcher)

    expect(() =>
      client.createUpload(
        {
          asset_id: assetId,
          filename: '../recording.wav',
          mime_type: 'audio/wav',
          size_bytes: 44,
          sha256,
        },
        'upload-key',
      ),
    ).toThrow('filename')
    expect(fetcher).not.toHaveBeenCalled()
  })
})
