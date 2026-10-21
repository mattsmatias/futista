// Next.js laajentaa fetch-asetuksia (next: { revalidate, tags }). Testikäännös ei lataa Nextin tyyppejä,
// joten sama laajennus kuvataan tässä, jotta testien tyyppitarkistus kattaa myös lib/stats.ts:n.
interface RequestInit { next?: { revalidate?: number | false; tags?: string[] } }
