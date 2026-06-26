'use client';

import { useState, useEffect, useMemo } from 'react';
import { useUser, useFirestore, errorEmitter, FirestorePermissionError } from '@/firebase';
import { 
  collection, 
  getDocs, 
  updateDoc, 
  doc, 
  serverTimestamp, 
  query,
  where,
  arrayUnion,
  arrayRemove,
  deleteDoc
} from 'firebase/firestore';
import { 
  UserCog, 
  Loader2, 
  Mail, 
  ShieldAlert, 
  Eye, 
  Activity, 
  Rocket, 
  Zap, 
  ShieldCheck, 
  Search,
  Filter,
  MoreVertical,
  Trash2,
  Ban,
  CheckCircle2,
  ExternalLink,
  MessageSquare,
  Users
} from 'lucide-react';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { logAdminAction } from '@/lib/audit-logs';
import Link from 'next/link';

export default function UserManagementPage() {
  const { user: currentAdmin } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');

  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isViewingInsights, setIsViewingInsights] = useState(false);
  const [isFetchingActivity, setIsFetchingActivity] = useState(false);
  const [activityStats, setActivityStats] = useState({
    startups: 0,
    pitches: 0,
    chats: 0,
    tasks: 0,
    contacts: 0
  });

  const fetchData = async () => {
    if (!firestore) return;
    setIsLoading(true);
    try {
      const uSnap = await getDocs(collection(firestore, 'users'));
      setAllUsers(uSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (serverError) {
      toast({ title: "Fetch Failed", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [firestore]);

  const filteredUsers = useMemo(() => {
    return allUsers.filter(u => {
      const matchesSearch = (u.fullName || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                           (u.email || '').toLowerCase().includes(searchTerm.toLowerCase());
      const rolesArr = u.roles || (u.role ? [u.role] : []);
      const matchesRole = roleFilter === 'all' || rolesArr.includes(roleFilter);
      const matchesPlan = planFilter === 'all' || u.plan === planFilter;
      return matchesSearch && matchesRole && matchesPlan;
    });
  }, [allUsers, searchTerm, roleFilter, planFilter]);

  const handleToggleSuspension = async (targetUser: any) => {
    if (!firestore || !currentAdmin) return;
    const isSuspending = targetUser.status !== 'suspended';
    
    try {
      await updateDoc(doc(firestore, 'users', targetUser.id), {
        status: isSuspending ? 'suspended' : 'active',
        updatedAt: serverTimestamp()
      });

      await logAdminAction(firestore, currentAdmin.uid, isSuspending ? 'suspend_user' : 'unsuspend_user', targetUser.id);
      
      setAllUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, status: isSuspending ? 'suspended' : 'active' } : u));
      toast({ title: isSuspending ? "User Suspended" : "User Reactivated" });
    } catch (e) {
      toast({ title: "Action Failed", variant: "destructive" });
    }
  };

  const handleToggleRole = async (targetUserId: string, roleToToggle: string, currentRoles: string[]) => {
    if (!firestore || !currentAdmin) return;
    
    if (targetUserId === currentAdmin.uid) {
      toast({ title: "Restricted", description: "You cannot modify your own administrative roles.", variant: "destructive" });
      return;
    }

    const isRemoving = (currentRoles || []).includes(roleToToggle);
    try {
      await updateDoc(doc(firestore, 'users', targetUserId), {
        roles: isRemoving ? arrayRemove(roleToToggle) : arrayUnion(roleToToggle),
        updatedAt: serverTimestamp()
      });

      await logAdminAction(firestore, currentAdmin.uid, 'update_role', targetUserId);
      fetchData();
      toast({ title: isRemoving ? "Role Removed" : "Role Assigned" });
    } catch (error) {
      toast({ title: "Operation Failed", variant: "destructive" });
    }
  };

  const handleViewInsights = async (targetUser: any) => {
    setSelectedUser(targetUser);
    setIsViewingInsights(true);
    setIsFetchingActivity(true);

    if (!firestore) return;

    try {
      const [sSnap, pSnap, cSnap, tSnap, conSnap] = await Promise.all([
        getDocs(query(collection(firestore, 'startups'), where('ownerUid', '==', targetUser.id))),
        getDocs(query(collection(firestore, 'venturePitches'), where('senderUid', '==', targetUser.id))),
        getDocs(query(collection(firestore, 'chats'), where('participants', 'array-contains', targetUser.id))),
        getDocs(query(collection(firestore, 'tasks'), where('ownerUid', '==', targetUser.id))),
        getDocs(query(collection(firestore, 'contacts'), where('ownerUid', '==', targetUser.id)))
      ]);

      setActivityStats({
        startups: sSnap.size,
        pitches: pSnap.size,
        chats: cSnap.size,
        tasks: tSnap.size,
        contacts: conSnap.size
      });
    } catch (error) {
      console.error(error);
    } finally {
      setIsFetchingActivity(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight text-slate-900 flex items-center gap-3">
            <UserCog className="h-8 w-8 text-primary" /> Member Governance
          </h1>
          <p className="text-slate-500 font-medium">Manage platform access, roles, and review member behavior.</p>
        </div>
        <Badge variant="outline" className="h-10 rounded-xl px-4 bg-white text-slate-600 border-slate-200 font-bold shadow-sm">
          {allUsers.length} Registered
        </Badge>
      </div>

      <Card className="border-none shadow-sm rounded-[2.5rem] bg-white overflow-hidden">
        <CardHeader className="p-8 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
             <div className="relative col-span-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input 
                  placeholder="Search by name or email..." 
                  className="pl-10 h-11 rounded-xl bg-slate-50 border-none"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
             </div>
             <select 
               className="h-11 rounded-xl bg-slate-50 border-none text-sm px-4 font-bold"
               value={roleFilter}
               onChange={e => setRoleFilter(e.target.value)}
             >
                <option value="all">All Roles</option>
                <option value="founder">Founders</option>
                <option value="investor">Investors</option>
                <option value="mentor">Mentors</option>
                <option value="admin">Admins</option>
             </select>
             <select 
               className="h-11 rounded-xl bg-slate-50 border-none text-sm px-4 font-bold"
               value={planFilter}
               onChange={e => setPlanFilter(e.target.value)}
             >
                <option value="all">All Plans</option>
                <option value="basic">Basic</option>
                <option value="pro">Pro</option>
                <option value="growth">Growth</option>
             </select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow className="border-none hover:bg-transparent">
                <TableHead className="pl-8 h-12 font-black text-slate-400 uppercase text-[10px] tracking-widest">Member</TableHead>
                <TableHead className="h-12 font-black text-slate-400 uppercase text-[10px] tracking-widest">Status & Plan</TableHead>
                <TableHead className="h-12 font-black text-slate-400 uppercase text-[10px] tracking-widest text-right pr-8">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={3} className="h-32 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary opacity-20" /></TableCell></TableRow>
              ) : filteredUsers.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="h-32 text-center text-slate-400 italic">No members match your criteria</TableCell></TableRow>
              ) : (
                filteredUsers.map((u) => {
                  const roles = u.roles || (u.role ? [u.role] : []);
                  const isSuspended = u.status === 'suspended';
                  return (
                    <TableRow key={u.id} className={cn("group border-b border-slate-50 hover:bg-slate-50/30", isSuspended && "opacity-60")}>
                      <TableCell className="pl-8 py-5">
                        <div className="flex items-center gap-3">
                          <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center font-bold text-base shadow-sm", isSuspended ? "bg-slate-200 text-slate-400" : "bg-primary/10 text-primary")}>
                            {u.fullName?.charAt(0) || '?'}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 block truncate max-w-[200px]">{u.fullName || 'Unnamed'}</span>
                            <span className="text-[10px] text-slate-400 font-bold uppercase">{u.email}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                         <div className="flex flex-wrap gap-1.5">
                            <Badge variant="outline" className={cn("rounded-lg text-[9px] font-black uppercase border-none", isSuspended ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700")}>
                              {u.status || 'Active'}
                            </Badge>
                            <Badge variant="secondary" className="rounded-lg text-[9px] font-black uppercase bg-primary/5 text-primary border-none">
                              {u.plan || 'Basic'}
                            </Badge>
                         </div>
                      </TableCell>
                      <TableCell className="pr-8 text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" className="h-9 px-3 rounded-xl gap-2 font-bold text-xs" onClick={() => handleViewInsights(u)}>
                            <Eye className="h-4 w-4" /> Insights
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                               <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl"><MoreVertical className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="rounded-xl w-48">
                               <DropdownMenuLabel>Administrative</DropdownMenuLabel>
                               <DropdownMenuItem onClick={() => handleToggleSuspension(u)} className="gap-2 cursor-pointer">
                                  {isSuspended ? <><CheckCircle2 className="h-4 w-4" /> Unsuspend</> : <><Ban className="h-4 w-4" /> Suspend User</>}
                               </DropdownMenuItem>
                               <DropdownMenuItem asChild className="gap-2 cursor-pointer">
                                  <Link href={`/founders/${u.id}`} target="_blank"><ExternalLink className="h-4 w-4" /> Public Profile</Link>
                               </DropdownMenuItem>
                               <DropdownMenuSeparator />
                               <DropdownMenuLabel>Modify Roles</DropdownMenuLabel>
                               {['founder', 'investor', 'mentor', 'admin'].map(r => (
                                 <DropdownMenuItem key={r} onClick={() => handleToggleRole(u.id, r, roles)} className="gap-2 cursor-pointer text-[10px] uppercase font-bold">
                                    {roles.includes(r) ? <><ShieldCheck className="h-3 w-3 text-green-500" /> {r}</> : <><ShieldAlert className="h-3 w-3 text-slate-300" /> {r}</>}
                                 </DropdownMenuItem>
                               ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isViewingInsights} onOpenChange={setIsViewingInsights}>
        <DialogContent className="sm:max-w-[500px] rounded-[2.5rem]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">Member Intelligence</DialogTitle>
            <DialogDescription>Snapshot of {selectedUser?.fullName}'s footprint.</DialogDescription>
          </DialogHeader>
          <div className="py-6 space-y-8">
            {isFetchingActivity ? (
              <div className="flex py-12 justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary opacity-20" /></div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                 {[
                   { label: 'Startups', val: activityStats.startups, icon: Rocket, color: 'text-purple-500' },
                   { label: 'Pitches', val: activityStats.pitches, icon: Zap, color: 'text-amber-500' },
                   { label: 'Conversations', val: activityStats.chats, icon: MessageSquare, color: 'text-blue-500' },
                   { label: 'Contacts', val: activityStats.contacts, icon: Users, color: 'text-emerald-500' },
                   { label: 'Work Tasks', val: activityStats.tasks, icon: CheckSquare, color: 'text-rose-500' },
                 ].map((s, i) => (
                   <div key={i} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-center">
                      <s.icon className={cn("h-4 w-4 mx-auto mb-2", s.color)} />
                      <p className="text-2xl font-black text-slate-900">{s.val}</p>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{s.label}</p>
                   </div>
                 ))}
              </div>
            )}
            
            <div className="p-6 rounded-[2rem] bg-slate-900 text-white relative overflow-hidden group">
               <div className="relative z-10 space-y-4">
                  <div className="flex justify-between items-center">
                     <p className="text-[10px] font-black uppercase tracking-widest text-primary">Membership Tier</p>
                     <Badge className="bg-primary/20 text-primary border-none font-black text-xs px-3">{selectedUser?.plan || 'Basic'}</Badge>
                  </div>
                  <div className="space-y-1">
                     <p className="text-xs font-bold text-slate-400">Profile Reference</p>
                     <code className="block text-[10px] font-mono text-primary truncate">{selectedUser?.id}</code>
                  </div>
               </div>
               <ShieldCheck className="absolute bottom-0 right-0 h-24 w-24 text-primary/5 -mr-4 -mb-4 group-hover:scale-110 transition-transform duration-700" />
            </div>

            <div className="flex gap-3">
               <Button className="flex-1 rounded-xl font-bold h-11" onClick={() => handleToggleSuspension(selectedUser)}>
                  {selectedUser?.status === 'suspended' ? 'Reactivate Member' : 'Suspend Account'}
               </Button>
               <Button variant="outline" className="rounded-xl font-bold h-11" onClick={() => setIsViewingInsights(false)}>Close Review</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
