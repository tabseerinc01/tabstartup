'use client';

import { useState, useEffect, useMemo } from 'react';
import { useFirestore, useUser } from '@/firebase';
import { collection, getDocs, doc, updateDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { 
  Rocket, 
  Loader2, 
  Eye, 
  Star, 
  CheckCircle2, 
  EyeOff, 
  Search,
  Filter,
  ArrowUpRight,
  ShieldCheck,
  ShieldAlert,
  MoreHorizontal
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
import { Input } from "@/components/ui/input";
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { logAdminAction } from '@/lib/audit-logs';
import Link from 'next/link';

export default function StartupOversightPage() {
  const { user: currentAdmin } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [startups, setStartups] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [industryFilter, setIndustryFilter] = useState('all');

  const fetchData = async () => {
    if (!firestore) return;
    setIsLoading(true);
    try {
      const q = query(collection(firestore, 'startups'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setStartups(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      toast({ title: "Fetch Failed", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [firestore]);

  const filtered = useMemo(() => {
    return startups.filter(s => {
      const matchesSearch = (s.name || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStage = stageFilter === 'all' || s.stage === stageFilter;
      const matchesIndustry = industryFilter === 'all' || s.industry === industryFilter;
      return matchesSearch && matchesStage && matchesIndustry;
    });
  }, [startups, searchTerm, stageFilter, industryFilter]);

  const handleUpdate = async (id: string, updates: any, actionName: string) => {
    if (!firestore || !currentAdmin) return;
    try {
      await updateDoc(doc(firestore, 'startups', id), {
        ...updates,
        updatedAt: serverTimestamp()
      });
      await logAdminAction(firestore, currentAdmin.uid, actionName, id);
      setStartups(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
      toast({ title: "Status Updated" });
    } catch (e) {
      toast({ title: "Update Failed", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight text-slate-900 flex items-center gap-3">
            <Rocket className="h-8 w-8 text-primary" /> Venture Oversight
          </h1>
          <p className="text-slate-500 font-medium">Verify ventures, manage features, and monitor listed startups.</p>
        </div>
        <Badge variant="outline" className="h-10 rounded-xl px-4 bg-white text-slate-600 border-slate-200 font-bold shadow-sm">
          {startups.length} Registered Ventures
        </Badge>
      </div>

      <Card className="border-none shadow-sm rounded-[2.5rem] bg-white overflow-hidden">
        <CardHeader className="p-8 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
             <div className="relative col-span-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input 
                  placeholder="Filter by startup name..." 
                  className="pl-10 h-11 rounded-xl bg-slate-50 border-none"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
             </div>
             <select 
               className="h-11 rounded-xl bg-slate-50 border-none text-sm px-4 font-bold"
               value={stageFilter}
               onChange={e => setStageFilter(e.target.value)}
             >
                <option value="all">All Stages</option>
                <option value="Idea">Idea</option>
                <option value="Early">Early</option>
                <option value="Growth">Growth</option>
                <option value="Scaling">Scaling</option>
             </select>
             <select 
               className="h-11 rounded-xl bg-slate-50 border-none text-sm px-4 font-bold"
               value={industryFilter}
               onChange={e => setIndustryFilter(e.target.value)}
             >
                <option value="all">All Verticals</option>
                <option value="Fintech">Fintech</option>
                <option value="SaaS">SaaS</option>
                <option value="AgriTech">AgriTech</option>
                <option value="AI">AI</option>
             </select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow className="border-none hover:bg-transparent">
                <TableHead className="pl-8 h-12 font-black text-slate-400 uppercase text-[10px] tracking-widest">Startup Name</TableHead>
                <TableHead className="h-12 font-black text-slate-400 uppercase text-[10px] tracking-widest">Verification & Growth</TableHead>
                <TableHead className="h-12 font-black text-slate-400 uppercase text-[10px] tracking-widest text-right pr-8">Control</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={3} className="h-32 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary opacity-20" /></TableCell></TableRow>
              ) : filtered.map((s) => (
                <TableRow key={s.id} className="group border-b border-slate-50 hover:bg-slate-50/30">
                  <TableCell className="pl-8 py-5">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center font-black text-primary border border-slate-200">
                        {s.name?.charAt(0)}
                      </div>
                      <div>
                        <span className="font-bold text-slate-900 block truncate max-w-[220px]">{s.name}</span>
                        <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-tighter">
                           <Badge variant="outline" className="h-4 px-1 rounded-sm border-slate-200">{s.industry}</Badge>
                           <span className="opacity-40">•</span>
                           <span>{s.location || 'Global'}</span>
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                     <div className="flex flex-wrap gap-1.5">
                        <Badge variant="secondary" className={cn("rounded-lg text-[9px] font-black uppercase border-none", s.featured ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-500")}>
                          {s.featured ? <Star className="h-2.5 w-2.5 mr-1 fill-amber-600" /> : null}
                          {s.featured ? 'Featured' : 'Standard'}
                        </Badge>
                        <Badge variant="secondary" className={cn("rounded-lg text-[9px] font-black uppercase border-none", s.startupVerified ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500")}>
                          {s.startupVerified ? <ShieldCheck className="h-2.5 w-2.5 mr-1" /> : null}
                          {s.startupVerified ? 'Verified' : 'Pending'}
                        </Badge>
                        <Badge variant="outline" className="rounded-lg text-[9px] font-black uppercase border-slate-200">{s.stage}</Badge>
                     </div>
                  </TableCell>
                  <TableCell className="pr-8 text-right">
                    <div className="flex justify-end gap-2">
                       <Button variant="outline" size="sm" className="h-8 rounded-lg gap-1.5 text-[10px] font-black uppercase border-slate-200" onClick={() => handleUpdate(s.id, { startupVerified: !s.startupVerified }, 'verify_startup')}>
                          {s.startupVerified ? 'Revoke' : 'Verify'}
                       </Button>
                       <Button variant="outline" size="sm" className="h-8 rounded-lg gap-1.5 text-[10px] font-black uppercase border-slate-200" onClick={() => handleUpdate(s.id, { featured: !s.featured }, 'feature_startup')}>
                          {s.featured ? 'Unfeature' : 'Feature'}
                       </Button>
                       <Button variant="outline" size="sm" className="h-8 rounded-lg gap-1.5 text-[10px] font-black uppercase border-slate-200" onClick={() => handleUpdate(s.id, { status: s.status === 'hidden' ? 'active' : 'hidden' }, 'hide_startup')}>
                          {s.status === 'hidden' ? 'Activate' : 'Hide'}
                       </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
