export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  let text = req.query.text || '';
  if (!text) return res.status(400).json({ error: 'Passe ?text=...' });

  // Remove acentos para evitar problemas com Google TTS
  text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  try {
    const chunks = splitByWords(text, 20); // ~20 palavras por chunk
    const buffers = [];

    for (const chunk of chunks) {
      if (!chunk.trim()) continue;
      try {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk.trim())}&tl=pt-BR&client=tw-ob`;
        const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!r.ok) {
          console.error('Chunk falhou:', chunk, 'status:', r.status);
          continue; // pula chunk com erro em vez de parar
        }
        const buf = await r.arrayBuffer();
        buffers.push(Buffer.from(buf));
      } catch(e) {
        console.error('Erro no chunk:', chunk, e.message);
        continue;
      }
    }

    if (buffers.length === 0) throw new Error('Nenhum chunk de áudio gerado.');

    const audio = Buffer.concat(buffers);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audio.length);
    return res.status(200).send(audio);
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}

function splitByWords(text, wordsPerChunk) {
  const words = text.split(/\s+/);
  const chunks = [];
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    chunks.push(words.slice(i, i + wordsPerChunk).join(' '));
  }
  return chunks;
}
