import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { CONTRACT_VERSION } from '../src/config/contract'

const userId = '11000000-0000-4000-8000-000000000011'
const workspaceId = '22000000-0000-4000-8000-000000000012'
const glossaryId = '33000000-0000-4000-8000-000000000013'
const profileId = '44000000-0000-4000-8000-000000000014'
const now = '2026-07-16T22:00:00Z'
const createAPIKey = 'fixture-create-api-key'
const createHeaderValue = 'fixture-create-tenant'
const rotationAPIKey = 'fixture-rotation-api-key'
const rotationHeaderValue = 'fixture-rotation-tenant'

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
    provider_id: 'mock_llm',
    structured_patch: true,
    custom_headers: false,
    max_context_tokens: 1_000_000,
    max_concurrency: 128,
  },
  {
    provider_id: 'openai_compatible_llm',
    structured_patch: true,
    custom_headers: true,
    max_context_tokens: 1_000_000,
    max_concurrency: 128,
  },
]

test('manages LLM profiles and immutable glossaries without retaining credentials', async ({
  page,
}) => {
  let authenticated = false
  let glossary: Record<string, unknown> | undefined
  let profile: Record<string, unknown> | undefined
  let glossaryCreatePayload: Record<string, unknown> | undefined
  let glossaryVersionPayload: Record<string, unknown> | undefined
  let profileCreatePayload: Record<string, unknown> | undefined
  let profileRotationPayload: Record<string, unknown> | undefined
  let profilePolicyPayload: Record<string, unknown> | undefined
  let glossaryVersionETag: string | null = null
  let glossaryStateETag: string | null = null
  let profileRotationETag: string | null = null
  let profileStateETag: string | null = null
  let profilePolicyETag: string | null = null
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

    if (method !== 'GET')
      unsafeAuthorizationHeaders.push(await request.headerValue('authorization'))

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
      await route.fulfill(
        authenticated
          ? { json: { user: principal } }
          : {
              status: 401,
              json: {
                error: {
                  code: 'unauthorized',
                  message: 'Authentication is required.',
                  request_id: 'request-session',
                },
              },
            },
      )
      return
    }

    if (method === 'POST' && path === '/api/v1/auth/sessions') {
      authenticated = true
      await route.fulfill({
        status: 201,
        json: {
          expires_at: '2026-07-17T22:00:00Z',
          refresh_expires_at: '2026-08-16T22:00:00Z',
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

    if (method === 'GET' && path === '/api/v1/llm/provider-capabilities') {
      await route.fulfill({ json: { items: capabilities } })
      return
    }
    if (method === 'GET' && path === '/api/v1/glossary-sets') {
      await route.fulfill({ json: { items: glossary ? [glossary] : [] } })
      return
    }
    if (method === 'GET' && path === '/api/v1/llm-profiles') {
      await route.fulfill({ json: { items: profile ? [profile] : [] } })
      return
    }

    if (method === 'POST' && path === '/api/v1/glossary-sets') {
      glossaryCreatePayload = request.postDataJSON() as Record<string, unknown>
      glossary = {
        id: glossaryId,
        workspace_id: workspaceId,
        ...glossaryCreatePayload,
        scope_id: null,
        current_version: 1,
        resource_version: 1,
        created_at: now,
        updated_at: now,
      }
      await route.fulfill({ status: 201, json: glossary })
      return
    }

    if (method === 'POST' && path === `/api/v1/glossary-sets/${glossaryId}/versions`) {
      glossaryVersionETag = await request.headerValue('if-match')
      glossaryVersionPayload = request.postDataJSON() as Record<string, unknown>
      glossary = {
        ...glossary,
        entries: glossaryVersionPayload.entries,
        current_version: 2,
        resource_version: 2,
        updated_at: now,
      }
      await route.fulfill({ status: 201, json: glossary })
      return
    }

    if (method === 'PATCH' && path === `/api/v1/glossary-sets/${glossaryId}`) {
      glossaryStateETag = await request.headerValue('if-match')
      const payload = request.postDataJSON() as { state: string }
      glossary = { ...glossary, state: payload.state, resource_version: 3, updated_at: now }
      await route.fulfill({ json: glossary })
      return
    }

    if (method === 'POST' && path === '/api/v1/llm-profiles') {
      profileCreatePayload = request.postDataJSON() as Record<string, unknown>
      const publicInput = { ...profileCreatePayload }
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

    if (method === 'PATCH' && path === `/api/v1/llm-profiles/${profileId}`) {
      const payload = request.postDataJSON() as Record<string, unknown>
      const etag = await request.headerValue('if-match')
      if ('credentials' in payload) {
        profileRotationPayload = payload
        profileRotationETag = etag
      } else if ('config' in payload) {
        profilePolicyPayload = payload
        profilePolicyETag = etag
      } else {
        profileStateETag = etag
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

    if (method === 'POST' && path === `/api/v1/llm-profiles/${profileId}/health`) {
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

  await page.getByRole('link', { name: 'LLM providers' }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'LLM providers & glossaries' }),
  ).toBeVisible()
  await expect(page.locator('.capability-card')).toHaveCount(2)

  await page.getByLabel('Glossary set name').fill('Console correction terms')
  await page.getByLabel('Canonical form', { exact: true }).fill('VoiceAsset')
  await page.getByLabel('Aliases (comma-separated)').fill('Voice Asset, Voice Assets')
  await page.getByRole('button', { name: 'Create glossary set' }).click()

  const glossaryItem = page.getByRole('listitem').filter({ hasText: 'Console correction terms' })
  await expect(glossaryItem).toContainText('v1')
  await page.getByLabel('Version target').selectOption({ label: 'Console correction terms (v1)' })
  await page.getByLabel('Replacement canonical form').fill('VoiceAssets')
  await page.getByLabel('Replacement aliases').fill('Voice Asset')
  await page.getByRole('button', { name: 'Publish glossary version' }).click()
  await expect(glossaryItem).toContainText('v2')
  await page.getByRole('button', { name: 'Disable Console correction terms' }).click()
  await expect(glossaryItem).toContainText('disabled')

  await page.getByLabel('LLM provider').selectOption('openai_compatible_llm')
  await page.getByLabel('HTTPS base URL').fill('https://llm.example.test/v1/')
  await page.getByLabel('Model', { exact: true }).fill('fixture-model')
  await page.getByLabel('Auto-approval policy').selectOption('validated_glossary_only')
  await page.getByLabel('API key').fill(createAPIKey)
  await page.getByRole('button', { name: 'Add custom header' }).click()
  await page.getByLabel('Custom header name 1').fill('x-tenant-id')
  await page.getByLabel('Custom header value 1').fill(createHeaderValue)
  await page.getByRole('button', { name: 'Create LLM profile' }).click()

  const profileItem = page.getByRole('listitem').filter({ hasText: 'OpenAI-compatible LLM' })
  await expect(profileItem).toContainText('encrypted credential configured')
  await expect(page.getByLabel('API key')).toHaveValue('')
  await expect(page.getByLabel('Custom header name 1')).toHaveCount(0)

  await page.getByRole('button', { name: 'Rotate credentials for OpenAI-compatible LLM' }).click()
  await page.getByLabel('New API key').fill(rotationAPIKey)
  await page.getByLabel('New X-Tenant-Id value').fill(rotationHeaderValue)
  await page.getByRole('button', { name: 'Replace credential' }).click()
  await expect(page.getByRole('heading', { name: 'Rotate OpenAI-compatible LLM' })).toHaveCount(0)

  const healthButton = page.getByRole('button', {
    name: 'Check health for OpenAI-compatible LLM',
  })
  await healthButton.click()
  await expect(healthButton).toHaveText('healthy')
  await page.getByRole('button', { name: 'Enable OpenAI-compatible LLM' }).click()
  await expect(profileItem).toContainText('enabled')
  await page
    .getByRole('button', { name: 'Require manual review for OpenAI-compatible LLM' })
    .click()
  await expect(profileItem).toContainText('policy: never')

  expect(glossaryCreatePayload).toMatchObject({
    display_name: 'Console correction terms',
    scope_type: 'workspace',
    entries: [{ canonical_form: 'VoiceAsset', aliases: ['Voice Asset', 'Voice Assets'] }],
  })
  expect(glossaryVersionPayload).toMatchObject({
    entries: [{ canonical_form: 'VoiceAssets', aliases: ['Voice Asset'] }],
  })
  expect(glossaryVersionETag).toBe('"1"')
  expect(glossaryStateETag).toBe('"2"')
  expect(profileCreatePayload).toMatchObject({
    provider_id: 'openai_compatible_llm',
    credentials: {
      api_key: createAPIKey,
      custom_headers: { 'X-Tenant-Id': createHeaderValue },
    },
    config: {
      base_url: 'https://llm.example.test/v1',
      model: 'fixture-model',
      custom_header_names: ['X-Tenant-Id'],
      structured_output: true,
      auto_approval_policy: 'validated_glossary_only',
    },
  })
  expect(profileRotationPayload).toEqual({
    credentials: {
      api_key: rotationAPIKey,
      custom_headers: { 'X-Tenant-Id': rotationHeaderValue },
    },
  })
  expect(profileRotationETag).toBe('"1"')
  expect(profileStateETag).toBe('"2"')
  expect(profilePolicyPayload).toMatchObject({
    config: { auto_approval_policy: 'never', custom_header_names: ['X-Tenant-Id'] },
  })
  expect(profilePolicyETag).toBe('"3"')
  expect(unsafeAuthorizationHeaders.every((header) => header === null)).toBe(true)
  expect(unexpectedRequests).toEqual([])
  expect(consoleErrors).toEqual([])

  const pageText = await page.locator('body').innerText()
  const publicProfile = JSON.stringify(profile)
  for (const secret of [createAPIKey, createHeaderValue, rotationAPIKey, rotationHeaderValue]) {
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
