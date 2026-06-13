import { redirect } from 'next/navigation';

/**
 * DEPRECATED: This route is now consolidated into /startups/[slug].
 * We use this file as a simple redirect to the master dynamic route
 * while ensuring no dynamic parameter conflict at the directory level.
 */
export default async function LegacyRedirect({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  redirect(`/startups/${uid}`);
}
