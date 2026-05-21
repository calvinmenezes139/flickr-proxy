export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url || !url.includes('flickr.com')) {
    return res.status(400).json({ error: 'Passe ?url=https://www.flickr.com/...' });
  }

  try {
    const html = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
      },
    }).then(r => r.text());

    const images = extractImages(html);

    // Modo debug: retorna trechos do HTML ao redor de "staticflickr"
    if (req.query.debug === '1') {
      const snippets = [];
      let idx = 0;
      while (snippets.length < 5) {
        const pos = html.indexOf('staticflickr', idx);
        if (pos === -1) break;
        snippets.push(html.slice(Math.max(0, pos - 120), pos + 120));
        idx = pos + 1;
      }
      // Também retorna trecho ao redor de "secret"
      const secretSnippets = [];
      idx = 0;
      while (secretSnippets.length < 3) {
        const pos = html.indexOf('"secret"', idx);
        if (pos === -1) break;
        secretSnippets.push(html.slice(Math.max(0, pos - 60), pos + 120));
        idx = pos + 1;
      }
      return res.status(200).json({ snippets, secretSnippets, htmlSize: html.length });
    }

    return res.status(200).json({
      images: images.slice(0, 20),
      total: images.length,
      htmlSize: html.length
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

function extractImages(html) {
  const results = new Map();

  // 1) Tenta extrair o bloco JSON principal do Flickr: modelExport ou _data
  const scriptPatterns = [
    /modelExport\s*=\s*(\{.+?\});\s*(?:var|let|const|\n)/s,
    /root\.__data\s*=\s*(\{.+?\});\s*(?:var|let|const|\n)/s,
    /Y\.namespace\("Fleece\.data"\)[^=]*=\s*(\{.+?\});/s,
  ];

  for (const pattern of scriptPatterns) {
    const m = html.match(pattern);
    if (m) {
      try {
        const obj = JSON.parse(m[1]);
        const photos = findPhotosInObject(obj);
        for (const p of photos) {
          if (p.id && p.secret && p.server) {
            results.set(p.id, `https://live.staticflickr.com/${p.server}/${p.id}_${p.secret}_b.jpg`);
          }
        }
        if (results.size > 0) break;
      } catch(e) {}
    }
  }

  // 2) Regex sobre todos os blocos <script> buscando objetos de foto
  if (results.size === 0) {
    // Padrão: "id":"12345","secret":"abcdef","server":"65535"
    for (const [, id, secret, server] of html.matchAll(/"id"\s*:\s*"(\d{10,})"\s*,\s*"secret"\s*:\s*"([0-9a-f]+)"\s*,\s*"server"\s*:\s*"(\d+)"/g)) {
      if (!results.has(id))
        results.set(id, `https://live.staticflickr.com/${server}/${id}_${secret}_b.jpg`);
    }
  }

  // 3) Padrão alternativo: server antes de id
  if (results.size === 0) {
    for (const [, server, id, secret] of html.matchAll(/"server"\s*:\s*"(\d+)"[^}]{0,80}"id"\s*:\s*"(\d{10,})"[^}]{0,80}"secret"\s*:\s*"([0-9a-f]+)"/g)) {
      if (!results.has(id))
        results.set(id, `https://live.staticflickr.com/${server}/${id}_${secret}_b.jpg`);
    }
  }

  // 4) Fallback final: URLs diretas no HTML
  if (results.size === 0) {
    const raw = [...html.matchAll(/https:\/\/live\.staticflickr\.com\/[^"'\s\\>]+/g)].map(m => m[0]);
    const filtered = [...new Set(raw)].filter(u => !/_[sqtn]\.\w+$/.test(u));
    const preferred = filtered.filter(u => /_b\.\w+$/.test(u));
    (preferred.length ? preferred : filtered).forEach((u, i) => results.set('f'+i, u));
  }

  return [...results.values()];
}

// Percorre objeto recursivamente buscando arrays com objetos de foto
function findPhotosInObject(obj, depth = 0) {
  if (depth > 6 || !obj || typeof obj !== 'object') return [];
  if (Array.isArray(obj)) {
    if (obj.length > 0 && obj[0]?.id && obj[0]?.secret) return obj;
    return obj.flatMap(item => findPhotosInObject(item, depth + 1));
  }
  return Object.values(obj).flatMap(v => findPhotosInObject(v, depth + 1));
}
