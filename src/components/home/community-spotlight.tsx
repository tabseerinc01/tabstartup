'use client';

import { useState, useEffect } from 'react';
import { useFirestore } from '@/firebase';
import { collection, query, where, limit, getDocs } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Loader2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { mockFounders } from '@/lib/mock-data';

export function CommunitySpotlight() {
  const [founders, setFounders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const firestore = useFirestore();

  useEffect(() => {
    async function loadSpotlight() {
      if (!firestore) return;
      setIsLoading(true);
      try {
        // 1. Fetch using multi-role support
        const multiRoleQuery = query(
          collection(firestore, 'users'),
          where('roles', 'array-contains', 'founder'),
          limit(12)
        );
        
        // 2. Legacy check
        const legacyRoleQuery = query(
          collection(firestore, 'users'),
          where('role', '==', 'founder'),
          limit(12)
        );

        const [multiSnap, legacySnap] = await Promise.all([
          getDocs(multiRoleQuery),
          getDocs(legacyRoleQuery)
        ]);

        const userMap = new Map();
        multiSnap.docs.forEach(d => userMap.set(d.id, { id: d.id, ...d.data() }));
        legacySnap.docs.forEach(d => {
          if (!userMap.has(d.id)) userMap.set(d.id, { id: d.id, ...d.data() });
        });

        const users = Array.from(userMap.values());

        // 3. Fetch only ACTIVE startups to check visibility
        const startupsQ = query(
          collection(firestore, 'startups'),
          where('status', '==', 'active')
        );
        const startupsSnap = await getDocs(startupsQ);
        const activeStartupsMap = new Map();
        startupsSnap.docs.forEach(doc => {
          const data = doc.data();
          activeStartupsMap.set(data.ownerUid, data);
        });

        // 4. Filter and slice
        const spotlightUsers = users.slice(0, 6);

        setFounders(spotlightUsers.length > 0 ? spotlightUsers : mockFounders.slice(0, 6));
      } catch (error) {
        console.error("Error loading spotlight:", error);
        setFounders(mockFounders.slice(0, 6));
      } finally {
        setIsLoading(false);
      }
    }
    loadSpotlight();
  }, [firestore]);

  if (isLoading) {
    return (
      <div className="flex py-12 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {founders.map((founder) => (
        <Card key={founder.id} className="overflow-hidden hover:shadow-xl transition-all group rounded-2xl">
          <div className="relative h-48 w-full bg-muted">
            <Image 
              src={founder.imageUrl || `https://picsum.photos/seed/${founder.id}/400/400`} 
              alt={founder.fullName || founder.name} 
              fill 
              className="object-cover group-hover:scale-105 transition-transform duration-500" 
            />
          </div>
          <CardHeader>
            <div className="flex justify-between items-start mb-2">
              <CardTitle className="text-xl line-clamp-1">{founder.fullName || founder.name}</CardTitle>
              <Badge variant="secondary">{founder.stage}</Badge>
            </div>
            <p className="text-sm font-medium line-clamp-2 text-muted-foreground h-10">
              {founder.headline}
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-xs text-muted-foreground mb-4">
              <MapPin className="mr-1 h-3 w-3" />
              {founder.location}
            </div>
            <Button variant="ghost" size="sm" className="w-full mt-4 text-primary" asChild>
              <Link href={`/founders/${founder.id}`}>View Profile</Link>
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}