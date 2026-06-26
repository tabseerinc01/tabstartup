'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useFirestore } from '@/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  limit, 
  orderBy,
  startAt,
  endAt
} from 'firebase/firestore';
import { 
  Search, 
  Loader2, 
  Rocket, 
  User, 
  ShieldCheck, 
  GraduationCap, 
  MessageSquare, 
  ArrowRight,
  X
} from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [queryStr, setQueryStr] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<{
    startups: any[];
    founders: any[];
    investors: any[];
    mentors: any[];
    posts: any[];
  }>({
    startups: [],
    founders: [],
    investors: [],
    mentors: [],
    posts: []
  });

  const firestore = useFirestore();
  const router = useRouter();

  // Keyboard shortcut to open search (Cmd+K or Ctrl+K)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Debounced search logic
  useEffect(() => {
    if (!queryStr || queryStr.length < 2) {
      setResults({ startups: [], founders: [], investors: [], mentors: [], posts: [] });
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const term = queryStr.toLowerCase();
        
        // Parallel queries for different collections
        // Note: Firestore doesn't support full-text search directly well, 
        // so we use simple prefix matching or field equality where possible.
        // For MVP, we fetch a small subset and filter.
        
        const [sSnap, uSnap, pSnap] = await Promise.all([
          getDocs(query(collection(firestore, 'startups'), limit(20))),
          getDocs(query(collection(firestore, 'users'), limit(50))),
          getDocs(query(collection(firestore, 'communityPosts'), where('status', '==', 'active'), limit(20)))
        ]);

        const startups = sSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter((s: any) => s.name?.toLowerCase().includes(term) || s.industry?.toLowerCase().includes(term))
          .slice(0, 5);

        const users = uSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        const founders = users
          .filter((u: any) => (u.roles?.includes('founder') || u.role === 'founder') && u.fullName?.toLowerCase().includes(term))
          .slice(0, 5);
        
        const investors = users
          .filter((u: any) => (u.roles?.includes('investor') || u.role === 'investor') && u.fullName?.toLowerCase().includes(term))
          .slice(0, 5);
          
        const mentors = users
          .filter((u: any) => (u.roles?.includes('mentor') || u.role === 'mentor') && u.fullName?.toLowerCase().includes(term))
          .slice(0, 5);

        const posts = pSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter((p: any) => p.content?.toLowerCase().includes(term))
          .slice(0, 5);

        setResults({ startups, founders, investors, mentors, posts });
      } catch (error) {
        console.error("Global search error:", error);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [queryStr, firestore]);

  const onSelect = (path: string) => {
    setOpen(false);
    router.push(path);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 h-10 w-full max-w-sm rounded-xl bg-slate-50 border border-slate-100 hover:border-primary/20 text-slate-400 text-sm transition-all group"
      >
        <Search className="h-4 w-4 group-hover:text-primary transition-colors" />
        <span className="flex-1 text-left">Search anything...</span>
        <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-white px-1.5 font-mono text-[10px] font-medium text-slate-400 opacity-100">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput 
          placeholder="Search startups, founders, capital partners..." 
          value={queryStr}
          onValueChange={setQueryStr}
        />
        <CommandList className="max-h-[70vh]">
          {isLoading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-primary opacity-20" />
            </div>
          )}
          
          <CommandEmpty>No results found for "{queryStr}".</CommandEmpty>

          {results.startups.length > 0 && (
            <CommandGroup heading={`Startups (${results.startups.length})`}>
              {results.startups.map((s) => (
                <CommandItem key={s.id} onSelect={() => onSelect(`/startups/${s.slug || s.id}`)}>
                  <Rocket className="mr-2 h-4 w-4 text-primary" />
                  <div className="flex flex-col">
                    <span className="font-bold">{s.name}</span>
                    <span className="text-[10px] text-slate-400 uppercase">{s.industry} • {s.stage}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {results.founders.length > 0 && (
            <CommandGroup heading={`Founders (${results.founders.length})`}>
              {results.founders.map((f) => (
                <CommandItem key={f.id} onSelect={() => onSelect(`/founders/${f.id}`)}>
                  <User className="mr-2 h-4 w-4 text-primary" />
                  <div className="flex flex-col">
                    <span className="font-bold">{f.fullName}</span>
                    <span className="text-[10px] text-slate-400 uppercase">{f.headline || 'Ecosystem Founder'}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {results.investors.length > 0 && (
            <CommandGroup heading={`Investors (${results.investors.length})`}>
              {results.investors.map((i) => (
                <CommandItem key={i.id} onSelect={() => onSelect(`/investors/${i.id}`)}>
                  <ShieldCheck className="mr-2 h-4 w-4 text-primary" />
                  <div className="flex flex-col">
                    <span className="font-bold">{i.fullName}</span>
                    <span className="text-[10px] text-slate-400 uppercase">Capital Partner</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {results.mentors.length > 0 && (
            <CommandGroup heading={`Mentors (${results.mentors.length})`}>
              {results.mentors.map((m) => (
                <CommandItem key={m.id} onSelect={() => onSelect(`/mentors/${m.id}`)}>
                  <GraduationCap className="mr-2 h-4 w-4 text-primary" />
                  <div className="flex flex-col">
                    <span className="font-bold">{m.fullName}</span>
                    <span className="text-[10px] text-slate-400 uppercase">Industry Expert</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {results.posts.length > 0 && (
            <CommandGroup heading={`Community (${results.posts.length})`}>
              {results.posts.map((p) => (
                <CommandItem key={p.id} onSelect={() => onSelect(`/community`)}>
                  <MessageSquare className="mr-2 h-4 w-4 text-primary" />
                  <div className="flex flex-col">
                    <span className="font-bold line-clamp-1">{p.content}</span>
                    <span className="text-[10px] text-slate-400 uppercase">Post by {p.authorName}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          <CommandSeparator />
          
          <CommandGroup heading="Directories">
            <CommandItem onSelect={() => onSelect('/startups')}>
              <Rocket className="mr-2 h-4 w-4" /> Browse All Startups
            </CommandItem>
            <CommandItem onSelect={() => onSelect('/founders')}>
              <User className="mr-2 h-4 w-4" /> Browse Founders
            </CommandItem>
            <CommandItem onSelect={() => onSelect('/investors')}>
              <ShieldCheck className="mr-2 h-4 w-4" /> Investor Network
            </CommandItem>
            <CommandItem onSelect={() => onSelect('/mentors')}>
              <GraduationCap className="mr-2 h-4 w-4" /> Mentor Directory
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
