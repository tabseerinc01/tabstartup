
'use client';

import { useState, useEffect } from 'react';
import { useFirestore, useUser, errorEmitter, FirestorePermissionError } from '@/firebase';
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  addDoc, 
  serverTimestamp,
  doc,
  getDoc,
  where
} from 'firebase/firestore';
import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';
import { Card, CardContent, CardHeader, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { 
  MessageSquare, 
  Send, 
  Loader2, 
  Users, 
  Clock, 
  Heart, 
  Share2,
  Rocket,
  ShieldCheck,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

export default function CommunityFeedPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [posts, setPosts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPosting, setIsSubmitting] = useState(false);
  const [newPostContent, setNewPostContent] = useState('');
  const [userProfile, setUserProfile] = useState<any>(null);
  const [startupProfile, setStartupProfile] = useState<any>(null);

  // Fetch posts in real-time from communityPosts collection
  useEffect(() => {
    if (!firestore) return;

    const postsQ = query(
      collection(firestore, 'communityPosts'),
      where('status', '==', 'active'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(postsQ, (snapshot) => {
      const list = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
        createdAtDate: d.data().createdAt?.toDate ? d.data().createdAt.toDate() : new Date()
      }));
      setPosts(list);
      setIsLoading(false);
    }, (error) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: 'communityPosts',
        operation: 'list',
      }));
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [firestore]);

  // Fetch logged-in user profile and their startup
  useEffect(() => {
    async function loadProfiles() {
      if (!firestore || !user?.uid) return;
      try {
        const [userSnap, startupSnap] = await Promise.all([
          getDoc(doc(firestore, 'users', user.uid)),
          getDoc(doc(firestore, 'startups', user.uid))
        ]);
        
        if (userSnap.exists()) setUserProfile(userSnap.data());
        if (startupSnap.exists()) setStartupProfile(startupSnap.data());
      } catch (e) {
        console.warn("Could not load profiles for feed:", e);
      }
    }
    loadProfiles();
  }, [firestore, user]);

  const handleCreatePost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !user || !newPostContent.trim() || isPosting) return;

    setIsSubmitting(true);
    const postData = {
      authorUid: user.uid,
      authorName: userProfile?.fullName || user.displayName || user.email?.split('@')[0] || "Member",
      authorImage: userProfile?.imageUrl || `https://picsum.photos/seed/${user.uid}/100/100`,
      authorType: userProfile?.role || "user",
      content: newPostContent.trim(),
      tags: [],
      likesCount: 0,
      commentsCount: 0,
      createdAt: serverTimestamp(),
      status: "active",
      startupName: startupProfile?.name || null,
      startupId: startupProfile ? user.uid : null
    };

    addDoc(collection(firestore, 'communityPosts'), postData)
      .then(() => {
        setNewPostContent('');
        toast({ title: "Update Shared", description: "Your post is now visible in the community feed." });
      })
      .catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: 'communityPosts',
          operation: 'create',
          requestResourceData: postData
        }));
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  };

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-12 md:py-20">
        <div className="max-w-3xl mx-auto space-y-12">
          
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-2 mb-2">
               <div className="h-1 w-12 bg-primary rounded-full" />
               <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Community Hub</span>
               <div className="h-1 w-12 bg-primary rounded-full" />
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-slate-900 leading-tight">
              Startup <span className="text-primary">Community Feed</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto font-medium leading-relaxed">
              Share updates, ideas, questions, and startup progress with the TabStartup ecosystem.
            </p>
          </div>

          {user ? (
            <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-background">
              <form onSubmit={handleCreatePost}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 border-2 border-primary/10">
                      <AvatarImage src={userProfile?.imageUrl} />
                      <AvatarFallback className="font-bold">{userProfile?.fullName?.charAt(0) || user.email?.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{userProfile?.fullName || "Your Account"}</p>
                      <p className="text-[10px] font-bold text-primary uppercase tracking-widest">{userProfile?.role || 'Member'}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-2">
                  <Textarea 
                    placeholder="What's happening in your startup journey?" 
                    className="min-h-[120px] rounded-2xl border-slate-100 bg-slate-50 focus-visible:ring-primary/20 text-lg resize-none p-4"
                    value={newPostContent}
                    onChange={(e) => setNewPostContent(e.target.value)}
                  />
                </CardContent>
                <CardFooter className="flex justify-between items-center bg-slate-50/50 py-4 border-t border-slate-50">
                   <div className="flex items-center gap-2 text-slate-400">
                      <Button type="button" variant="ghost" size="sm" className="rounded-full gap-2 text-xs font-bold hover:bg-slate-100">
                        <Rocket className="h-4 w-4" /> Share Milestones
                      </Button>
                   </div>
                   <Button 
                    type="submit" 
                    className="rounded-full px-8 font-bold shadow-lg shadow-primary/20 gap-2 h-11"
                    disabled={isPosting || !newPostContent.trim()}
                   >
                     {isPosting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                     Post Update
                   </Button>
                </CardFooter>
              </form>
            </Card>
          ) : (
            <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-slate-900 text-white p-8 text-center relative">
               <div className="space-y-6 relative z-10">
                 <div className="p-4 bg-white/10 rounded-full w-fit mx-auto">
                   <Users className="h-8 w-8 text-primary" />
                 </div>
                 <div className="space-y-2">
                   <h3 className="text-2xl font-black">Join the conversation</h3>
                   <p className="text-slate-400 font-medium">Log in to share updates and connect with other founders and investors.</p>
                 </div>
                 <div className="flex flex-wrap justify-center gap-4">
                   <Button className="rounded-full px-8 h-12 font-bold" asChild>
                     <Link href="/login">Log In</Link>
                   </Button>
                   <Button variant="outline" className="rounded-full px-8 h-12 font-bold border-slate-700 hover:bg-slate-800" asChild>
                     <Link href="/signup">Sign Up</Link>
                   </Button>
                 </div>
               </div>
               <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -mr-32 -mt-32" />
            </Card>
          )}

          <div className="space-y-8">
            {isLoading ? (
              <div className="flex py-24 justify-center">
                <div className="flex flex-col items-center gap-4">
                  <Loader2 className="h-12 w-12 animate-spin text-primary opacity-20" />
                  <p className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Syncing Feed...</p>
                </div>
              </div>
            ) : posts.length === 0 ? (
              <Card className="border-2 border-dashed rounded-[3rem] bg-background/50 py-24 text-center border-slate-200">
                <CardContent className="space-y-6">
                  <div className="p-6 bg-muted/50 rounded-full w-fit mx-auto">
                    <MessageSquare className="h-12 w-12 text-slate-300" />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-slate-900">The feed is quiet today</p>
                    <p className="text-slate-500 font-medium">Be the first to share an update with the TabStartup community!</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              posts.map((post) => (
                <Card key={post.id} className="group overflow-hidden rounded-[2.5rem] border-none shadow-lg hover:shadow-2xl transition-all duration-500 bg-background">
                  <CardContent className="p-0">
                    <div className="p-8 space-y-6">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                          <Link href={post.authorType === 'investor' ? `/investors/${post.authorUid}` : `/founders/${post.authorUid}`}>
                            <Avatar className="h-14 w-14 border-4 border-slate-50 group-hover:border-primary/10 transition-colors shadow-sm">
                              <AvatarImage src={post.authorImage} />
                              <AvatarFallback className="font-black text-xl">{post.authorName.charAt(0)}</AvatarFallback>
                            </Avatar>
                          </Link>
                          <div>
                            <div className="flex items-center gap-2">
                              <Link href={post.authorType === 'investor' ? `/investors/${post.authorUid}` : `/founders/${post.authorUid}`} className="text-xl font-black text-slate-900 hover:text-primary transition-colors">
                                {post.authorName}
                              </Link>
                              {post.authorType === 'admin' || post.authorType === 'super_admin' ? (
                                <ShieldCheck className="h-4 w-4 text-primary fill-primary/10" />
                              ) : null}
                            </div>
                            <div className="flex items-center gap-3">
                              <Badge variant="secondary" className="bg-primary/5 text-primary border-none rounded-md px-2 h-5 font-bold uppercase text-[9px] tracking-widest">
                                {post.authorType}
                              </Badge>
                              {post.startupName && (
                                <Badge variant="outline" className="border-primary/20 text-primary h-5 text-[9px] font-bold">
                                  {post.startupName}
                                </Badge>
                              )}
                              <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                                <Clock className="h-3 w-3" />
                                {formatDistanceToNow(post.createdAtDate, { addSuffix: true })}
                              </div>
                            </div>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="rounded-full hover:bg-slate-50 text-slate-300">
                          <Share2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="prose prose-lg max-w-none">
                        <p className="text-slate-700 leading-relaxed font-medium whitespace-pre-wrap text-lg">
                          {post.content}
                        </p>
                      </div>

                      <div className="pt-6 border-t border-slate-50 flex items-center justify-between">
                         <div className="flex items-center gap-4">
                            <Button variant="ghost" size="sm" className="rounded-full gap-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 px-4">
                               <Heart className={`h-4 w-4 ${post.likesCount > 0 ? 'fill-rose-600 text-rose-600' : ''}`} />
                               <span className="text-xs font-bold uppercase tracking-widest">
                                 {post.likesCount > 0 ? post.likesCount : ''} Appreciate
                               </span>
                            </Button>
                            <Button variant="ghost" size="sm" className="rounded-full gap-2 text-slate-400 hover:text-primary hover:bg-primary/5 px-4">
                               <MessageSquare className="h-4 w-4" />
                               <span className="text-xs font-bold uppercase tracking-widest">
                                 {post.commentsCount > 0 ? post.commentsCount : ''} Discuss
                               </span>
                            </Button>
                         </div>
                         <Link 
                          href={post.authorType === 'investor' ? `/investors/${post.authorUid}` : `/founders/${post.authorUid}`}
                          className="text-[10px] font-black text-primary uppercase tracking-[0.2em] opacity-0 group-hover:opacity-100 transition-opacity"
                         >
                            View Profile
                         </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          <section className="bg-slate-900 rounded-[3rem] p-12 text-center space-y-8 shadow-2xl relative overflow-hidden">
            <div className="space-y-4 relative z-10">
              <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight">Support local founders</h2>
              <p className="text-slate-400 max-w-2xl mx-auto text-lg font-medium leading-relaxed">
                Connect with the builders and capital partners shaping the future of Bangladesh.
              </p>
            </div>
            
            <div className="pt-4 flex flex-wrap justify-center gap-4 relative z-10">
              <Button size="lg" className="rounded-full px-10 h-14 text-base font-bold bg-primary text-white hover:bg-primary/90 shadow-xl shadow-primary/20" asChild>
                <Link href="/signup">Join the Ecosystem</Link>
              </Button>
              <Button size="lg" variant="outline" className="rounded-full px-10 h-14 text-base font-bold border-slate-700 text-white hover:bg-slate-800" asChild>
                <Link href="/founders">Explore Startups</Link>
              </Button>
            </div>
            <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-accent to-primary opacity-50" />
          </section>

        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
