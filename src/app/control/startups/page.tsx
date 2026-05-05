'use client';

import { useState, useEffect } from 'react';
import { useFirestore, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { 
  Rocket, 
  Loader2, 
  Eye, 
  MapPin, 
  Briefcase, 
  Calendar, 
  Star, 
  CheckCircle2,
  AlertCircle
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
import Link from 'next/link';
import { cn } from '@/lib/utils';

export default function StartupOversightPage() {
  const firestore = useFirestore();
  
  const [allStartups, setAllStartups] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!firestore) return;
    
    async function fetchData() {
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
    fetchData();
  }, [firestore]);

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
                        <Badge variant="outline" className="rounded-lg bg-green-50 text-[10px] border-green-200 text-green-700 font-bold uppercase py-0.5 px-2 flex w-fit items-center gap-1">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          {s.status || 'Active'}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-8 text-right">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="rounded-xl h-9 gap-2 hover:bg-primary hover:text-white transition-all font-bold text-xs shadow-none border-none"
                          asChild
                        >
                          <Link href={`/startups/${s.ownerUid}`}>
                            <Eye className="h-4 w-4" /> View listing
                          </Link>
                        </Button>
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
