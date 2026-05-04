'use client';

import { useState, useEffect } from 'react';
import { useUser, useFirestore, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, getDocs, updateDoc, doc, serverTimestamp, getDoc } from 'firebase/firestore';
import { UserCog, Loader2, Mail, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export default function UserManagementPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  useEffect(() => {
    if (!firestore || !user) return;
    
    async function fetchData() {
      try {
        const uSnap = await getDocs(collection(firestore, 'users'));
        setAllUsers(uSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        
        const selfSnap = await getDoc(doc(firestore, 'users', user.uid));
        if (selfSnap.exists()) setCurrentUserRole(selfSnap.data().role);
      } catch (serverError) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: 'users',
          operation: 'list',
        }));
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [firestore, user]);

  const handleRoleChange = async (targetUserId: string, newRole: string) => {
    if (!firestore || !user) return;
    
    if (targetUserId === user.uid) {
      toast({
        title: "Restricted",
        description: "You cannot change your own administrative role.",
        variant: "destructive"
      });
      return;
    }

    if ((newRole === 'admin' || newRole === 'super_admin') && currentUserRole !== 'super_admin') {
      toast({
        title: "Permission Denied",
        description: "Only a Super Admin can assign administrative privileges.",
        variant: "destructive"
      });
      return;
    }

    try {
      await updateDoc(doc(firestore, 'users', targetUserId), {
        role: newRole,
        updatedAt: serverTimestamp()
      });

      setAllUsers(prev => prev.map(u => u.id === targetUserId ? { ...u, role: newRole } : u));
      
      toast({
        title: "Role Updated",
        description: `User role has been successfully changed to ${newRole}.`,
      });
    } catch (error) {
      toast({
        title: "Update Failed",
        description: "Could not save the new role assignment.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3">
          <UserCog className="h-8 w-8 text-primary" /> User Governance
        </h1>
        <p className="text-slate-500 font-medium">Manage platform access and member privileges across the ecosystem.</p>
      </div>

      <Card className="border-none shadow-sm rounded-[2.5rem] overflow-hidden bg-white">
        <CardHeader className="px-8 py-8 border-b border-slate-50 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl">Platform Members</CardTitle>
            <CardDescription>A complete list of registered users and their current roles.</CardDescription>
          </div>
          <Badge variant="outline" className="h-8 rounded-lg px-3 bg-slate-50 text-slate-600 border-slate-200">
            {allUsers.length} Registered Members
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow className="border-none hover:bg-transparent">
                <TableHead className="pl-8 h-12 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Member</TableHead>
                <TableHead className="h-12 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Email Address</TableHead>
                <TableHead className="h-12 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Current Role</TableHead>
                <TableHead className="h-12 font-bold text-slate-500 uppercase text-[10px] tracking-widest text-right pr-8">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-32 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary opacity-20" />
                  </TableCell>
                </TableRow>
              ) : allUsers.map((u) => (
                <TableRow key={u.id} className="group border-b border-slate-50 hover:bg-slate-50/30 transition-colors">
                  <TableCell className="pl-8 py-5">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                        {u.fullName?.charAt(0) || u.email?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <span className="font-bold text-slate-900 block">{u.fullName || 'Unnamed Member'}</span>
                        {u.isVerified && <span className="text-[9px] text-primary font-bold uppercase flex items-center gap-1">Verified Profile</span>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-slate-500">
                      <Mail className="h-3.5 w-3.5 opacity-50" />
                      <span className="text-sm font-medium">{u.email}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant="secondary" 
                      className={cn(
                        "rounded-lg px-2.5 py-0.5 font-bold text-[10px] uppercase tracking-wider",
                        u.role === 'super_admin' ? "bg-destructive/10 text-destructive" :
                        u.role === 'admin' ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-600"
                      )}
                    >
                      {u.role || 'user'}
                    </Badge>
                  </TableCell>
                  <TableCell className="pr-8 text-right">
                    <div className="flex justify-end gap-2">
                      <Select 
                        defaultValue={u.role || 'user'} 
                        onValueChange={(val) => handleRoleChange(u.id, val)}
                        disabled={u.id === user?.uid}
                      >
                        <SelectTrigger className="w-[140px] h-9 rounded-xl border-slate-200 bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="founder">Founder</SelectItem>
                          <SelectItem value="investor">Investor</SelectItem>
                          <SelectItem value="mentor">Mentor</SelectItem>
                          <SelectItem value="admin" disabled={currentUserRole !== 'super_admin'}>Admin</SelectItem>
                          <SelectItem value="super_admin" disabled={currentUserRole !== 'super_admin'}>Super Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      {currentUserRole !== 'super_admin' && (
        <div className="flex items-center gap-3 p-4 bg-orange-50 border border-orange-100 rounded-2xl">
           <ShieldAlert className="h-5 w-5 text-orange-600" />
           <p className="text-xs text-orange-800 font-medium">
             Limited Access: Some administrative role changes require **Super Admin** privileges.
           </p>
        </div>
      )}
    </div>
  );
}
