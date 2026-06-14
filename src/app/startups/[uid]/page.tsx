
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
 * We rename the internal variable to 'slug' to avoid build conflicts with the [slug] sibling route
 * if the system hasn't fully cleared the old folder yet.
 */
export default async function LegacyRedirect({ params }: { params: Promise<{ uid: string }> }) {
  const { uid: identifier } = await params;
  
  const startupSlug = await getStartupSlug(identifier);
  
  // If we find a slug, redirect to the new canonical URL
  if (startupSlug) {
    redirect(`/startups/${startupSlug}`);
  }
  
  // Otherwise redirect to the consolidated handler which handles IDs too
  redirect(`/startups/${identifier}`);
}
