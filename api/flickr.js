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
  const results = [];

  // Normaliza escapes do Flickr
  const clean = html.replace(/\\"/g, '"').replace(/\\n/g, ' ');

  // Extrai todos os ids de foto (11 dígitos) e secrets em ordem de aparição
  const ids     = [...clean.matchAll(/"id"\s*:\s*"(\d{10,12})"/g)].map(m => ({ val: m[1], idx: m.index }));
  const secrets = [...clean.matchAll(/"secret"\s*:\s*"([0-9a-f]{8,12})"/g)].map(m => ({ val: m[1], idx: m.index }));
  const servers = [...clean.matchAll(/"server"\s*:\s*"(\d{4,5})"/g)].map(m => ({ val: m[1], idx: m.index }));

  // Para cada id, acha o secret mais próximo depois dele
  const used = new Set();
  for (const id of ids) {
    // Pega o primeiro secret que aparece após esse id (dentro de 500 chars)
    const secret = secrets.find(s => s.idx > id.idx && s.idx < id.idx + 500 && !used.has(s.val));
    if (!secret) continue;
    used.add(secret.val);

    // Pega o server mais próximo ao redor
    const server = servers.find(s => Math.abs(s.idx - id.idx) < 600) || { val: '65535' };

    results.push(`https://live.staticflickr.com/${server.val}/${id.val}_${secret.val}_b.jpg`);
    if (results.length >= 20) break;
  }

  // Fallback: URLs diretas
  if (results.length === 0) {
    const raw = [...html.matchAll(/https:\/\/live\.staticflickr\.com\/[^"'\s\\>]+/g)].map(m => m[0]);
    const filtered = [...new Set(raw)].filter(u => !/_[sqtn]\.\w+$/.test(u));
    const preferred = filtered.filter(u => /_b\.\w+$/.test(u));
    return preferred.length ? preferred : filtered;
  }

  return [...new Set(results)];
}
