// Vercel Serverless Function — returns tracks from a public Spotify playlist.
//
// Uses the Client Credentials flow (app-only, no user login), so it can read
// any PUBLIC playlist. The Client Secret stays on the server and is never
// exposed to the browser.
//
// Required environment variables (set in Vercel → Settings → Environment Variables):
//   SPOTIFY_CLIENT_ID      — from https://developer.spotify.com/dashboard
//   SPOTIFY_CLIENT_SECRET  — from the same app
//   SPOTIFY_PLAYLIST_ID    — the id from a PUBLIC playlist's share link
//                            (open.spotify.com/playlist/<THIS_PART>?si=...)

// Warm-instance cache so we don't hit Spotify on every request.
let cache = { tracks: null, expires: 0 };

async function getAppToken(clientId, clientSecret) {
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${auth}`,
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`token request failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

async function fetchPlaylistTracks(token, playlistId) {
  const tracks = [];
  let url =
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks` +
    `?limit=100&fields=next,items(track(id,name,artists(name),album(images)))`;

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`playlist request failed: ${res.status}`);
    const data = await res.json();

    for (const item of data.items || []) {
      const t = item.track;
      if (t && t.id) {
        tracks.push({
          id: t.id,
          name: t.name,
          artist: (t.artists || []).map((a) => a.name).join(', '),
          image: t.album?.images?.[0]?.url || null,
        });
      }
    }
    url = data.next;
  }
  return tracks;
}

export default async function handler(req, res) {
  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_PLAYLIST_ID } =
    process.env;

  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_PLAYLIST_ID) {
    return res
      .status(500)
      .json({ error: 'Missing Spotify environment variables' });
  }

  try {
    const now = Date.now();
    if (!cache.tracks || now > cache.expires) {
      const token = await getAppToken(SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET);
      const tracks = await fetchPlaylistTracks(token, SPOTIFY_PLAYLIST_ID);
      cache = { tracks, expires: now + 60 * 60 * 1000 }; // 1 hour
    }

    // Let Vercel's CDN cache the response too.
    res.setHeader(
      'Cache-Control',
      's-maxage=3600, stale-while-revalidate=86400'
    );
    return res.status(200).json({ tracks: cache.tracks });
  } catch (err) {
    return res.status(502).json({ error: String(err) });
  }
}
