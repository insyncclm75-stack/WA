import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  isPlatformAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  isPlatformAdmin: false,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  // Version counter to discard stale resolveAdmin results
  const adminCheckRef = useRef(0);

  useEffect(() => {
    // Single handler for all auth events
    const handleSession = async (session: Session | null) => {
      setSession(session);
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        const version = ++adminCheckRef.current;
        try {
          const { data } = await supabase.rpc("has_role", {
            _user_id: currentUser.id,
            _role: "platform_admin" as any,
          });
          // Only apply if this is still the latest check
          if (adminCheckRef.current === version) {
            setIsPlatformAdmin(!!data);
            setLoading(false);
          }
        } catch {
          if (adminCheckRef.current === version) {
            setIsPlatformAdmin(false);
            setLoading(false);
          }
        }
      } else {
        adminCheckRef.current++;
        setIsPlatformAdmin(false);
        setLoading(false);
      }
    };

    // Bootstrap from existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSession(session);
    });

    // Listen for all subsequent auth events (sign-in, sign-out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        handleSession(session);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    // Eagerly clear state so UI reacts immediately
    adminCheckRef.current++;
    setSession(null);
    setUser(null);
    setIsPlatformAdmin(false);
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, isPlatformAdmin, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
