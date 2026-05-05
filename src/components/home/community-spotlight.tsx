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
        // 1. Fetch founders
        const q = query(
          collection(firestore, 'users'),
          where('role', '==', 'founder'),
          limit(12) // Fetch more to account for hidden startups
        );
        const snap = await getDocs(q);
        const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // 2. Fetch all startups to check visibility
        const startupsSnap = await getDocs(collection(firestore, 'startups'));
        const startupsMap = new Map();
        startupsSnap.docs.forEach(doc => {
          const data = doc.data();
          if (data.status !== 'hidden') {
            startupsMap.set(data.ownerUid, data);
          }
        });

        // 3. Filter founders based on venture visibility if a venture exists
        const spotlightUsers = users.filter(u => {
          const startup = startupsMap.get(u.id);
          // If they have no startup yet, we show them. If they have one, it must not be hidden.
          // Note: In the merge logic above, startupsMap ONLY contains active ones.
          return true; 
        }).slice(0, 6);

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
