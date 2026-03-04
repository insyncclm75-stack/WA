import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Search, Pencil } from "lucide-react";

interface ManagedUser {
  id: string;
  email: string;
  role: string;
  created_at: string;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
}

const ORG_ROLES = ["admin", "member"];

function roleBadgeVariant(role: string): "default" | "secondary" | "outline" {
  if (role === "admin") return "default";
  return "outline";
}

export default function Users() {
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [newUser, setNewUser] = useState({ email: "", password: "", role: "member" });
  const [addLoading, setAddLoading] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ManagedUser | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  const callManageUsers = async (body: Record<string, unknown>) => {
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    const res = await supabase.functions.invoke("manage-users", {
      body: { ...body, org_id: currentOrg!.id },
      headers: { Authorization: `Bearer ${currentSession?.access_token}` },
    });
    if (res.error) throw new Error(res.error.message);
    if (res.data?.error) throw new Error(res.data.error);
    return res.data;
  };

  const fetchUsers = async () => {
    if (!currentOrg) return;
    setLoading(true);
    try {
      const data = await callManageUsers({ action: "list" });
      setUsers(data.users || []);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!currentOrg) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await callManageUsers({ action: "list" });
        if (!cancelled) setUsers(data.users || []);
      } catch (err: any) {
        if (!cancelled) toast({ variant: "destructive", title: "Error", description: err.message });
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [currentOrg]);

  const addUser = async () => {
    if (!newUser.email || !newUser.password || !newUser.role) return;
    setAddLoading(true);
    try {
      await callManageUsers({ action: "create", email: newUser.email, password: newUser.password, role: newUser.role });
      toast({ title: "User created" });
      setNewUser({ email: "", password: "", role: "member" });
      setAddOpen(false);
      fetchUsers();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
    setAddLoading(false);
  };

  const updateRole = async () => {
    if (!editTarget || !editRole) return;
    setEditLoading(true);
    try {
      await callManageUsers({ action: "update_role", user_id: editTarget.id, role: editRole });
      toast({ title: "Role updated" });
      setEditOpen(false);
      setEditTarget(null);
      fetchUsers();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
    setEditLoading(false);
  };

  const deleteUser = async (targetId: string) => {
    try {
      await callManageUsers({ action: "delete", user_id: targetId });
      toast({ title: "User removed" });
      fetchUsers();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
  };

  const openEditDialog = (u: ManagedUser) => {
    setEditTarget(u);
    setEditRole(u.role);
    setEditOpen(true);
  };

  const filtered = users.filter(
    (u) => u.email.toLowerCase().includes(search.toLowerCase()) || u.role.toLowerCase().includes(search.toLowerCase())
  );

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });
  };

  return (
    <DashboardLayout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">User Management</h1>
          <p className="text-muted-foreground">Manage team members for {currentOrg?.name}</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> Add User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add User</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Email *</Label>
                <Input value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} placeholder="user@example.com" />
              </div>
              <div>
                <Label>Password *</Label>
                <Input type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} placeholder="Minimum 6 characters" />
              </div>
              <div>
                <Label>Role *</Label>
                <Select value={newUser.role} onValueChange={(v) => setNewUser({ ...newUser, role: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORG_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={addUser} className="w-full" disabled={addLoading}>
                {addLoading ? "Creating..." : "Create User"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Role</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{editTarget?.email}</p>
            <div>
              <Label>Role</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORG_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={updateRole} className="w-full" disabled={editLoading}>
              {editLoading ? "Updating..." : "Update Role"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-muted-foreground">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No users found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Email Confirmed</TableHead>
                  <TableHead>Last Sign In</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => {
                  const isSelf = u.id === user?.id;
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.email}</TableCell>
                      <TableCell>
                        <Badge variant={roleBadgeVariant(u.role)}>{u.role}</Badge>
                      </TableCell>
                      <TableCell>{formatDate(u.created_at)}</TableCell>
                      <TableCell>{u.email_confirmed_at ? "Yes" : "No"}</TableCell>
                      <TableCell>{formatDate(u.last_sign_in_at)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(u)} disabled={isSelf} title={isSelf ? "Cannot edit own role" : "Edit role"}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" disabled={isSelf} title={isSelf ? "Cannot remove yourself" : "Remove user"}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove User</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to remove <strong>{u.email}</strong> from this organization?
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteUser(u.id)}>Remove</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
