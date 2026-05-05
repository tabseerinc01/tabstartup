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
  count
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
  ExternalLink
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

  // Insights State
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
        if (selfSnap.exists()) setCurrentUserRole(selfSnap.data().role);
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

  const handleViewInsights = async (targetUser: any) => {
    setSelectedUser(targetUser);
    setIsViewingInsights(true);
    setIsFetchingActivity(true);

    if (!firestore) return;

    try {
      // Fetch Startups Owned
      const startupsQ = query(collection(firestore, 'startups'), where('ownerUid', '==', targetUser.id));
      const startupsSnap = await getDocs(startupsQ);
      
      // Fetch Pitches (Sent or Received)
      const field = targetUser.role === 'investor' ? 'fromInvestorUid' : 'toFounderUid';
      const pitchesQ = query(collection(firestore, 'pitches'), where(field, '==', targetUser.id));
      const pitchesSnap = await getDocs(pitchesQ);

      // Fetch Chats
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
          <p className="text-slate-500 font-medium">Manage platform access and monitor member activity across the ecosystem.</p>
        </div>
        <Badge variant="outline" className="h-10 rounded-xl px-4 bg-white text-slate-600 border-slate-200 font-bold shadow-sm">
          {allUsers.length} Registered Members
        </Badge>
      </div>

      <Card className="border-none shadow-sm rounded-[2.5rem] overflow-hidden bg-white">
        <CardHeader className="px-8 py-8 border-b border-slate-50">
          <CardTitle className="text-xl">Member Directory</CardTitle>
          <CardDescription>Review profile details and update access levels for all platform participants.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow className="border-none hover:bg-transparent">
                <TableHead className="pl-8 h-12 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Member</TableHead>
                <TableHead className="h-12 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Account Type</TableHead>
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
                     <div className="flex flex-col gap-1">
                        <span className="text-xs font-bold text-slate-700 capitalize">{u.role || 'user'} Account</span>
                        {u.isVerified && (
                          <div className="flex items-center gap-1 text-primary">
                            <CheckCircle2 className="h-3 w-3" />
                            <span className="text-[9px] font-bold uppercase tracking-wider">Verified Profile</span>
                          </div>
                        )}
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
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-9 px-3 rounded-xl gap-2 font-bold text-xs"
                        onClick={() => handleViewInsights(u)}
                      >
                        <Eye className="h-4 w-4" /> Insights
                      </Button>

                      <Select 
                        defaultValue={u.role || 'user'} 
                        onValueChange={(val) => handleRoleChange(u.id, val)}
                        disabled={u.id === user?.uid}
                      >
                        <SelectTrigger className="w-[140px] h-9 rounded-xl border-slate-200 bg-white font-medium text-xs">
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
             Security Note: Assigning administrative privileges (Admin/Super Admin) requires **Super Admin** clearance.
           </p>
        </div>
      )}

      {/* User Insights Dialog */}
      <Dialog open={isViewingInsights} onOpenChange={setIsViewingInsights}>
        <DialogContent className="sm:max-w-[600px] rounded-[2rem] p-0 overflow-hidden border-none shadow-2xl">
          <DialogHeader className="p-8 bg-slate-50 border-b">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground text-2xl font-black shadow-lg">
                {selectedUser?.fullName?.charAt(0) || '?'}
              </div>
              <div className="space-y-1">
                <DialogTitle className="text-2xl font-black text-slate-900">{selectedUser?.fullName || 'User Insights'}</DialogTitle>
                <div className="flex items-center gap-2">
                  <Badge className="bg-slate-200 text-slate-700 hover:bg-slate-200 border-none rounded-lg text-[10px] font-bold uppercase tracking-wider">
                    {selectedUser?.role || 'User'}
                  </Badge>
                  <span className="text-xs text-slate-400 font-medium">{selectedUser?.email}</span>
                </div>
              </div>
            </div>
          </DialogHeader>

          <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
            {/* Core Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Briefcase className="h-3 w-3" /> Headline
                  </p>
                  <p className="text-sm font-bold text-slate-700 leading-snug">
                    {selectedUser?.headline || selectedUser?.investorHeadline || 'No headline set'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <MapPin className="h-3 w-3" /> Location
                  </p>
                  <p className="text-sm font-bold text-slate-700">{selectedUser?.location || 'Unknown'}</p>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Platform Status</p>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                   <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">Verification</span>
                      <Badge className={cn(
                        "text-[9px] font-bold border-none h-5 px-2",
                        selectedUser?.isVerified ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500"
                      )}>
                        {selectedUser?.isVerified ? 'VERIFIED' : 'PENDING'}
                      </Badge>
                   </div>
                   <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">Role Access</span>
                      <span className="text-[10px] font-black text-primary uppercase">{selectedUser?.role || 'User'}</span>
                   </div>
                </div>
              </div>
            </div>

            <Separator className="bg-slate-100" />

            {/* Platform Activity */}
            <div className="space-y-4">
               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Activity className="h-3 w-3" /> Platform Activity Insights
               </p>
               
               {isFetchingActivity ? (
                 <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-6 w-6 animate-spin text-primary opacity-30" />
                 </div>
               ) : (
                 <div className="grid grid-cols-3 gap-4">
                    <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-[1.5rem] text-center">
                       <Rocket className="h-5 w-5 text-blue-600 mx-auto mb-2" />
                       <p className="text-2xl font-black text-blue-900">{activityStats.startups}</p>
                       <p className="text-[9px] font-bold text-blue-600 uppercase tracking-tight">Startups</p>
                    </div>
                    <div className="p-4 bg-rose-50/50 border border-rose-100 rounded-[1.5rem] text-center">
                       <Heart className="h-5 w-5 text-rose-600 mx-auto mb-2" />
                       <p className="text-2xl font-black text-rose-900">{activityStats.pitches}</p>
                       <p className="text-[9px] font-bold text-rose-600 uppercase tracking-tight">Interests</p>
                    </div>
                    <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-[1.5rem] text-center">
                       <MessageSquare className="h-5 w-5 text-emerald-600 mx-auto mb-2" />
                       <p className="text-2xl font-black text-emerald-900">{activityStats.chats}</p>
                       <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-tight">Chats</p>
                    </div>
                 </div>
               )}
            </div>

            {/* Detailed Bio */}
            {selectedUser?.bio && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Account Biography</p>
                <div className="p-4 bg-slate-50/50 border border-slate-100 rounded-2xl">
                  <p className="text-xs text-slate-600 leading-relaxed italic">"{selectedUser.bio}"</p>
                </div>
              </div>
            )}
            
            {/* Skills */}
            {selectedUser?.skills && selectedUser.skills.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Associated Skills</p>
                <div className="flex flex-wrap gap-1.5">
                   {selectedUser.skills.map((s: string) => (
                     <Badge key={s} variant="outline" className="rounded-lg text-[9px] font-bold bg-white text-slate-500 border-slate-200">
                       {s}
                     </Badge>
                   ))}
                </div>
              </div>
            )}
          </div>

          <div className="p-6 bg-slate-50 border-t flex justify-end gap-3">
             <Button variant="ghost" className="rounded-xl font-bold text-xs" onClick={() => setIsViewingInsights(false)}>
                Close Insights
             </Button>
             <Button 
                className="rounded-xl font-bold text-xs gap-2" 
                asChild
             >
                <a href={`/founders/${selectedUser?.id}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" /> View Public Profile
                </a>
             </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
