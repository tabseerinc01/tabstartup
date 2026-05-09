'use client';

import { useState, useEffect } from 'react';
import { useFirestore, useUser, errorEmitter, FirestorePermissionError, useCollection, useMemoFirebase } from '@/firebase';
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  addDoc, 
  serverTimestamp,
  doc,
  getDoc,
  where,
  increment,
  setDoc,
  updateDoc,
  deleteDoc
} from 'firebase/firestore';
import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';
import { Card, CardContent, CardHeader, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
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
  Hash,
  CornerDownRight,
  MoreVertical,
  EyeOff,
  Trash2,
  ShieldAlert,
  Eye
} from 'lucide-react';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

export default function CommunityFeedPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [isPosting, setIsPosting] = useState(false);
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostTags, setNewPostTags] = useState('');
  const [userProfile, setUserProfile] = useState<any>(null);
  const [startupProfile, setStartupProfile] = useState<any>(null);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());

  // Use the simplest possible collection query to ensure permission compatibility
  const postsQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return collection(firestore, 'communityPosts');
  }, [firestore, user?.uid]);
  
  const { data: rawPosts, isLoading: isPostsLoading } = useCollection(postsQuery);

  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'super_admin';

  // Filter and sort posts client-side
  // Admins see everything (including hidden) so they can unhide, 
  // users only see active.
  const posts = (rawPosts || [])
    .filter(p => isAdmin || p.status === 'active')
    .sort((a, b) => {
      const timeA = a.createdAt?.toMillis?.() || 0;
      const timeB = b.createdAt?.toMillis?.() || 0;
      return timeB - timeA;
    })
    .slice(0, 50);

  // Real-time likes listener for the current user
  const userLikesQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, 'communityPostLikes'),
      where('userUid', '==', user.uid)
    );
  }, [firestore, user?.uid]);
  const { data: likesData } = useCollection(userLikesQuery);
  const userLikes = new Set(likesData?.map(l => l.postId) || []);

  // Load user-specific metadata for post creation context
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
        console.warn("Could not load profiles for feed context:", e);
      }
    }
    loadProfiles();
  }, [firestore, user]);

  const handleCreatePost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !user || !newPostContent.trim() || isPosting) return;

    setIsPosting(true);
    
    const tags = newPostTags
      .split(',')
      .map(tag => tag.trim().replace(/^#/, ''))
      .filter(tag => tag.length > 0);

    const postData = {
      authorUid: user.uid,
      authorName: userProfile?.fullName || user.displayName || user.email?.split('@')[0] || "Member",
      authorImage: userProfile?.imageUrl || `https://picsum.photos/seed/${user.uid}/100/100`,
      authorType: userProfile?.role || "user",
      content: newPostContent.trim(),
      tags: tags,
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
        setNewPostTags('');
        toast({ title: "Update Shared", description: "Your post is now live in the community feed." });
      })
      .catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: 'communityPosts',
          operation: 'create',
          requestResourceData: postData
        }));
      })
      .finally(() => {
        setIsPosting(false);
      });
  };

  const handleLikePost = (postId: string) => {
    if (!firestore || !user) {
      toast({ title: "Login Required", description: "Please log in to appreciate posts." });
      return;
    }

    if (userLikes.has(postId)) return;

    const likeId = `${postId}_${user.uid}`;
    const likeData = {
      postId,
      userUid: user.uid,
      createdAt: serverTimestamp()
    };

    setDoc(doc(firestore, 'communityPostLikes', likeId), likeData)
      .then(() => {
        updateDoc(doc(firestore, 'communityPosts', postId), {
          likesCount: increment(1)
        });
      })
      .catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: `communityPostLikes/${likeId}`,
          operation: 'write',
          requestResourceData: likeData
        }));
      });
  };

  const toggleComments = (postId: string) => {
    const newExpanded = new Set(expandedComments);
    if (newExpanded.has(postId)) {
      newExpanded.delete(postId);
    } else {
      newExpanded.add(postId);
    }
    setExpandedComments(newExpanded);
  };

  // Moderation Handlers
  const handleToggleHide = (postId: string, currentStatus: string) => {
    if (!firestore || !isAdmin) return;
    const newStatus = currentStatus === 'hidden' ? 'active' : 'hidden';
    
    updateDoc(doc(firestore, 'communityPosts', postId), {
      status: newStatus,
      updatedAt: serverTimestamp()
    }).then(() => {
      toast({ 
        title: newStatus === 'hidden' ? "Post Hidden" : "Post Activated", 
        description: `This post is now ${newStatus}.` 
      });
    }).catch(error => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: `communityPosts/${postId}`,
        operation: 'update',
        requestResourceData: { status: newStatus }
      }));
    });
  };

  const handleDeletePost = (postId: string) => {
    if (!firestore || !isAdmin) return;
    if (!confirm("Are you sure you want to permanently delete this post?")) return;

    deleteDoc(doc(firestore, 'communityPosts', postId)).then(() => {
      toast({ title: "Post Deleted", description: "The content has been removed from the platform." });
    }).catch(error => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: `communityPosts/${postId}`,
        operation: 'delete',
      }));
    });
  };

  if (isUserLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-muted/20">
        <PublicHeader />
        <main className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary opacity-20" />
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Authenticating Session...</p>
          </div>
        </main>
        <PublicFooter />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-12 md:py-20">
        <div className="max-w-3xl mx-auto space-y-12">
          
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-2 mb-2">
               <div className="h-1 w-12 bg-primary rounded-full" />
               <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Ecosystem Social</span>
               <div className="h-1 w-12 bg-primary rounded-full" />
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-slate-900 leading-tight">
              Startup <span className="text-primary">Community Feed</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto font-medium leading-relaxed">
              Real-time updates, advice, and insights from the builders and capital partners in the TabStartup network.
            </p>
          </div>

          {user ? (
            <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-background ring-1 ring-slate-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
                <CardContent className="pt-2 space-y-4">
                  <Textarea 
                    placeholder="Share your startup journey, ask questions, or post updates..." 
                    className="min-h-[140px] rounded-2xl border-slate-100 bg-slate-50 focus-visible:ring-primary/20 text-lg resize-none p-4"
                    value={newPostContent}
                    onChange={(e) => setNewPostContent(e.target.value)}
                    required
                  />
                  <div className="relative group">
                    <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors" />
                    <Input 
                      placeholder="Add tags (e.g. fundraising, advice, milestone) separated by commas"
                      className="pl-9 rounded-xl border-slate-100 bg-slate-50/50 focus-visible:ring-primary/20 text-sm h-11"
                      value={newPostTags}
                      onChange={(e) => setNewPostTags(e.target.value)}
                    />
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between items-center bg-slate-50/50 py-4 border-t border-slate-50">
                   <div className="hidden sm:flex items-center gap-2 text-slate-400">
                      <Button type="button" variant="ghost" size="sm" className="rounded-full gap-2 text-xs font-bold hover:bg-slate-100">
                        <Rocket className="h-4 w-4" /> Milestone
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="rounded-full gap-2 text-xs font-bold hover:bg-slate-100">
                        <Users className="h-4 w-4" /> Question
                      </Button>
                   </div>
                   <Button 
                    type="submit" 
                    className="w-full sm:w-auto rounded-full px-8 font-bold shadow-lg shadow-primary/20 gap-2 h-11"
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
            {isPostsLoading ? (
              <div className="flex py-24 justify-center">
                <div className="flex flex-col items-center gap-4">
                  <Loader2 className="h-12 w-12 animate-spin text-primary opacity-20" />
                  <p className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Syncing Community Feed...</p>
                </div>
              </div>
            ) : !posts || posts.length === 0 ? (
              <Card className="border-2 border-dashed rounded-[3rem] bg-background/50 py-24 text-center border-slate-200">
                <CardContent className="space-y-6">
                  <div className="p-6 bg-muted/50 rounded-full w-fit mx-auto">
                    <MessageSquare className="h-12 w-12 text-slate-300" />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-slate-900">
                      {user ? "The feed is quiet today" : "Log in to see updates"}
                    </p>
                    <p className="text-slate-500 font-medium">
                      {user ? "Be the first to share an update with the TabStartup community!" : "Ecosystem updates are only visible to logged-in members."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              posts.map((post) => (
                <PostCard 
                  key={post.id} 
                  post={post} 
                  isLiked={userLikes.has(post.id)} 
                  onLike={() => handleLikePost(post.id)}
                  isExpanded={expandedComments.has(post.id)}
                  onToggleComments={() => toggleComments(post.id)}
                  user={user}
                  userProfile={userProfile}
                  isAdmin={isAdmin}
                  onToggleHide={() => handleToggleHide(post.id, post.status)}
                  onDelete={() => handleDeletePost(post.id)}
                />
              ))
            )}
          </div>

          <section className="bg-primary rounded-[3rem] p-12 text-center space-y-8 shadow-2xl shadow-primary/20 relative overflow-hidden">
            <div className="space-y-4 relative z-10">
              <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight">Support local founders</h2>
              <p className="text-white/80 max-w-2xl mx-auto text-lg font-medium leading-relaxed">
                Connect with the builders and capital partners shaping the future of the emerging ecosystem.
              </p>
            </div>
            
            <div className="pt-4 flex flex-wrap justify-center gap-4 relative z-10">
              <Button size="lg" variant="secondary" className="rounded-full px-10 h-14 text-base font-bold shadow-xl" asChild>
                <Link href="/signup">Join the Ecosystem</Link>
              </Button>
              <Button size="lg" variant="outline" className="rounded-full px-10 h-14 text-base font-bold border-white/20 text-white hover:bg-white/10" asChild>
                <Link href="/founders">Explore Startups</Link>
              </Button>
            </div>
          </section>

        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

function PostCard({ 
  post, 
  isLiked, 
  onLike, 
  isExpanded, 
  onToggleComments, 
  user, 
  userProfile, 
  isAdmin,
  onToggleHide,
  onDelete
}: any) {
  const createdAtDate = post.createdAt?.toDate ? post.createdAt.toDate() : new Date();
  const profileLink = post.authorType === 'investor' ? `/investors/${post.authorUid}` : `/founders/${post.authorUid}`;

  return (
    <Card className={`group overflow-hidden rounded-[2.5rem] border-none shadow-lg hover:shadow-2xl transition-all duration-500 bg-background ring-1 ring-slate-50 animate-in fade-in duration-700 ${post.status === 'hidden' ? 'opacity-60 grayscale' : ''}`}>
      <CardContent className="p-0">
        <div className="p-8 space-y-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <Link href={profileLink}>
                <Avatar className="h-14 w-14 border-4 border-slate-50 group-hover:border-primary/10 transition-colors shadow-sm">
                  <AvatarImage src={post.authorImage} />
                  <AvatarFallback className="font-black text-xl">{post.authorName.charAt(0)}</AvatarFallback>
                </Avatar>
              </Link>
              <div>
                <div className="flex items-center gap-2">
                  <Link href={profileLink} className="text-xl font-black text-slate-900 hover:text-primary transition-colors">
                    {post.authorName}
                  </Link>
                  {(post.authorType === 'admin' || post.authorType === 'super_admin') && (
                    <ShieldCheck className="h-4 w-4 text-primary fill-primary/10" />
                  )}
                  {post.status === 'hidden' && (
                    <Badge variant="destructive" className="rounded-lg h-5 px-2 text-[8px] font-black uppercase tracking-widest">Hidden</Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <Badge variant="secondary" className="bg-primary/5 text-primary border-none rounded-md px-2 h-5 font-bold uppercase text-[9px] tracking-widest">
                    {post.authorType}
                  </Badge>
                  {post.startupName && (
                    <Badge variant="outline" className="border-primary/20 text-primary h-5 text-[9px] font-bold flex items-center gap-1">
                      <Rocket className="h-2 w-2" /> {post.startupName}
                    </Badge>
                  )}
                  <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-tight ml-1">
                    <Clock className="h-3 w-3" />
                    {formatDistanceToNow(createdAtDate, { addSuffix: true })}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              {isAdmin && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full hover:bg-slate-50 text-slate-400">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-2xl w-48">
                    <DropdownMenuLabel className="flex items-center gap-2">
                      <ShieldAlert className="h-3 w-3 text-primary" /> Moderation
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onToggleHide} className="gap-2 cursor-pointer rounded-lg m-1">
                      {post.status === 'hidden' ? <><Eye className="h-4 w-4" /> Unhide Post</> : <><EyeOff className="h-4 w-4" /> Hide Post</>}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onDelete} className="gap-2 cursor-pointer text-destructive focus:text-destructive rounded-lg m-1">
                      <Trash2 className="h-4 w-4" /> Delete Post
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button variant="ghost" size="icon" className="rounded-full hover:bg-slate-50 text-slate-300">
                <Share2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="prose prose-lg max-w-none">
            <p className="text-slate-700 leading-relaxed font-medium whitespace-pre-wrap text-lg">
              {post.content}
            </p>
          </div>

          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {post.tags.map((tag: string) => (
                <Badge key={tag} variant="outline" className="rounded-lg text-[10px] border-slate-100 bg-slate-50 text-slate-400 font-bold px-3 py-0.5">
                  #{tag}
                </Badge>
              ))}
            </div>
          )}

          <div className="pt-6 border-t border-slate-50 flex items-center justify-between">
             <div className="flex items-center gap-4">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className={`rounded-full gap-2 px-4 transition-colors ${isLiked ? 'text-rose-600 bg-rose-50 hover:bg-rose-100' : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'}`}
                  onClick={onLike}
                  disabled={isLiked}
                >
                   <Heart className={`h-4 w-4 ${isLiked || post.likesCount > 0 ? 'fill-rose-600 text-rose-600' : ''}`} />
                   <span className="text-xs font-bold uppercase tracking-widest">
                     {post.likesCount > 0 ? post.likesCount : ''} {isLiked ? 'Appreciated' : 'Appreciate'}
                   </span>
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className={`rounded-full gap-2 px-4 transition-colors ${isExpanded ? 'text-primary bg-primary/5' : 'text-slate-400 hover:text-primary hover:bg-primary/5'}`}
                  onClick={onToggleComments}
                >
                   <MessageSquare className={`h-4 w-4 ${post.commentsCount > 0 ? 'fill-primary text-primary' : ''}`} />
                   <span className="text-xs font-bold uppercase tracking-widest">
                     {post.commentsCount > 0 ? post.commentsCount : ''} Discuss
                   </span>
                </Button>
             </div>
             <Link 
              href={profileLink}
              className="text-[10px] font-black text-primary uppercase tracking-[0.2em] opacity-0 group-hover:opacity-100 transition-opacity"
             >
                View Profile
             </Link>
          </div>
        </div>

        {isExpanded && (
          <CommentsSection 
            postId={post.id} 
            user={user} 
            userProfile={userProfile} 
          />
        )}
      </CardContent>
    </Card>
  );
}

function CommentsSection({ postId, user, userProfile }: any) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const commentsQuery = useMemoFirebase(() => {
    if (!firestore || !postId) return null;
    return collection(firestore, 'communityComments');
  }, [firestore, postId]);
  
  const { data: rawComments, isLoading: isCommentsLoading } = useCollection(commentsQuery);

  const comments = (rawComments || [])
    .filter(c => c.postId === postId)
    .sort((a, b) => {
      const timeA = a.createdAt?.toMillis?.() || 0;
      const timeB = b.createdAt?.toMillis?.() || 0;
      return timeA - timeB;
    });

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !user || !newComment.trim() || isSubmitting) {
      if (!user) toast({ title: "Login Required", description: "Sign in to participate in the discussion." });
      return;
    }

    setIsSubmitting(true);
    const commentData = {
      postId,
      authorUid: user.uid,
      authorName: userProfile?.fullName || user.displayName || user.email?.split('@')[0] || "Member",
      authorImage: userProfile?.imageUrl || `https://picsum.photos/seed/${user.uid}/50/50`,
      content: newComment.trim(),
      createdAt: serverTimestamp(),
    };

    addDoc(collection(firestore, 'communityComments'), commentData)
      .then(() => {
        updateDoc(doc(firestore, 'communityPosts', postId), {
          commentsCount: increment(1)
        });
        setNewComment('');
      })
      .catch((error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: 'communityComments',
          operation: 'create',
          requestResourceData: commentData
        }));
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  };

  return (
    <div className="bg-slate-50/80 border-t border-slate-100 p-8 space-y-6">
      <div className="space-y-4">
        {isCommentsLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-primary/30" />
          </div>
        ) : !comments || comments.length === 0 ? (
          <div className="text-center py-6 text-sm text-slate-400 font-medium italic">
            No thoughts shared yet. Be the first to start the discussion!
          </div>
        ) : (
          comments.map((comment) => {
            const commentDate = comment.createdAt?.toDate ? comment.createdAt.toDate() : new Date();
            return (
              <div key={comment.id} className="flex gap-3 animate-in fade-in slide-in-from-left-2 duration-300">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src={comment.authorImage} />
                  <AvatarFallback>{comment.authorName.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-1">
                  <div className="bg-white p-4 rounded-2xl rounded-tl-none shadow-sm ring-1 ring-slate-100">
                    <p className="text-xs font-black text-slate-900 mb-1">{comment.authorName}</p>
                    <p className="text-sm text-slate-600 leading-relaxed font-medium">
                      {comment.content}
                    </p>
                  </div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase px-1">
                    {formatDistanceToNow(commentDate, { addSuffix: true })}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {user && (
        <form onSubmit={handleAddComment} className="flex gap-3 items-start pt-4 border-t border-slate-100">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src={userProfile?.imageUrl} />
            <AvatarFallback>{userProfile?.fullName?.charAt(0) || user.email?.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 relative">
            <Textarea 
              placeholder="Add your thoughts..."
              className="min-h-[60px] rounded-xl border-slate-200 bg-white text-sm resize-none pr-12 focus-visible:ring-primary/20"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              required
            />
            <Button 
              type="submit" 
              size="icon" 
              className="absolute bottom-2 right-2 h-8 w-8 rounded-lg shadow-md"
              disabled={isSubmitting || !newComment.trim()}
            >
              {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <CornerDownRight className="h-4 w-4" />}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
