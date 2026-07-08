import { TimeoutError } from './withTimeout'

const TIMEOUT_MESSAGE = 'This is taking too long — the server may be unreachable. Try again.'
const NETWORK_MESSAGE = "Couldn't reach the server. Check your connection and try again."
const GENERIC_MESSAGE = 'Something went wrong. Please try again.'

function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  // fetch() itself throws a bare TypeError ("Failed to fetch" / "Load failed" /
  // "NetworkError when attempting to fetch resource") when the request never
  // reaches the server at all.
  if (error instanceof TypeError) return true
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message?: unknown }).message ?? '').toLowerCase()
    return message.includes('fetch') || message.includes('network')
  }
  return false
}

// Maps any caught/returned error to a fixed, safe, user-facing string — never
// interpolates error.message/stack into what's shown. Always logs the raw
// error to the console so the detail isn't lost, just kept away from the UI.
export function getUserErrorMessage(error: unknown): string {
  console.error(error)

  if (error instanceof TimeoutError) return TIMEOUT_MESSAGE
  if (isNetworkError(error)) return NETWORK_MESSAGE
  return GENERIC_MESSAGE
}
