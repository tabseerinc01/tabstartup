'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, errorEmitter, FirestorePermissionError } from '@/firebase';
import { doc, getDoc, collection, getDocs, updateDoc, serverTimestamp } from 'firebase/firestore';
import { 
  Loader2, 
  ShieldAlert, 
  Users, 
  Rocket, 
  Wrench, 
  Settings, 
  Activity, 
  ShieldCheck, 
  Heart,
  LayoutDashboard,
  Server,
  Zap,
  Lock,
  ExternalLink,
  FileText,
  MoreVertical,
  Mail,
  UserCog
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { AdminHeader } from '@/components/admin/admin-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

export default function ControlPanelPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  
  const [stats, setStats] = useState({
    users: 0,
    startups: 0,
    services: 0,
    interests: 0
  });
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(true);

  useEffect(() => {
    async function checkAuthorization() {
      if (isUserLoading) return;
      
      if (!user) {
        router.push('/login');
        return;
      }

      try {
        const snap = await getDoc(doc(firestore, 'users', user.uid));
        if (snap.exists()) {
          const role = snap.data().role;
          setCurrentUserRole(role);
          if (role === 'admin' || role === 'super_admin') {
            setIsAuthorized(true);
          } else {
            router.push('/dashboard');
          }
        } else {
          router.push('/dashboard');
        }
      } catch (error) {
        console.error("Authorization check failed:", error);
        router.push('/dashboard');
      }
    }

    checkAuthorization();
  }, [user, isUserLoading, firestore, router]);

  useEffect(() => {
    if (isAuthorized === true && firestore) {
      async function fetchStats() {
        try {
          const [uSnap, sSnap, svSnap, pSnap] = await Promise.all([
            getDocs(collection(firestore, 'users')),
            getDocs(collection(firestore, 'startups')),
            getDocs(collection(firestore, 'services')),
            getDocs(collection(firestore, 'pitches'))
          ]);
          
          setStats({
            users: uSnap.size,
            startups: sSnap.size,
            services: svSnap.size,
            interests: pSnap.size
          });

          const userList = uSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          setAllUsers(userList);
        } catch (serverError: any) {
          const permissionError = new FirestorePermissionError({
            path: 'users',
            operation: 'list',
          });
          errorEmitter.emit('permission-error', permissionError);
        } finally {
          setIsStatsLoading(false);
          setIsUsersLoading(false);
        }
      }
      fetchStats();
    }
  }, [isAuthorized, firestore]);

  const handleRoleChange = async (targetUserId: string, newRole: string) => {
    if (!firestore || !user) return;
    
    // Restriction: Cannot change own role
    if (targetUserId === user.uid) {
      toast({
        title: "Restricted",
        description: "You cannot change your own administrative role.",
        variant: "destructive"
      });
      return;
    }

    // Restriction: Only super_admin can assign admin/super_admin roles
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
      console.error("Failed to update role:", error);
      toast({
        title: "Update Failed",
        description: "Could not save the new role assignment.",
        variant: "destructive"
      });
    }
  };

  if (isUserLoading || isAuthorized === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-destructive" />
          <p className="text-sm font-medium text-slate-400 animate-pulse">Initializing Root Access...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full bg-slate-50">
      <AdminSidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <AdminHeader />
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div className="max-w-7xl mx-auto space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-destructive font-bold text-sm tracking-widest uppercase">
                  <Server className="h-4 w-4" /> System Control
                </div>
                <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">Admin Dashboard</h1>
                <p className="text-slate-500 font-medium">Real-time platform metrics and user governance.</p>
              </div>
            </div>

            <Tabs defaultValue="overview" className="w-full space-y-6">
              <TabsList className="bg-white p-1 h-12 rounded-2xl shadow-sm border border-slate-100">
                <TabsTrigger value="overview" className="rounded-xl px-6 gap-2">
                  <LayoutDashboard className="h-4 w-4" /> Overview
                </TabsTrigger>
                <TabsTrigger value="users" className="rounded-xl px-6 gap-2">
                  <Users className="h-4 w-4" /> User Management
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    { label: 'Total Users', value: stats.users, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
                    { label: 'Active Startups', value: stats.startups, icon: Rocket, color: 'text-purple-600', bg: 'bg-purple-50' },
                    { label: 'Live Services', value: stats.services, icon: Wrench, color: 'text-orange-600', bg: 'bg-orange-50' },
                    { label: 'Interests Log', value: stats.interests, icon: Heart, color: 'text-rose-600', bg: 'bg-rose-50' },
                  ].map((stat, i) => (
                    <Card key={i} className="border-none shadow-sm hover:shadow-md transition-shadow rounded-[2rem] overflow-hidden">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div className={cn("p-3 rounded-2xl", stat.bg)}>
                            <stat.icon className={cn("h-6 w-6", stat.color)} />
                          </div>
                          <div className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">Platform Data</div>
                        </div>
                        <div>
                          <div className="text-3xl font-black text-slate-900">
                            {isStatsLoading ? <Loader2 className="h-6 w-6 animate-spin opacity-20" /> : stat.value}
                          </div>
                          <p className="text-sm font-bold text-slate-500 mt-1">{stat.label}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="grid gap-8 lg:grid-cols-3">
                  <div className="lg:col-span-2 space-y-6">
                    <Card className="border-none shadow-sm rounded-[2.5rem] overflow-hidden bg-white">
                      <CardHeader className="pb-2 border-b border-slate-50 px-8 py-8 flex flex-row items-center justify-between">
                        <div>
                          <CardTitle className="text-xl font-bold">Management Modules</CardTitle>
                          <CardDescription>Direct action tools for platform moderation.</CardDescription>
                        </div>
                      </CardHeader>
                      <CardContent className="p-8">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {[
                            { title: 'User Access', desc: 'Manage permissions and roles.', icon: Lock, active: true, tab: 'users' },
                            { title: 'Listing Audit', desc: 'Approve or flag startups.', icon: Rocket },
                            { title: 'Content Review', desc: 'Moderate service descriptions.', icon: FileText },
                            { title: 'System Settings', desc: 'Global platform configuration.', icon: Settings },
                          ].map((tool, i) => (
                            <Button 
                              key={i} 
                              variant="outline" 
                              className="h-24 justify-start gap-4 px-6 rounded-2xl border-slate-100 hover:border-destructive/20 hover:bg-destructive/5 transition-all text-left"
                            >
                              <div className="p-2 bg-slate-50 rounded-xl text-slate-400 group-hover:text-destructive group-hover:bg-destructive/10">
                                <tool.icon className="h-6 w-6" />
                              </div>
                              <div>
                                <p className="font-bold text-slate-900">{tool.title}</p>
                                <p className="text-xs text-slate-500">{tool.desc}</p>
                              </div>
                            </Button>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl shadow-slate-200">
                      <div className="space-y-2 text-center md:text-left">
                          <h3 className="text-xl font-bold flex items-center gap-2 justify-center md:justify-start">
                            <Activity className="h-5 w-5 text-destructive" /> Platform Health: Optimal
                          </h3>
                          <p className="text-slate-400 text-sm">All core services are responding within expected latency (24ms).</p>
                      </div>
                      <Button variant="secondary" className="rounded-full px-8 bg-white text-slate-900 hover:bg-slate-100 font-bold">
                          System Status <ExternalLink className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <Card className="border-none shadow-sm rounded-[2.5rem] overflow-hidden bg-white">
                      <CardHeader className="bg-slate-50 py-6 px-8">
                        <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-500">System Activity</CardTitle>
                      </CardHeader>
                      <CardContent className="p-8 space-y-6">
                        {[
                          { event: 'Admin Session', time: 'Just now', icon: ShieldCheck, color: 'text-green-500' },
                          { event: 'Rule Sync', time: '2 mins ago', icon: Activity, color: 'text-blue-500' },
                          { event: 'Database Backup', time: '1 hour ago', icon: LayoutDashboard, color: 'text-slate-400' },
                        ].map((log, i) => (
                          <div key={i} className="flex items-center gap-4">
                            <div className={cn("p-2 rounded-lg bg-slate-50", log.color)}>
                              <log.icon className="h-4 w-4" />
                            </div>
                            <div className="flex-1">
                              <p className="text-xs font-bold text-slate-800">{log.event}</p>
                              <p className="text-[10px] text-slate-400">{log.time}</p>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="users" className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <Card className="border-none shadow-sm rounded-[2.5rem] overflow-hidden bg-white">
                  <CardHeader className="px-8 py-8 border-b border-slate-50 flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-2xl font-bold flex items-center gap-3">
                        <UserCog className="h-6 w-6 text-primary" /> User Governance
                      </CardTitle>
                      <CardDescription>Manage user roles and platform access permissions.</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                       <Badge variant="outline" className="h-8 rounded-lg px-3 bg-slate-50 text-slate-600 border-slate-200">
                         {allUsers.length} Registered Members
                       </Badge>
                    </div>
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
                        {isUsersLoading ? (
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
                                <span className="font-bold text-slate-900">{u.fullName || 'Unnamed Member'}</span>
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
                                  disabled={u.id === user.uid}
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
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </div>
  );
}
