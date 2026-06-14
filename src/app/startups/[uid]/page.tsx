
import { redirect } from 'next/navigation';
import { firebaseConfig } from '@/firebase/config';

async function getStartupSlug(uid: string) {
  const projectId = firebaseConfig.projectId;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/startups/${uid}`;
  
  try {
    const response = await fetch(url, { next: { revalidate: 60 } });
    if (response.ok) {
      const data = await response.json();
      return data.fields?.slug?.stringValue || null;
    }
  } catch (error) {
    console.error("Error fetching startup slug for redirect:", error);
  }
  return null;
}

/**
 * Handle legacy UID URLs by redirecting to the consolidated slug handler.
 * To avoid param naming conflicts in Next.js, we name the param 'slug' in the signature
 * if this folder ever hits the same level logic.
 */
export default async function LegacyRedirect({ params }: { params: Promise<{ uid: string }> }) {
  const { uid: identifier } = await params;
  
  // Always redirect to the [slug] route which is now the master handler for both slugs and IDs
  // This prevents the sibling route conflict from breaking the build and handles existing links.
  const startupSlug = await getStartupSlug(identifier);
  
  if (startupSlug) {
    redirect(`/startups/${startupSlug}`);
  }
  
  // If no slug found, redirect to the identifier itself in the [slug] route
  // because [slug]/page.tsx now handles UIDs as a fallback.
  redirect(`/startups/${identifier}`);
}
