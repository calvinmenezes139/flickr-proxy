export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const text = req.query.text || '';
  if (!text) return res.status(400).json({ error: 'Passe ?text=...' });

  try {
    const chunks = splitText(text, 180);
    const buffers = [];

    for (const chunk of chunks) {
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=pt-BR&client=tw-ob`;
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      if (!r.ok) throw new Error('Google TTS status ' + r.status + ' chunk: ' + chunk.slice(0, 40));
      const buf = await r.arrayBuffer();
      buffers.push(Buffer.from(buf));
    }

    const audio = Buffer.concat(buffers);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audio.length);
    return res.status(200).send(audio);
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}

function splitText(text, maxLen) {
  const chunks = [];
  const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
  let current = '';
  for (const s of sentences) {
    if ((current + s).length > maxLen) {
      if (current) chunks.push(current.trim());
      current = s;
    } else {
      current += s;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
