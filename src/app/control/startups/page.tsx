'use client';

import { useState, useEffect } from 'react';
import { useFirestore, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Rocket, Loader2, Eye, MapPin, Briefcase } from 'lucide-react';
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

export default function StartupOversightPage() {
  const firestore = useFirestore();
  
  const [allStartups, setAllStartups] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!firestore) return;
    
    async function fetchData() {
      try {
        const [sSnap, uSnap] = await Promise.all([
          getDocs(collection(firestore, 'startups')),
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
      <div className="space-y-1">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3">
          <Rocket className="h-8 w-8 text-primary" /> Venture Oversight
        </h1>
        <p className="text-slate-500 font-medium">Monitor active startup listings, stages, and founder associations.</p>
      </div>

      <Card className="border-none shadow-sm rounded-[2.5rem] overflow-hidden bg-white">
        <CardHeader className="px-8 py-8 border-b border-slate-50 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl">Startup Registry</CardTitle>
            <CardDescription>A comprehensive view of all ventures currently listed on the platform.</CardDescription>
          </div>
          <Badge variant="outline" className="h-8 rounded-lg px-3 bg-slate-50 text-slate-600 border-slate-200">
            {allStartups.length} Published Ventures
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow className="border-none hover:bg-transparent">
                <TableHead className="pl-8 h-12 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Startup Name</TableHead>
                <TableHead className="h-12 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Founder</TableHead>
                <TableHead className="h-12 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Stage & Industry</TableHead>
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
              ) : allStartups.map((s) => {
                const founder = allUsers.find(u => u.id === s.ownerUid);
                return (
                  <TableRow key={s.id} className="group border-b border-slate-50 hover:bg-slate-50/30 transition-colors">
                    <TableCell className="pl-8 py-5">
                      <span className="font-bold text-slate-900 block">{s.name}</span>
                      <div className="flex items-center gap-2 mt-0.5 opacity-60">
                         <MapPin className="h-3 w-3" />
                         <span className="text-[10px] font-bold uppercase tracking-tighter">{s.location || 'Remote'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                          {founder?.fullName?.charAt(0) || '?'}
                        </div>
                        <span className="text-sm font-medium text-slate-600">{founder?.fullName || 'Unknown Founder'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline" className="w-fit rounded-lg bg-slate-50 text-[9px] border-slate-200 font-bold uppercase">
                          {s.stage}
                        </Badge>
                        <div className="flex items-center gap-1.5 opacity-60">
                           <Briefcase className="h-3 w-3" />
                           <span className="text-[10px] font-bold uppercase">{s.industry}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="pr-8 text-right">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="rounded-xl h-8 gap-2 hover:bg-primary/5 hover:text-primary font-bold text-xs"
                        asChild
                      >
                        <Link href={`/startups/${s.ownerUid}`}>
                          <Eye className="h-3.5 w-3.5" /> View Listing
                        </Link>
                      </Button>
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
