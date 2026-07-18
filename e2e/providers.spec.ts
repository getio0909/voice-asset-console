import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { CONTRACT_VERSION } from '../src/config/contract'

const userId = '11000000-0000-4000-8000-000000000001'
const workspaceId = '22000000-0000-4000-8000-000000000002'
const hotwordSetId = '33000000-0000-4000-8000-000000000003'
const profileId = '44000000-0000-4000-8000-000000000004'
const now = '2026-07-16T21:00:00Z'

const createSecretId = 'fixture-tencent-secret-id'
const createSecretKey = 'fixture-tencent-secret-key'
const rotationSecretId = 'fixture-rotated-secret-id'
const rotationSecretKey = 'fixture-rotated-secret-key'

const principal = {
  id: userId,
  workspace_id: workspaceId,
  role: 'owner',
  email: 'owner@example.com',
  scopes: [
    'admin:read',
    'admin:write',
    'assets:write',
    'audio:read',
    'corrections:write',
    'transcriptions:write',
    'transcripts:read',
  ],
}

const capabilities = [
  {
    provider_id: 'mock_asr',
    batch: true,
    realtime: false,
    sentence: false,
    languages: ['*'],
    models: ['deterministic_fixture'],
    formats: ['wav', 'm4a'],
    sample_rates: [8_000, 16_000],
    hotwords: false,
    temporary_hotwords: false,
    timestamps: true,
    word_timestamps: true,
    speaker_diarization: false,
    punctuation: true,
    number_normalization: false,
    max_duration_ms: 43_200_000,
    max_file_size_bytes: 536_870_912,
    max_concurrency: 128,
  },
  {
    provider_id: 'aliyun_asr',
    batch: true,
    realtime: false,
    sentence: false,
    languages: ['*'],
    models: ['project_configured'],
    formats: ['wav', 'm4a'],
    sample_rates: [8_000, 16_000],
    hotwords: true,
    temporary_hotwords: false,
    timestamps: true,
    word_timestamps: true,
    speaker_diarization: false,
    punctuation: true,
    number_normalization: true,
    max_duration_ms: 7_200_000,
    max_file_size_bytes: 536_870_912,
    max_concurrency: 2,
  },
  {
    provider_id: 'tencent_asr',
    batch: true,
    realtime: false,
    sentence: false,
    languages: ['*'],
    models: ['16k_zh'],
    formats: ['wav', 'm4a'],
    sample_rates: [8_000, 16_000],
    hotwords: true,
    temporary_hotwords: true,
    timestamps: true,
    word_timestamps: true,
    speaker_diarization: true,
    punctuation: true,
    number_normalization: true,
    max_duration_ms: 7_200_000,
    max_file_size_bytes: 536_870_912,
    max_concurrency: 20,
  },
]

test('manages ASR profiles and immutable hotwords without retaining credentials', async ({
  page,
}) => {
  let authenticated = false
  let hotwordSet: Record<string, unknown> | undefined
  let profile: Record<string, unknown> | undefined
  let hotwordCreatePayload: Record<string, unknown> | undefined
  let hotwordVersionPayload: Record<string, unknown> | undefined
  let providerCreatePayload: Record<string, unknown> | undefined
  let providerRotationPayload: Record<string, unknown> | undefined
  let hotwordVersionETag: string | null = null
  let hotwordStateETag: string | null = null
  let providerRotationETag: string | null = null
  let providerStateETag: string | null = null
  const unsafeAuthorizationHeaders: Array<string | null> = []
  const unexpectedRequests: string[] = []
  const consoleErrors: string[] = []

  page.on('console', (message) => {
    const text = message.text()
    if (
      message.type() === 'error' &&
      text !== 'Failed to load resource: the server responded with a status of 401 (Unauthorized)'
    ) {
      consoleErrors.push(text)
    }
  })

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const method = request.method()
    const path = new URL(request.url()).pathname

    if (method !== 'GET') {
      unsafeAuthorizationHeaders.push(await request.headerValue('authorization'))
    }

    if (method === 'GET' && path === '/api/v1/system/capabilities') {
      await route.fulfill({
        json: {
          server_version: '0.8.0-test',
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
      if (authenticated) {
        await route.fulfill({ json: { user: principal } })
      } else {
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
      }
      return
    }

    if (method === 'POST' && path === '/api/v1/auth/sessions') {
      authenticated = true
      await route.fulfill({
        status: 201,
        json: {
          expires_at: '2026-07-17T21:00:00Z',
          refresh_expires_at: '2026-08-16T21:00:00Z',
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

    if (method === 'GET' && path === '/api/v1/asr/provider-capabilities') {
      await route.fulfill({ json: { items: capabilities } })
      return
    }

    if (method === 'GET' && path === '/api/v1/hotword-sets') {
      await route.fulfill({ json: { items: hotwordSet ? [hotwordSet] : [] } })
      return
    }

    if (method === 'GET' && path === '/api/v1/provider-profiles') {
      await route.fulfill({ json: { items: profile ? [profile] : [] } })
      return
    }

    if (method === 'POST' && path === '/api/v1/hotword-sets') {
      hotwordCreatePayload = request.postDataJSON() as Record<string, unknown>
      hotwordSet = {
        id: hotwordSetId,
        workspace_id: workspaceId,
        ...hotwordCreatePayload,
        scope_id: null,
        current_version: 1,
        resource_version: 1,
        created_at: now,
        updated_at: now,
      }
      await route.fulfill({ status: 201, json: hotwordSet })
      return
    }

    if (method === 'POST' && path === `/api/v1/hotword-sets/${hotwordSetId}/versions`) {
      hotwordVersionETag = await request.headerValue('if-match')
      hotwordVersionPayload = request.postDataJSON() as Record<string, unknown>
      hotwordSet = {
        ...hotwordSet,
        entries: hotwordVersionPayload.entries,
        current_version: 2,
        resource_version: 2,
        updated_at: now,
      }
      await route.fulfill({ status: 201, json: hotwordSet })
      return
    }

    if (method === 'PATCH' && path === `/api/v1/hotword-sets/${hotwordSetId}`) {
      hotwordStateETag = await request.headerValue('if-match')
      const payload = request.postDataJSON() as { state: string }
      hotwordSet = {
        ...hotwordSet,
        state: payload.state,
        resource_version: 3,
        updated_at: now,
      }
      await route.fulfill({ json: hotwordSet })
      return
    }

    if (method === 'POST' && path === '/api/v1/provider-profiles') {
      providerCreatePayload = request.postDataJSON() as Record<string, unknown>
      const publicInput = { ...providerCreatePayload }
      delete publicInput.credentials
      profile = {
        id: profileId,
        workspace_id: workspaceId,
        ...publicInput,
        version: 1,
        secret_configured: true,
        created_at: now,
        updated_at: now,
      }
      await route.fulfill({ status: 201, json: profile })
      return
    }

    if (method === 'PATCH' && path === `/api/v1/provider-profiles/${profileId}`) {
      const payload = request.postDataJSON() as Record<string, unknown>
      const etag = await request.headerValue('if-match')
      if ('credentials' in payload) {
        providerRotationPayload = payload
        providerRotationETag = etag
      } else {
        providerStateETag = etag
      }
      const publicUpdate = { ...payload }
      delete publicUpdate.credentials
      profile = {
        ...profile,
        ...publicUpdate,
        version: Number(profile?.version ?? 0) + 1,
        secret_configured: true,
        updated_at: now,
      }
      await route.fulfill({ json: profile })
      return
    }

    if (method === 'POST' && path === `/api/v1/provider-profiles/${profileId}/health`) {
      await route.fulfill({
        json: { profile_id: profileId, status: 'healthy', checked_at: now },
      })
      return
    }

    unexpectedRequests.push(`${method} ${path}`)
    await route.fulfill({
      status: 500,
      json: {
        error: {
          code: 'unexpected_request',
          message: `${method} ${path}`,
          request_id: 'request-unexpected',
        },
      },
    })
  })

  await page.goto('/assets')
  await page.getByLabel('Email').fill('owner@example.com')
  await page.getByLabel('Password').fill('correct horse battery staple')
  await page.getByRole('button', { name: 'Sign in securely' }).click()
  await expect(page.getByText('owner@example.com')).toBeVisible()

  await page.getByRole('link', { name: 'Providers', exact: true }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'ASR providers & hotwords' }),
  ).toBeVisible()
  await expect(page.locator('.capability-card')).toHaveCount(3)

  await page.getByLabel('Hotword set name').fill('Console product terms')
  await page.getByLabel('Hotword term').fill('VoiceAsset')
  await page.getByLabel('Hotword aliases').fill('Voice Asset, Voice Assets')
  await page.getByRole('button', { name: 'Create hotword version 1' }).click()

  const hotwordItem = page.getByRole('listitem').filter({ hasText: 'Console product terms' })
  await expect(hotwordItem).toContainText('v1')
  await page.getByLabel('Version target').selectOption({ label: 'Console product terms (v1)' })
  await page.getByLabel('Replacement term').fill('VoiceAsset Console')
  await page.getByRole('button', { name: 'Publish hotword version' }).click()
  await expect(hotwordItem).toContainText('v2')
  await page.getByRole('button', { name: 'Disable Console product terms' }).click()
  await expect(hotwordItem).toContainText('disabled')

  await page.getByLabel('ASR provider').selectOption('tencent_asr')
  await page.getByLabel('Tencent AppID').fill('1234567890')
  await page.getByLabel('Tencent SecretId').fill(createSecretId)
  await page.getByLabel('Tencent SecretKey').fill(createSecretKey)
  await page.getByRole('button', { name: 'Create ASR profile' }).click()

  const profileItem = page.getByRole('listitem').filter({ hasText: 'Tencent Flash ASR' })
  await expect(profileItem).toContainText('encrypted credential configured')
  await expect(page.getByLabel('Tencent SecretId')).toHaveValue('')
  await expect(page.getByLabel('Tencent SecretKey')).toHaveValue('')

  await page.getByRole('button', { name: 'Rotate credentials for Tencent Flash ASR' }).click()
  await page.getByLabel('New Tencent SecretId').fill(rotationSecretId)
  await page.getByLabel('New Tencent SecretKey').fill(rotationSecretKey)
  await page.getByRole('button', { name: 'Replace credential' }).click()
  await expect(page.getByRole('heading', { name: 'Rotate Tencent Flash ASR' })).toHaveCount(0)

  const healthButton = page.getByRole('button', { name: 'Check health for Tencent Flash ASR' })
  await healthButton.click()
  await expect(healthButton).toHaveText('healthy')
  await page.getByRole('button', { name: 'Enable Tencent Flash ASR' }).click()
  await expect(profileItem).toContainText('enabled')

  expect(hotwordCreatePayload).toMatchObject({
    display_name: 'Console product terms',
    scope_type: 'workspace',
  })
  expect(hotwordVersionPayload).toMatchObject({
    entries: [{ term: 'VoiceAsset Console', language: 'zh-CN', weight: 90 }],
  })
  expect(hotwordVersionETag).toBe('"1"')
  expect(hotwordStateETag).toBe('"2"')
  expect(providerCreatePayload).toMatchObject({
    provider_id: 'tencent_asr',
    credentials: { secret_id: createSecretId, secret_key: createSecretKey },
    config: { vendor_extension: { appid: '1234567890' } },
  })
  expect(providerRotationPayload).toEqual({
    credentials: { secret_id: rotationSecretId, secret_key: rotationSecretKey },
  })
  expect(providerRotationETag).toBe('"1"')
  expect(providerStateETag).toBe('"2"')
  expect(unsafeAuthorizationHeaders.every((header) => header === null)).toBe(true)
  expect(unexpectedRequests).toEqual([])
  expect(consoleErrors).toEqual([])

  const pageText = await page.locator('body').innerText()
  const publicProfile = JSON.stringify(profile)
  for (const secret of [createSecretId, createSecretKey, rotationSecretId, rotationSecretKey]) {
    expect(pageText).not.toContain(secret)
    expect(publicProfile).not.toContain(secret)
  }
  expect(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
  ).toEqual({ local: [], session: [] })

  const accessibility = await new AxeBuilder({ page }).analyze()
  expect(accessibility.violations).toEqual([])
})
