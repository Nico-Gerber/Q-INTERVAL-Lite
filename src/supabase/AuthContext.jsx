import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';

const AuthContext = createContext({
  user: null, profile: null, profileError: null, loading: true,
  signOut: async () => {}, refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  // Tagged with the user id it belongs to, so a stale profile is never read for a new user.
  const [profileState, setProfileState] = useState({ userId: null, profile: null, error: null });

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return; }

    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setAuthLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const userId = user?.id ?? null;

  const fetchProfile = useCallback(async (id) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, status')
      .eq('id', id)
      .maybeSingle();
    setProfileState({ userId: id, profile: data ?? null, error: error ? 'Could not load your account details.' : null });
  }, []);

  // Runs outside onAuthStateChange so we never call Supabase from inside its callback.
  useEffect(() => {
    if (userId && supabase) fetchProfile(userId);
  }, [userId, fetchProfile]);

  const refreshProfile = useCallback(async () => {
    if (userId && supabase) await fetchProfile(userId);
  }, [userId, fetchProfile]);

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  const profileReady = !user || profileState.userId === user.id;
  const loading = authLoading || !profileReady;
  const profile = user && profileReady ? profileState.profile : null;
  const profileError = user && profileReady ? profileState.error : null;

  return (
    <AuthContext.Provider value={{ user, profile, profileError, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
