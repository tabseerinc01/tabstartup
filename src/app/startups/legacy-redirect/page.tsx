import { redirect } from 'next/navigation';

/**
 * OBSOLETE: This path is deprecated. 
 * Public access is now handled exclusively via /startups/[slug].
 */
export default async function ObsoleteLegacyRedirect() {
  redirect('/founders');
}
