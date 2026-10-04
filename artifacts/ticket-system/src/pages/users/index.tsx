import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { KeyRound, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function RoleEditor({ email, currentRole, onSaved }: { email: string; currentRole: string; onSaved: (r: string) => void }) {
  const [role, setRole] = useState(currentRole ?? 'end_user');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/users/role', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Failed to update role');
      }
      onSaved(role);
    } catch (err: any) {
      alert(err?.message || 'Could not update role');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={role} onValueChange={(v) => setRole(v)}>
        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="end_user">End user</SelectItem>
          <SelectItem value="agent">Agent</SelectItem>
          <SelectItem value="admin">Admin</SelectItem>
        </SelectContent>
      </Select>
      <Button size="sm" onClick={save} disabled={saving || role === currentRole}>{saving ? 'Saving...' : 'Save'}</Button>
    </div>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", fullName: "", role: "end_user" });
  const [passwordUser, setPasswordUser] = useState<any | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const { toast } = useToast();

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/users');
      if (!res.ok) throw new Error('Failed to load users');
      const body = await res.json();
      setUsers(body.data || []);
    } catch (err) {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchUsers(); }, []);

  const createUser = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email.trim(), password: form.password, fullName: form.fullName.trim() || undefined, role: form.role })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Failed to create user');
      }
      toast({ title: 'User created' });
      setForm({ email: '', password: '', fullName: '', role: 'end_user' });
      fetchUsers();
    } catch (err: any) {
      toast({ title: 'Could not create user', description: err?.message || 'Check input and try again.', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const deleteUser = async (userId: number) => {
    const ok = window.confirm('Delete this user?');
    if (!ok) return;

    try {
      const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Failed to delete user');
      }
      toast({ title: 'User deleted' });
      fetchUsers();
    } catch (err: any) {
      toast({ title: 'Could not delete user', description: err?.message || 'Check input and try again.', variant: 'destructive' });
    }
  };

  const changePassword = async () => {
    if (!passwordUser) return;
    if (newPassword.length < 6) {
      toast({ title: 'Password is too short', description: 'Use at least 6 characters.', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }

    setUpdatingPassword(true);
    try {
      const res = await fetch(`/api/users/${passwordUser.id}/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Failed to update password');
      }
      toast({ title: 'Password updated' });
      setPasswordUser(null);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      toast({ title: 'Could not update password', description: err?.message || 'Check the password and try again.', variant: 'destructive' });
    } finally {
      setUpdatingPassword(false);
    }
  };

  const canCreateUser = !!form.email.trim() && !!form.password.trim();

  return (
    <AppLayout>
      <div className="flex-1 p-8 pt-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Users</h2>
            <p className="text-muted-foreground">Manage application users and roles.</p>
          </div>
        </div>

        <Card className="p-4 mb-6">
          <div className="grid grid-cols-4 gap-4">
            <div><Label>Full name</Label><Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Alex Morgan" /></div>
            <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="alex@example.com" /></div>
            <div><Label>Password</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Choose a secure password" /></div>
            <div><Label>Role</Label><Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="end_user">End user</SelectItem><SelectItem value="agent">Agent</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent></Select></div>
          </div>
          <div className="mt-4">
            <Button onClick={createUser} disabled={creating || !canCreateUser}>{creating ? 'Creating...' : 'Create user'}</Button>
          </div>
        </Card>

        <Card className="p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="h-24 text-center">Loading...</TableCell></TableRow>
              ) : users && users.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="h-24 text-center">No users found.</TableCell></TableRow>
              ) : (
                users?.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>{u.firstName} {u.lastName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <RoleEditor
                        email={u.email}
                        currentRole={u.role}
                        onSaved={(newRole) => setUsers((prev) => prev?.map((p) => p.id === u.id ? { ...p, role: newRole } : p) ?? null)}
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.createdAt ? new Date(u.createdAt).toLocaleString() : '—'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => { setPasswordUser(u); setNewPassword(''); setConfirmPassword(''); }}>
                          <KeyRound className="mr-2 h-4 w-4" /> Change password
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => deleteUser(u.id)}>
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}            </TableBody>
          </Table>
        </Card>

        <Dialog open={!!passwordUser} onOpenChange={(open) => { if (!open && !updatingPassword) setPasswordUser(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Change password</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Set a new password for {passwordUser?.email}.
            </p>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="new-password">New password</Label>
                <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPasswordUser(null)} disabled={updatingPassword}>Cancel</Button>
              <Button onClick={changePassword} disabled={updatingPassword || !newPassword || !confirmPassword}>
                {updatingPassword ? 'Updating...' : 'Update password'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
