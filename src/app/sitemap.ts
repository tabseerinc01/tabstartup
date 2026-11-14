import { MetadataRoute } from 'next';
import { firebaseConfig } from '@/firebase/config';
import { listPublicEvents } from '@/services/public-event.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://tabstartup.com'; // Adjust to your actual domain
  const projectId = firebaseConfig.projectId;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;

  const staticPages = [
    '',
    '/founders',
    '/investors',
    '/mentors',
    '/services',
    '/events',
    '/cofounders',
    '/community',
    '/about',
    '/privacy',
    '/terms',
  ].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: 'daily' as const,
    priority: route === '' ? 1 : 0.8,
  }));

  let startupEntries: MetadataRoute.Sitemap = [];

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "startups" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "status" },
              op: "EQUAL",
              value: { stringValue: "active" }
            }
          }
        }
      })
    });

    const data = await response.json();
    if (data && Array.isArray(data)) {
      startupEntries = data
        .filter(d => d.document)
        .map((d) => {
          const fields = d.document.fields;
          const slug = fields.slug?.stringValue || d.document.name.split('/').pop();
          const updatedAt = fields.updatedAt?.timestampValue || new Date();
          
          return {
            url: `${baseUrl}/startups/${slug}`,
            lastModified: new Date(updatedAt),
            changeFrequency: 'weekly' as const,
            priority: 0.7,
          };
        });
    }
  } catch (error) {
    console.error("Error generating dynamic sitemap entries:", error);
  }

  let eventEntries: MetadataRoute.Sitemap = [];

  try {
    const events = await listPublicEvents();

    eventEntries = events.map(event => ({
      url: baseUrl + '/events/' +
        encodeURIComponent(event.slug),

      changeFrequency: 'daily' as const,
      priority: 0.8,
    }));
  } catch (error) {
    console.error(
      'Error generating public event sitemap entries:',
      error
    );
  }

  return [
    ...staticPages,
    ...startupEntries,
    ...eventEntries,
  ];
}
