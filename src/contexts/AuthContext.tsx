import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { withTimeout } from '../lib/withTimeout'
import { getUserErrorMessage } from '../lib/errorMessages'
import type { Profile } from '../types'

type ProfileState = 'loading' | 'guest' | 'found' | 'not_found' | 'deactivated' | 'error'

interface AuthContextValue {
  user: User | null
  profile: Profile | null
  profileState: ProfileState
  profileErrorMessage: string | null
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileState, setProfileState] = useState<ProfileState>('loading')
  const [profileErrorMessage, setProfileErrorMessage] = useState<string | null>(null)

  async function fetchProfile() {
    setProfileErrorMessage(null)
    try {
      const { data, error } = (await withTimeout(supabase.rpc('get_own_profile'))) as {
        data: Profile | null
        error: { message: string } | null
      }

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

      if (!data.active) {
        setProfile(null)
        setProfileState('deactivated')
        return
      }

      setProfile(data as Profile)
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
    // Seed initial session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) fetchProfile()
      else setProfileState('guest')
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) {
        setProfileState('loading')
        fetchProfile()
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
  // used after the user edits their own name/phone/avatar so the header and
  // any other screen reading `profile` from context picks up the change
  // immediately instead of waiting for the next auth state change.
  async function refreshProfile() {
    if (!user) return
    await fetchProfile()
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
