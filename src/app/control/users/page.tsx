'use client';

import { useState, useEffect } from 'react';
import { useUser, useFirestore, errorEmitter, FirestorePermissionError } from '@/firebase';
import { 
  collection, 
  getDocs, 
  updateDoc, 
  doc, 
  serverTimestamp, 
  getDoc,
  query,
  where,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { 
  UserCog, 
  Loader2, 
  Mail, 
  ShieldAlert, 
  Eye, 
  Activity, 
  Rocket, 
  Heart, 
  MessageSquare, 
  MapPin, 
  CheckCircle2,
  Briefcase,
  ExternalLink,
  ShieldCheck,
  Zap
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

export default function UserManagementPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isViewingInsights, setIsViewingInsights] = useState(false);
  const [isFetchingActivity, setIsFetchingActivity] = useState(false);
  const [activityStats, setActivityStats] = useState({
    startups: 0,
    pitches: 0,
    chats: 0
  });

  const fetchData = async () => {
    if (!firestore) return;
    setIsLoading(true);
    try {
      const uSnap = await getDocs(collection(firestore, 'users'));
      setAllUsers(uSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      
      if (user) {
        const selfSnap = await getDoc(doc(firestore, 'users', user.uid));
        if (selfSnap.exists()) setCurrentUserRole(selfSnap.data().role || selfSnap.data().primaryRole);
      }
    } catch (serverError) {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: 'users',
        operation: 'list',
      }));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [firestore, user]);

  const handleToggleRole = async (targetUserId: string, roleToToggle: string, currentRoles: string[]) => {
    if (!firestore || !user) return;
    
    if (targetUserId === user.uid) {
      toast({ title: "Restricted", description: "You cannot modify your own administrative roles.", variant: "destructive" });
      return;
    }

    if ((roleToToggle === 'admin' || roleToToggle === 'super_admin') && currentUserRole !== 'super_admin') {
      toast({ title: "Permission Denied", description: "Only a Super Admin can assign administrative privileges.", variant: "destructive" });
      return;
    }

    const isRemoving = currentRoles.includes(roleToToggle);
    try {
      await updateDoc(doc(firestore, 'users', targetUserId), {
        roles: isRemoving ? arrayRemove(roleToToggle) : arrayUnion(roleToToggle),
        updatedAt: serverTimestamp()
      });

      setAllUsers(prev => prev.map(u => {
        if (u.id === targetUserId) {
          const newRoles = isRemoving 
            ? u.roles.filter((r: string) => r !== roleToToggle) 
            : [...(u.roles || []), roleToToggle];
          return { ...u, roles: newRoles };
        }
        return u;
      }));
      
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
      const startupsQ = query(collection(firestore, 'startups'), where('ownerUid', '==', targetUser.id));
      const startupsSnap = await getDocs(startupsQ);
      
      const rolesArr = (targetUser.roles || (targetUser.role ? [targetUser.role] : ['user'])).filter(Boolean) as string[];
      const field = rolesArr.includes('investor') ? 'fromInvestorUid' : 'toFounderUid';
      const pitchesQ = query(collection(firestore, 'pitches'), where(field, '==', targetUser.id));
      const pitchesSnap = await getDocs(pitchesQ);

      const chatsQ = query(collection(firestore, 'chats'), where('participants', 'array-contains', targetUser.id));
      const chatsSnap = await getDocs(chatsQ);

      setActivityStats({
        startups: startupsSnap.size,
        pitches: pitchesSnap.size,
        chats: chatsSnap.size
      });
    } catch (error) {
      console.error("Error fetching activity insights:", error);
    } finally {
      setIsFetchingActivity(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3">
            <UserCog className="h-8 w-8 text-primary" /> User Governance
          </h1>
          <p className="text-slate-500 font-medium">Manage platform access and multiple roles for ecosystem members.</p>
        </div>
        <Badge variant="outline" className="h-10 rounded-xl px-4 bg-white text-slate-600 border-slate-200 font-bold shadow-sm">
          {allUsers.length} Registered Members
        </Badge>
      </div>

      <Card className="border-none shadow-sm rounded-[2.5rem] overflow-hidden bg-white">
        <CardHeader className="px-8 py-8 border-b border-slate-50">
          <CardTitle className="text-xl">Member Directory</CardTitle>
          <CardDescription>Review profile details and update role associations.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow className="border-none hover:bg-transparent">
                <TableHead className="pl-8 h-12 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Member</TableHead>
                <TableHead className="h-12 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Active Roles</TableHead>
                <TableHead className="h-12 font-bold text-slate-500 uppercase text-[10px] tracking-widest text-right pr-8">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-32 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary opacity-20" />
                  </TableCell>
                </TableRow>
              ) : allUsers.map((u) => {
                const rolesArr = (u.roles || (u.role ? [u.role] : ['user'])).filter(Boolean) as string[];
                return (
                  <TableRow key={u.id} className="group border-b border-slate-50 hover:bg-slate-50/30 transition-colors">
                    <TableCell className="pl-8 py-5">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-base">
                          {u.fullName?.charAt(0) || u.email?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span className="font-bold text-slate-900 block">{u.fullName || 'Unnamed Member'}</span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Mail className="h-3 w-3 text-slate-400" />
                            <span className="text-[11px] text-slate-500 font-medium">{u.email}</span>
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                       <div className="flex flex-wrap gap-1.5">
                          {rolesArr.map((r: string) => (
                            <Badge 
                              key={r}
                              variant="secondary" 
                              className={cn(
                                "rounded-lg px-2.5 py-0.5 font-bold text-[9px] uppercase tracking-wider",
                                r === 'super_admin' ? "bg-destructive/10 text-destructive" :
                                r === 'admin' ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-600"
                              )}
                            >
                              {r.replace('_', ' ')}
                            </Badge>
                          ))}
                       </div>
                    </TableCell>
                    <TableCell className="pr-8 text-right">
                      <div className="flex justify-end gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-9 px-3 rounded-xl gap-2 font-bold text-xs"
                          onClick={() => handleViewInsights(u)}
                        >
                          <Eye className="h-4 w-4" /> Insights
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
