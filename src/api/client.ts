import { apiConfig } from '@/config/api'

export interface ApiErrorPayload {
  code: string
  message: string
  request_id: string
  trace_id?: string
}

interface ApiErrorEnvelope {
  error: ApiErrorPayload
}

export interface ServerCapabilities {
  server_version: string
  api_version: string
  contract_version: string
  features: string[]
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId?: string
  readonly traceId?: string

  constructor(
    message: string,
    options: {
      status: number
      code?: string
      requestId?: string
      traceId?: string
    },
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = options.status
    this.code = options.code ?? 'http_error'
    this.requestId = options.requestId
    this.traceId = options.traceId
  }
}

export type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function readApiError(value: unknown): ApiErrorPayload | undefined {
  if (typeof value !== 'object' || value === null || !('error' in value)) {
    return undefined
  }
  const envelope = value as ApiErrorEnvelope
  const error = envelope.error
  if (typeof error !== 'object' || error === null) {
    return undefined
  }

  const candidate = error as Partial<ApiErrorPayload>
  if (
    typeof candidate.code !== 'string' ||
    candidate.code.length === 0 ||
    typeof candidate.message !== 'string' ||
    candidate.message.length === 0 ||
    typeof candidate.request_id !== 'string' ||
    candidate.request_id.length === 0 ||
    (candidate.trace_id !== undefined && typeof candidate.trace_id !== 'string')
  ) {
    return undefined
  }

  return candidate as ApiErrorPayload
}

function readCapabilities(value: unknown): ServerCapabilities | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  const candidate = value as Partial<ServerCapabilities>
  if (
    typeof candidate.server_version !== 'string' ||
    candidate.server_version.length === 0 ||
    typeof candidate.api_version !== 'string' ||
    typeof candidate.contract_version !== 'string' ||
    !Array.isArray(candidate.features) ||
    candidate.features.some(
      (feature) => typeof feature !== 'string' || !/^[a-z][a-z0-9_]*$/.test(feature),
    ) ||
    new Set(candidate.features).size !== candidate.features.length ||
    candidate.features.some(
      (feature, index, features) => index > 0 && features[index - 1]! > feature,
    )
  ) {
    return undefined
  }

  return candidate as ServerCapabilities
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.headers.get('content-type')?.includes('application/json')) {
    return null
  }

  try {
    return await response.json()
  } catch {
    return null
  }
}

function relativeApiPath(path: string): string {
  if (/^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(path)) {
    throw new TypeError('API request paths must be relative to the configured server.')
  }

  return path.startsWith('/') ? path : `/${path}`
}

export class ApiClient {
  constructor(
    private readonly baseUrl = apiConfig.baseUrl,
    private readonly fetcher: Fetcher = (input, init) => fetch(input, init),
  ) {}

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers)
    headers.set('Accept', 'application/json')

    if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    const response = await this.fetcher(`${this.baseUrl}${relativeApiPath(path)}`, {
      ...init,
      credentials: 'include',
      headers,
    })
    const payload = await readJson(response)

    if (!response.ok) {
      const error = readApiError(payload)
      throw new ApiError(error?.message ?? `Request failed with status ${response.status}.`, {
        status: response.status,
        code: error?.code,
        requestId: error?.request_id ?? response.headers.get('x-request-id') ?? undefined,
        traceId: error?.trace_id ?? response.headers.get('x-trace-id') ?? undefined,
      })
    }

    return payload as T
  }

  async getCapabilities(): Promise<ServerCapabilities> {
    const payload = await this.request<unknown>('system/capabilities')
    const capabilities = readCapabilities(payload)
    if (!capabilities) {
      throw new TypeError('Server returned an invalid capabilities document.')
    }
    return capabilities
  }
}

export const apiClient = new ApiClient()
