export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url, debug } = req.query;
  if (!url || !url.includes('flickr.com')) {
    return res.status(400).json({ error: 'Passe ?url=https://www.flickr.com/...' });
  }

  try {
    const html = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
    }).then(r => r.text());

    if (debug === '1') {
      // Mostra todos os trechos com "secret" para análise
      const hits = [];
      let i = 0;
      while (hits.length < 8) {
        const pos = html.indexOf('"secret"', i);
        if (pos === -1) break;
        hits.push(html.slice(Math.max(0, pos - 200), pos + 200).replace(/\\/g, ''));
        i = pos + 1;
      }
      return res.status(200).json({ hits, htmlSize: html.length });
    }

    const images = extractImages(html);
    return res.status(200).json({ images: images.slice(0, 20), total: images.length });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

function extractImages(html) {
  const results = new Map();

  // O Flickr escapa as aspas com \", então normalizamos primeiro
  const clean = html.replace(/\\"/g, '"').replace(/\\n/g, ' ').replace(/\\\\/g, '\\');

  // Padrão 1: "id":"FOTOID" ... "secret":"SECRET" ... "server":"SERVER" num raio de 300 chars
  const idRe = /"id"\s*:\s*"(\d{8,})"/g;
  let m;
  while ((m = idRe.exec(clean)) !== null) {
    const id = m[1];
    const slice = clean.slice(m.index, m.index + 400);
    const secretM = slice.match(/"secret"\s*:\s*"([0-9a-f]+)"/);
    const serverM = slice.match(/"server"\s*:\s*"(\d+)"/);
    if (secretM && serverM && !results.has(id)) {
      results.set(id, `https://live.staticflickr.com/${serverM[1]}/${id}_${secretM[1]}_b.jpg`);
    }
  }

  // Padrão 2: busca reversa — secret primeiro, depois id
  if (results.size === 0) {
    const secRe = /"secret"\s*:\s*"([0-9a-f]+)"/g;
    while ((m = secRe.exec(clean)) !== null) {
      const secret = m[1];
      const before = clean.slice(Math.max(0, m.index - 300), m.index);
      const after  = clean.slice(m.index, m.index + 200);
      const idM     = (before.match(/"id"\s*:\s*"(\d{8,})"/g) || []).pop();
      const serverM = after.match(/"server"\s*:\s*"(\d+)"/) || before.match(/"server"\s*:\s*"(\d+)"/);
      if (idM && serverM) {
        const id = idM.match(/"id"\s*:\s*"(\d{8,})"/)[1];
        if (!results.has(id))
          results.set(id, `https://live.staticflickr.com/${serverM[1]}/${id}_${secret}_b.jpg`);
      }
    }
  }

  // Padrão 3: URLs diretas no HTML (fallback)
  if (results.size === 0) {
    const raw = [...html.matchAll(/https:\/\/live\.staticflickr\.com\/[^"'\s\\>]+/g)].map(m => m[0]);
    const filtered = [...new Set(raw)].filter(u => !/_[sqtn]\.\w+$/.test(u));
    const preferred = filtered.filter(u => /_b\.\w+$/.test(u));
    (preferred.length ? preferred : filtered).forEach((u, i) => results.set('f'+i, u));
  }

  return [...results.values()];
}
