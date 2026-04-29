'use client';

import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, limit } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Rocket, Loader2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { mockFounders } from '@/lib/mock-data';

export function CommunitySpotlight() {
  const firestore = useFirestore();

  const foundersQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(
      collection(firestore, 'users'),
      where('role', '==', 'founder'),
      limit(6)
    );
  }, [firestore]);

  const { data: dbFounders, isLoading } = useCollection(foundersQuery);

  // Fallback to mock data if Firestore returns nothing
  const foundersList = (dbFounders && dbFounders.length > 0) ? dbFounders : mockFounders.slice(0, 6);

  if (isLoading) {
    return (
      <div className="flex py-12 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {foundersList.map((founder) => (
        <Card key={founder.id} className="overflow-hidden hover:shadow-xl transition-all group rounded-2xl">
          <div className="relative h-48 w-full bg-muted">
            <Image 
              src={founder.imageUrl || `https://picsum.photos/seed/${founder.id}/400/400`} 
              alt={founder.fullName || founder.name} 
              fill 
              className="object-cover group-hover:scale-105 transition-transform duration-500" 
              data-ai-hint="founder portrait"
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
            <div className="flex flex-wrap gap-1">
              {founder.skills?.slice(0, 3).map((skill: string) => (
                <Badge key={skill} variant="outline" className="text-[10px]">{skill}</Badge>
              ))}
            </div>
            <Button variant="ghost" size="sm" className="w-full mt-4 text-primary" asChild>
              <Link href="/founders">View Profile</Link>
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
