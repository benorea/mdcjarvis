// Meta Graph API (Facebook Page + linked Instagram Business account), called
// directly with fetch — same "no SDK for a couple of read-only calls"
// approach as lib/square.ts. Read-only: no posting capability exists here.

const GRAPH_API_VERSION = "v21.0";

export function socialMetricsConfigured(): boolean {
  return Boolean(process.env.META_ACCESS_TOKEN && (process.env.META_PAGE_ID || process.env.META_IG_USER_ID));
}

async function graphFetch(path: string): Promise<any> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}${path}${path.includes("?") ? "&" : "?"}access_token=${process.env.META_ACCESS_TOKEN}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data?.error?.message || JSON.stringify(data);
    throw new Error(`Meta Graph API error (${res.status}): ${detail}`);
  }
  return data;
}

export type SocialMetrics = {
  configured: boolean;
  message?: string;
  instagram?: { followers: number };
  facebook?: { likes: number; followers: number };
};

/** Current follower/like counts. Both sides are optional — reports whichever env vars are set. */
export async function readSocialMetrics(): Promise<SocialMetrics> {
  if (!socialMetricsConfigured()) {
    return { configured: false, message: "Social metrics not set up yet — needs META_ACCESS_TOKEN plus META_PAGE_ID and/or META_IG_USER_ID." };
  }

  const result: SocialMetrics = { configured: true };

  if (process.env.META_IG_USER_ID) {
    const ig = await graphFetch(`/${process.env.META_IG_USER_ID}?fields=followers_count`);
    result.instagram = { followers: ig.followers_count ?? 0 };
  }

  if (process.env.META_PAGE_ID) {
    const fb = await graphFetch(`/${process.env.META_PAGE_ID}?fields=fan_count,followers_count`);
    result.facebook = { likes: fb.fan_count ?? 0, followers: fb.followers_count ?? 0 };
  }

  return result;
}
