import { redirect } from 'next/navigation';

/**
 * Backward compatibility redirect for old UID-based URLs.
 * All startup logic is now consolidated in the [slug] route 
 * which handles both IDs and SEO-friendly slugs.
 */
export default async function RedirectToSlugPage({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  // Redirect to the consolidated route which handles lookups by both ID and Slug
  redirect(`/startups/${uid}`);
}
