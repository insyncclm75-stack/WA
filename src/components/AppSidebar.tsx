import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { OrgSwitcher } from "@/components/OrgSwitcher";
import {
  LayoutDashboard,
  Users,
  Megaphone,
  MessageSquare,
  BarChart3,
  LogOut,
  MessageCircle,
  Settings,
  ShieldCheck,
  Building2,
  FileText,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function AppSidebar() {
  const location = useLocation();
  const { signOut, user } = useAuth();
  const { currentOrg, orgRole, isPlatformAdmin } = useOrg();

  const isAdmin = orgRole === "admin" || isPlatformAdmin;
  const hasOrg = !!currentOrg;

  const navItems = [
    { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    ...(hasOrg ? [
      { to: "/contacts", icon: Users, label: "Contacts" },
      { to: "/campaigns", icon: Megaphone, label: "Campaigns" },
      { to: "/templates", icon: FileText, label: "Templates" },
      { to: "/communications", icon: MessageSquare, label: "Communications" },
      { to: "/reports", icon: BarChart3, label: "Reports" },
      { to: "/settings", icon: Settings, label: "Settings" },
    ] : []),
    ...(isAdmin && hasOrg ? [{ to: "/billing", icon: Wallet, label: "Billing" }] : []),
    ...(isAdmin && hasOrg ? [{ to: "/users", icon: ShieldCheck, label: "User Management" }] : []),
    ...(isAdmin && hasOrg ? [{ to: "/org-settings", icon: Building2, label: "Org Settings" }] : []),
  ];

  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar text-sidebar-foreground">
      {/* Brand */}
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6">
        <MessageCircle className="h-7 w-7 text-sidebar-primary" />
        <span className="text-lg font-bold tracking-tight text-sidebar-primary-foreground">
          In-Sync
        </span>
      </div>

      {/* Org Switcher */}
      <div className="border-b border-sidebar-border px-3 py-2">
        <OrgSwitcher />
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const active = location.pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-4">
        <p className="mb-2 truncate text-xs text-sidebar-foreground/60">
          {user?.email}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          className="w-full justify-start gap-2 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </aside>
  );
}
