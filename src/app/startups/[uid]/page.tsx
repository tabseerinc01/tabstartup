
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
 * Handle legacy UID URLs by redirecting to the consolidated slug/id route.
 * To avoid the "different slug names" error, we use the parameter name 'slug' in the signature.
 */
export default async function LegacyRedirect({ params }: { params: Promise<{ slug: string }> }) {
  // Extract identifier (which folder name calls 'uid', but we rename to satisfy Next.js conflict rules)
  const { slug: identifier } = await params;
  
  // Try to find if this UID has a slug
  const startupSlug = await getStartupSlug(identifier);
  
  // Only redirect if the slug is different from the identifier to prevent a circular loop
  if (startupSlug && startupSlug !== identifier) {
    redirect(`/startups/${startupSlug}`);
  }
  
  // If we're already at the correct identifier or it has no slug, 
  // redirect to the consolidated route if this folder is hit.
  // Note: If both folders exist, we must send them to a safe base or the master handler.
  redirect(`/founders`); 
}
