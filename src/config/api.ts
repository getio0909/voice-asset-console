import { CONTRACT_VERSION } from './contract'

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()

export const apiConfig = Object.freeze({
  baseUrl: withoutTrailingSlash(configuredBaseUrl || '/api/v1'),
  contractVersion: CONTRACT_VERSION,
})
