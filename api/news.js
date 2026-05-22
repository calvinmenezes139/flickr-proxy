export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Passe ?url=https://...' });

  try {
    const jinaUrl = 'https://r.jina.ai/' + url;
    const response = await fetch(jinaUrl, {
      headers: {
        'Accept': 'text/plain',
        'X-Return-Format': 'text',
      }
    });

    if (!response.ok) throw new Error('Jina retornou status ' + response.status);

    let text = await response.text();

    // Limita a ~400 palavras
    const words = text.split(/\s+/).filter(w => w.length > 0);
    if (words.length > 400) text = words.slice(0, 400).join(' ') + '...';

    if (!text || text.length < 50) {
      return res.status(404).json({ error: 'Não foi possível extrair o texto da notícia.' });
    }

    return res.status(200).json({ text });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
