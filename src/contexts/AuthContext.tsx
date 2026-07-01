import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import type { Profile } from '../types'

type ProfileState = 'loading' | 'guest' | 'found' | 'not_found' | 'deactivated'

interface AuthContextValue {
  user: User | null
  profile: Profile | null
  profileState: ProfileState
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileState, setProfileState] = useState<ProfileState>('loading')

  async function fetchProfile(uid: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle()

    if (error) {
      // Treat fetch errors as not_found — don't crash or loop
      setProfile(null)
      setProfileState('not_found')
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
  }

  useEffect(() => {
    // Seed initial session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) fetchProfile(u.id)
      else setProfileState('guest')
    })

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

  return (
    <AuthContext.Provider value={{ user, profile, profileState, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
