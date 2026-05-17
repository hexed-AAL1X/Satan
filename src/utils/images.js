const https = require('https');
const http = require('http');

function httpGet(url, timeoutMs = 6000) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'SatanMetalBot/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve({ redirect: res.headers.location, status: res.statusCode });
      }
      let body = '';
      const chunks = [];
      const isJson = res.headers['content-type']?.includes('json');
      res.on('data', c => { if (isJson) body += c; else chunks.push(c); });
      res.on('end', () => resolve({ status: res.statusCode, body, buffer: chunks.length ? Buffer.concat(chunks) : null }));
      res.on('error', () => resolve(null));
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

// Portada de álbum: Deezer → MusicBrainz/CAA → iTunes
async function getAlbumArtworkUrl(band, album) {
  // 1. Deezer (más rápido y confiable)
  try {
    const q = encodeURIComponent(`${band} ${album}`);
    const res = await httpGet(`https://api.deezer.com/search/album?q=${q}&limit=3`);
    if (res?.body) {
      const d = JSON.parse(res.body);
      const match = d.data?.find(item =>
        item.title?.toLowerCase().includes(album.toLowerCase().slice(0, 6)) ||
        item.artist?.name?.toLowerCase().includes(band.toLowerCase().slice(0, 5))
      ) || d.data?.[0];
      if (match?.cover_big) return match.cover_big;
    }
  } catch {}

  // 2. MusicBrainz + Cover Art Archive
  try {
    const q = encodeURIComponent(`artist:${band} release:${album}`);
    const mbRes = await httpGet(`https://musicbrainz.org/ws/2/release/?query=${q}&fmt=json&limit=3`);
    if (mbRes?.body) {
      const mbData = JSON.parse(mbRes.body);
      for (const release of (mbData.releases || [])) {
        if (release.score >= 55) {
          const caaRes = await httpGet(`https://coverartarchive.org/release/${release.id}/front`);
          if (caaRes?.redirect) return caaRes.redirect;
        }
      }
    }
  } catch {}

  // 3. iTunes
  try {
    const r = await httpGet(`https://itunes.apple.com/search?term=${encodeURIComponent(band + ' ' + album)}&entity=album&limit=1`);
    if (r?.body) {
      const d = JSON.parse(r.body);
      const art = d.results?.[0]?.artworkUrl100;
      if (art) return art.replace('100x100bb', '600x600bb');
    }
  } catch {}

  return null;
}

// Imagen de artista/banda: Deezer → MusicBrainz/CAA → iTunes
async function getBandImageUrl(band) {
  // 1. Deezer
  try {
    const q = encodeURIComponent(band);
    const res = await httpGet(`https://api.deezer.com/search/artist?q=${q}&limit=3`);
    if (res?.body) {
      const d = JSON.parse(res.body);
      const match = d.data?.find(a => a.name?.toLowerCase().includes(band.toLowerCase().slice(0, 5))) || d.data?.[0];
      if (match?.picture_big && !match.picture_big.includes('default')) return match.picture_big;
    }
  } catch {}

  // 2. MusicBrainz: buscar artista → primer release con portada
  try {
    const q = encodeURIComponent(band);
    const mbRes = await httpGet(`https://musicbrainz.org/ws/2/artist/?query=${q}&fmt=json&limit=1`);
    if (mbRes?.body) {
      const data = JSON.parse(mbRes.body);
      const artist = data.artists?.[0];
      if (artist?.id && artist.score >= 70) {
        const relRes = await httpGet(`https://musicbrainz.org/ws/2/release/?artist=${artist.id}&fmt=json&limit=5`);
        if (relRes?.body) {
          const relData = JSON.parse(relRes.body);
          for (const rel of (relData.releases || [])) {
            const caa = await httpGet(`https://coverartarchive.org/release/${rel.id}/front`);
            if (caa?.redirect) return caa.redirect;
          }
        }
      }
    }
  } catch {}

  // 3. iTunes
  try {
    const r = await httpGet(`https://itunes.apple.com/search?term=${encodeURIComponent(band)}&entity=musicArtist&limit=1`);
    if (r?.body) {
      const d = JSON.parse(r.body);
      const art = d.results?.[0]?.artworkUrl100;
      if (art) return art.replace('100x100bb', '600x600bb');
    }
  } catch {}

  return null;
}

// Busca la imagen con timeout global
async function getAlbumArtworkSafe(band, album, timeoutMs = 8000) {
  return Promise.race([
    getAlbumArtworkUrl(band, album),
    new Promise(r => setTimeout(() => r(null), timeoutMs)),
  ]);
}

async function getBandImageSafe(band, timeoutMs = 8000) {
  return Promise.race([
    getBandImageUrl(band),
    new Promise(r => setTimeout(() => r(null), timeoutMs)),
  ]);
}

module.exports = { getAlbumArtworkUrl, getBandImageUrl, getAlbumArtworkSafe, getBandImageSafe, httpGet };
