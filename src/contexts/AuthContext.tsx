import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { withTimeout } from '../lib/withTimeout'
import { getUserErrorMessage } from '../lib/errorMessages'
import { PROFILE_COLUMNS } from '../lib/profileApi'
import type { ProfileSummary } from '../lib/profileApi'

type ProfileState = 'loading' | 'guest' | 'found' | 'not_found' | 'deactivated' | 'error'

interface AuthContextValue {
  user: User | null
  // No phone: PROFILE_COLUMNS (a plain select) excludes it — that column is
  // column-grant-revoked for the authenticated role (see H3 migration).
  // ProfilePage is the only place that needs it, so it pays for the
  // get_own_profile() RPC itself rather than every page load doing so here.
  profile: ProfileSummary | null
  profileState: ProfileState
  profileErrorMessage: string | null
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<ProfileSummary | null>(null)
  const [profileState, setProfileState] = useState<ProfileState>('loading')
  const [profileErrorMessage, setProfileErrorMessage] = useState<string | null>(null)

  async function fetchProfile(uid: string) {
    setProfileErrorMessage(null)
    try {
      const { data, error } = await withTimeout(
        supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', uid).maybeSingle(),
      )

      if (error) {
        // Distinct from not_found: a real query/connection failure, not a
        // clean "no row" result — see H1 in AUDIT_PHASE2.md.
        setProfile(null)
        setProfileErrorMessage(getUserErrorMessage(error))
        setProfileState('error')
        return
      }

      if (!data) {
        setProfile(null)
        setProfileState('not_found')
        return
      }

      const row = data as ProfileSummary
      if (!row.active) {
        setProfile(null)
        setProfileState('deactivated')
        return
      }

      setProfile(row)
      setProfileState('found')
    } catch (err) {
      // Timeout (or any other thrown failure) — same treatment as an { error }
      // result above: never collapse into not_found's "contact administrator".
      setProfile(null)
      setProfileErrorMessage(getUserErrorMessage(err))
      setProfileState('error')
    }
  }

  useEffect(() => {
    // onAuthStateChange fires once immediately on subscribe with whatever
    // session is already cached (event INITIAL_SESSION), then again for
    // every subsequent sign-in/out/token-refresh — a separate getSession()
    // call up front was just duplicating that first fetch (every page load
    // ran fetchProfile twice). One subscription covers mount and every
    // later auth event with a single fetch each.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) {
        setProfileState('loading')
        fetchProfile(u.id)
      } else {
        setProfile(null)
        setProfileState('guest')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
  }

  // Re-reads the current user's own profile row without a loading flicker —
  // used after the user edits their own name/avatar so the header and any
  // other screen reading `profile` from context picks up the change
  // immediately instead of waiting for the next auth state change.
  async function refreshProfile() {
    if (!user) return
    await fetchProfile(user.id)
  }

  return (
    <AuthContext.Provider value={{ user, profile, profileState, profileErrorMessage, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
