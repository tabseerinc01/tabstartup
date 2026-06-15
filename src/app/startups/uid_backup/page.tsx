import { redirect } from 'next/navigation';

/**
 * This route is now conflicting with [slug]. 
 * We are converting it to a static redirect handler to resolve the dynamic path conflict.
 * NOTE: Please delete the entire 'src/app/startups/[uid]' folder manually to fully resolve the Next.js build error.
 */
export default async function ObsoleteRouteHandler() {
  redirect('/founders');
}
