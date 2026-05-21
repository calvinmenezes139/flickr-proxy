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
  const clean = html.replace(/\\"/g, '"').replace(/\\n/g, ' ');

  // Padrão real encontrado no debug:
  // "id":"55280458051","exportMetaType":"model","secret":"18bf2aa4f0"
  const re = /"id"\s*:\s*"(\d{8,})"[^}]{0,60}"exportMetaType"\s*:\s*"model"[^}]{0,60}"secret"\s*:\s*"([0-9a-f]+)"/g;
  let m;
  while ((m = re.exec(clean)) !== null) {
    const [, id, secret] = m;
    // Busca server nas proximidades (300 chars à frente)
    const ahead = clean.slice(m.index, m.index + 300);
    const serverM = ahead.match(/"server"\s*:\s*"(\d+)"/);
    const server = serverM ? serverM[1] : '65535'; // fallback ao server conhecido
    if (!results.has(id))
      results.set(id, `https://live.staticflickr.com/${server}/${id}_${secret}_b.jpg`);
  }

  // Fallback: URLs diretas no HTML
  if (results.size === 0) {
    const raw = [...html.matchAll(/https:\/\/live\.staticflickr\.com\/[^"'\s\\>]+/g)].map(m => m[0]);
    const filtered = [...new Set(raw)].filter(u => !/_[sqtn]\.\w+$/.test(u));
    const preferred = filtered.filter(u => /_b\.\w+$/.test(u));
    (preferred.length ? preferred : filtered).forEach((u, i) => results.set('f'+i, u));
  }

  return [...results.values()];
}
