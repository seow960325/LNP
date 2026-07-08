export class TimeoutError extends Error {
  constructor(message = 'Request timed out') {
    super(message)
    this.name = 'TimeoutError'
  }
}

const DEFAULT_TIMEOUT_MS = 15000

// Races any thenable (including Supabase's PromiseLike query builders) against
// a timer, rejecting with TimeoutError if it doesn't settle in time — so a
// stalled connection can never leave a loading/saving flag stuck true.
export function withTimeout<T>(promise: PromiseLike<T>, ms: number = DEFAULT_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError()), ms)
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}
