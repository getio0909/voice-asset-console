import { describe, expect, it, vi } from 'vitest'

import { ApiClient, ApiError } from './client'
import type { Fetcher } from './client'

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
})
