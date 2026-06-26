'use client';

import { useState, useEffect } from 'react';
import { useFirestore } from '@/firebase';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { History, Loader2, ShieldAlert, Clock, User, Target, Terminal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function AuditLogsPage() {
  const firestore = useFirestore();
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadLogs() {
      if (!firestore) return;
      setIsLoading(true);
      try {
        const q = query(collection(firestore, 'auditLogs'), orderBy('timestamp', 'desc'), limit(100));
        const snap = await getDocs(q);
        setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }
    loadLogs();
  }, [firestore]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight text-slate-900 flex items-center gap-3">
            <History className="h-8 w-8 text-primary" /> System Audit Logs
          </h1>
          <p className="text-slate-500 font-medium">Historical record of administrative actions and security events.</p>
        </div>
      </div>

      <Card className="border-none shadow-sm rounded-[2.5rem] bg-white overflow-hidden">
        <CardHeader className="p-8 pb-4">
           <div className="flex items-center gap-3">
              <div className="p-2 bg-destructive/10 rounded-lg text-destructive"><Terminal className="h-5 w-5" /></div>
              <div>
                 <CardTitle className="text-xl font-black">Audit Trail</CardTitle>
                 <CardDescription>Locked immutable records of internal operations.</CardDescription>
              </div>
           </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow className="border-none hover:bg-transparent">
                <TableHead className="pl-8 h-12 font-black text-slate-400 uppercase text-[10px] tracking-widest">Event Time</TableHead>
                <TableHead className="h-12 font-black text-slate-400 uppercase text-[10px] tracking-widest">Admin</TableHead>
                <TableHead className="h-12 font-black text-slate-400 uppercase text-[10px] tracking-widest">Action</TableHead>
                <TableHead className="h-12 font-black text-slate-400 uppercase text-[10px] tracking-widest text-right pr-8">Target Identity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="h-32 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary opacity-20" /></TableCell></TableRow>
              ) : logs.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="h-32 text-center text-slate-400">No logs available in the current index.</TableCell></TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id} className="group border-b border-slate-50 hover:bg-slate-50/30">
                    <TableCell className="pl-8 py-5">
                       <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                          <Clock className="h-3 w-3 opacity-40" />
                          {log.timestamp?.toDate ? format(log.timestamp.toDate(), 'MMM d, HH:mm:ss') : 'Just now'}
                       </div>
                    </TableCell>
                    <TableCell>
                       <div className="flex items-center gap-2">
                          <User className="h-3.5 w-3.5 text-primary" />
                          <span className="text-[10px] font-black text-slate-400 uppercase truncate max-w-[100px]">{log.adminUid?.slice(0, 8)}...</span>
                       </div>
                    </TableCell>
                    <TableCell>
                       <Badge variant="outline" className={cn(
                         "rounded-lg text-[9px] font-black uppercase border-none",
                         log.action?.includes('suspend') ? "bg-red-50 text-red-700" : 
                         log.action?.includes('verify') ? "bg-blue-50 text-blue-700" :
                         "bg-slate-100 text-slate-600"
                       )}>
                          {log.action?.replace('_', ' ')}
                       </Badge>
                    </TableCell>
                    <TableCell className="pr-8 text-right">
                       <div className="flex items-center justify-end gap-2">
                          <code className="text-[10px] font-mono text-slate-400">{log.targetId?.slice(0, 12)}...</code>
                          <Target className="h-3 w-3 text-slate-200" />
                       </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
