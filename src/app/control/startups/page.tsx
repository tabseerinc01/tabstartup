'use client';

import { useState, useEffect } from 'react';
import { useFirestore, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, getDocs, query, orderBy, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { 
  Rocket, 
  Loader2, 
  Eye, 
  MapPin, 
  Briefcase, 
  Calendar, 
  Star, 
  CheckCircle2, 
  AlertCircle, 
  EyeOff, 
  MoreHorizontal, 
  Trash2, 
  StarOff 
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
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export default function StartupOversightPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [allStartups, setAllStartups] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  async function fetchData() {
    if (!firestore) return;
    setIsLoading(true);
    try {
      const startupsQ = query(collection(firestore, 'startups'), orderBy('createdAt', 'desc'));
      const [sSnap, uSnap] = await Promise.all([
        getDocs(startupsQ),
        getDocs(collection(firestore, 'users'))
      ]);
      
      setAllStartups(sSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setAllUsers(uSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (serverError) {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: 'startups',
        operation: 'list',
      }));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, [firestore]);

  const handleToggleStatus = async (startupId: string, currentStatus: string) => {
    if (!firestore) return;
    const newStatus = currentStatus === 'hidden' ? 'active' : 'hidden';
    
    setIsUpdating(startupId);
    try {
      await updateDoc(doc(firestore, 'startups', startupId), {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
      
      setAllStartups(prev => prev.map(s => s.id === startupId ? { ...s, status: newStatus } : s));
      toast({
        title: "Visibility Updated",
        description: `Startup is now ${newStatus === 'active' ? 'visible' : 'hidden'} on the platform.`
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: "Could not change visibility status."
      });
    } finally {
      setIsUpdating(null);
    }
  };

  const handleToggleFeatured = async (startupId: string, currentFeatured: boolean) => {
    if (!firestore) return;
    const newFeatured = !currentFeatured;
    
    setIsUpdating(startupId);
    try {
      await updateDoc(doc(firestore, 'startups', startupId), {
        featured: newFeatured,
        updatedAt: serverTimestamp()
      });
      
      setAllStartups(prev => prev.map(s => s.id === startupId ? { ...s, featured: newFeatured } : s));
      toast({
        title: newFeatured ? "Venture Featured" : "Feature Removed",
        description: newFeatured ? "This startup is now highlighted for the community." : "Removed from featured listings."
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Toggle Failed",
        description: "Could not update featured status."
      });
    } finally {
      setIsUpdating(null);
    }
  };

  const handleDeleteStartup = async (startupId: string) => {
    if (!firestore) return;
    
    if (!confirm("Are you sure you want to delete this startup? This action is permanent and cannot be undone.")) {
      return;
    }

    setIsUpdating(startupId);
    try {
      await deleteDoc(doc(firestore, 'startups', startupId));
      setAllStartups(prev => prev.filter(s => s.id !== startupId));
      toast({
        title: "Startup Deleted",
        description: "The venture listing has been permanently removed."
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: "Could not remove the startup listing."
      });
    } finally {
      setIsUpdating(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3">
            <Rocket className="h-8 w-8 text-primary" /> Venture Oversight
          </h1>
          <p className="text-slate-500 font-medium">Monitor active startup listings, verify founders, and manage placement.</p>
        </div>
        <Badge variant="outline" className="h-10 rounded-xl px-4 bg-white text-slate-600 border-slate-200 font-bold shadow-sm">
          {allStartups.length} Registered Ventures
        </Badge>
      </div>

      <Card className="border-none shadow-sm rounded-[2.5rem] overflow-hidden bg-white">
        <CardHeader className="px-8 py-8 border-b border-slate-50">
          <CardTitle className="text-xl">Startup Registry</CardTitle>
          <CardDescription>Comprehensive oversight of all business entities within the ecosystem.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow className="border-none hover:bg-transparent">
                <TableHead className="pl-8 h-12 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Venture Name</TableHead>
                <TableHead className="h-12 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Founder</TableHead>
                <TableHead className="h-12 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Stage & Vertical</TableHead>
                <TableHead className="h-12 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Joined</TableHead>
                <TableHead className="h-12 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Status</TableHead>
                <TableHead className="h-12 font-bold text-slate-500 uppercase text-[10px] tracking-widest text-right pr-8">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-64 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-8 w-8 animate-spin text-primary opacity-20" />
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Syncing Registry...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : allStartups.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-64 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <AlertCircle className="h-10 w-10 text-slate-200" />
                      <p className="text-slate-400 font-medium italic">No startups found in the repository.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                allStartups.map((s) => {
                  const founder = allUsers.find(u => u.id === s.ownerUid);
                  const createdAtDate = s.createdAt?.toDate ? s.createdAt.toDate() : new Date(s.createdAt);
                  const isFeatured = s.featured || false;
                  const status = s.status || 'active';
                  const identifier = s.slug || s.ownerUid;

                  return (
                    <TableRow key={s.id} className="group border-b border-slate-50 hover:bg-slate-50/30 transition-colors">
                      <TableCell className="pl-8 py-5">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{s.name}</span>
                            {isFeatured && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 opacity-60">
                             <MapPin className="h-3 w-3" />
                             <span className="text-[10px] font-bold uppercase tracking-tighter">{s.location || 'Remote'}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500 border border-slate-200 shadow-sm">
                            {founder?.fullName?.charAt(0) || '?'}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-700">{founder?.fullName || 'Unknown'}</span>
                            <span className="text-[9px] text-slate-400 font-medium">{founder?.email}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge variant="outline" className={cn(
                            "w-fit rounded-lg text-[9px] border-none font-bold uppercase px-2 py-0",
                            s.stage === 'Scaling' ? "bg-purple-50 text-purple-700" :
                            s.stage === 'Growth' ? "bg-blue-50 text-blue-700" :
                            "bg-slate-100 text-slate-600"
                          )}>
                            {s.stage}
                          </Badge>
                          <div className="flex items-center gap-1.5 opacity-60">
                             <Briefcase className="h-3 w-3" />
                             <span className="text-[10px] font-bold uppercase truncate max-w-[120px]">{s.industry}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-slate-500">
                          <Calendar className="h-3.5 w-3.5 opacity-50" />
                          <span className="text-xs font-medium">
                            {isNaN(createdAtDate.getTime()) ? 'N/A' : createdAtDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn(
                          "rounded-lg text-[10px] font-bold uppercase py-0.5 px-2 flex w-fit items-center gap-1",
                          status === 'active' ? "bg-green-50 border-green-200 text-green-700" : "bg-slate-100 border-slate-200 text-slate-400"
                        )}>
                          {status === 'active' ? <CheckCircle2 className="h-2.5 w-2.5" /> : <EyeOff className="h-2.5 w-2.5" />}
                          {status}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-8 text-right">
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="rounded-xl h-8 gap-1 font-bold text-[10px] uppercase border-slate-200"
                            onClick={() => handleToggleFeatured(s.id, isFeatured)}
                            disabled={isUpdating === s.id}
                          >
                            {isUpdating === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : (
                              isFeatured ? <><StarOff className="h-3 w-3 text-slate-400" /> Unfeature</> : <><Star className="h-3 w-3 text-amber-500" /> Feature</>
                            )}
                          </Button>

                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="rounded-xl h-8 gap-1 font-bold text-[10px] uppercase border-slate-200"
                            onClick={() => handleToggleStatus(s.id, status)}
                            disabled={isUpdating === s.id}
                          >
                            {isUpdating === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : (
                              status === 'active' ? <><EyeOff className="h-3 w-3" /> Hide</> : <><CheckCircle2 className="h-3 w-3" /> Activate</>
                            )}
                          </Button>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="rounded-xl">
                              <DropdownMenuLabel>Venture Actions</DropdownMenuLabel>
                              <DropdownMenuItem asChild>
                                <Link href={`/startups/${identifier}`} className="cursor-pointer flex items-center gap-2">
                                  <Eye className="h-4 w-4" /> View Public Listing
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                className="text-destructive focus:text-destructive flex items-center gap-2 cursor-pointer"
                                onClick={() => handleDeleteStartup(s.id)}
                              >
                                <Trash2 className="h-4 w-4" /> Delete Permanently
                              </DropdownMenuItem>
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
    </div>
  );
}
