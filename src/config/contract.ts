export const API_VERSION = 'v1'
export const CONTRACT_VERSION = '0.1.0'

export const REQUIRED_SERVER_FEATURES = Object.freeze([
  'capability_negotiation',
  'health_checks',
  'request_ids',
  'structured_errors',
] as const)
