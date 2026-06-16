import { redirect } from 'next/navigation';

/**
 * OBSOLETE: This path is deprecated. 
 * Public access is now handled exclusively via /startups/[slug].
 * Automatic redirection ensures old links still work.
 */
export default async function ObsoleteLegacyRedirect() {
  redirect('/founders');
}