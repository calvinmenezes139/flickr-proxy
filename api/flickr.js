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
      },
    }).then(r => r.text());

    const images = extractImages(html);

    if (images.length === 0) {
      return res.status(404).json({ error: 'Nenhuma imagem encontrada.', htmlSize: html.length });
    }

    return res.status(200).json({ images: images.slice(0, 20) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

function extractImages(html) {
  const results = new Map();

  // 1) Padrão mais comum no HTML do Flickr: "id":"xxx","secret":"yyy","server":"zzz"
  for (const [, id, secret, server] of html.matchAll(/"id":"(\d+)","secret":"([a-f0-9]+)","server":"(\d+)"/g)) {
    if (!results.has(id))
      results.set(id, `https://live.staticflickr.com/${server}/${id}_${secret}_b.jpg`);
  }

  // 2) Ordem alternativa dos campos
  for (const [, server, id, secret] of html.matchAll(/"server":"(\d+)"[^}]{0,60}"id":"(\d+)"[^}]{0,60}"secret":"([a-f0-9]+)"/g)) {
    if (!results.has(id))
      results.set(id, `https://live.staticflickr.com/${server}/${id}_${secret}_b.jpg`);
  }

  // 3) Fallback: URLs diretas no HTML
  if (results.size === 0) {
    const raw = [...html.matchAll(/https:\/\/live\.staticflickr\.com\/[^"'\s\\]+/g)].map(m => m[0]);
    const filtered = [...new Set(raw)].filter(u => !/_[sqtn]\.\w+$/.test(u));
    const preferred = filtered.filter(u => /_b\.\w+$/.test(u));
    (preferred.length ? preferred : filtered).forEach((u, i) => results.set('f' + i, u));
  }

  return [...results.values()];
}
