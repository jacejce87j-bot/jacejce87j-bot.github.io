import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

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
      const res = await fetch('/api/auth/register', {
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
  }

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
            <Button onClick={createUser} disabled={creating || !form.email.trim() || !form.password.trim()}>{creating ? 'Creating...' : 'Create user'}</Button>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4} className="h-24 text-center">Loading...</TableCell></TableRow>
              ) : users && users.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="h-24 text-center">No users found.</TableCell></TableRow>
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
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </AppLayout>
  );
}
