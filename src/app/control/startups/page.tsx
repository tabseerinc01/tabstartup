'use client';

import { useState, useEffect } from 'react';
import { useFirestore, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Rocket, Loader2, Eye } from 'lucide-react';
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
    <Card className="border-none shadow-sm rounded-[2.5rem] overflow-hidden bg-white">
      <CardHeader className="px-8 py-8 border-b border-slate-50 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-2xl font-bold flex items-center gap-3">
            <Rocket className="h-6 w-6 text-primary" /> Venture Oversight
          </CardTitle>
          <CardDescription>Monitor active startup listings and their progress.</CardDescription>
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
              <TableHead className="h-12 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Current Stage</TableHead>
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
                    <span className="font-bold text-slate-900">{s.name}</span>
                    <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-tighter">{s.industry}</p>
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
                    <Badge variant="outline" className="rounded-lg bg-slate-50 text-[10px] border-slate-200 font-bold uppercase">
                      {s.stage}
                    </Badge>
                  </TableCell>
                  <TableCell className="pr-8 text-right">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="rounded-xl h-8 gap-2 hover:bg-primary/5 hover:text-primary"
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
  );
}
