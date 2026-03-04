import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  website: string | null;
  industry: string | null;
  onboarding_completed: boolean;
  created_at: string;
}

export interface OrgMembership {
  org_id: string;
  role: "admin" | "member";
  organization: Organization;
}

interface OrgContextType {
  currentOrg: Organization | null;
  orgs: OrgMembership[];
  orgRole: "admin" | "member" | null;
  isPlatformAdmin: boolean;
  loading: boolean;
  switchOrg: (orgId: string) => void;
  refreshOrgs: () => Promise<void>;
}

const OrgContext = createContext<OrgContextType>({
  currentOrg: null,
  orgs: [],
  orgRole: null,
  isPlatformAdmin: false,
  loading: true,
  switchOrg: () => {},
  refreshOrgs: async () => {},
});

export const useOrg = () => useContext(OrgContext);

const LS_KEY = "wa_current_org_id";

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user, isPlatformAdmin, loading: authLoading } = useAuth();
  const [orgs, setOrgs] = useState<OrgMembership[]>([]);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [orgRole, setOrgRole] = useState<"admin" | "member" | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOrgs = useCallback(async () => {
    // Wait for auth to finish before fetching orgs
    if (authLoading) return;

    if (!user || isPlatformAdmin) {
      setOrgs([]);
      setCurrentOrg(null);
      setOrgRole(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data: memberships } = await supabase
      .from("org_memberships")
      .select("org_id, role, organizations(*)")
      .eq("user_id", user.id);

    const mapped: OrgMembership[] = (memberships ?? []).map((m: any) => ({
      org_id: m.org_id,
      role: m.role as "admin" | "member",
      organization: m.organizations as Organization,
    }));

    setOrgs(mapped);

    const savedOrgId = localStorage.getItem(LS_KEY);
    const savedMembership = mapped.find((m) => m.org_id === savedOrgId);

    if (savedMembership) {
      setCurrentOrg(savedMembership.organization);
      setOrgRole(savedMembership.role);
    } else if (mapped.length > 0) {
      setCurrentOrg(mapped[0].organization);
      setOrgRole(mapped[0].role);
      localStorage.setItem(LS_KEY, mapped[0].org_id);
    } else {
      setCurrentOrg(null);
      setOrgRole(null);
    }

    setLoading(false);
  }, [user, isPlatformAdmin, authLoading]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      await fetchOrgs();
    };
    run();

    return () => {
      cancelled = true;
    };
  }, [fetchOrgs]);

  const switchOrg = (orgId: string) => {
    const membership = orgs.find((m) => m.org_id === orgId);
    if (membership) {
      setCurrentOrg(membership.organization);
      setOrgRole(membership.role);
      localStorage.setItem(LS_KEY, orgId);
    }
  };

  return (
    <OrgContext.Provider
      value={{
        currentOrg,
        orgs,
        orgRole,
        isPlatformAdmin,
        loading,
        switchOrg,
        refreshOrgs: fetchOrgs,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}
