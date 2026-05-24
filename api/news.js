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
      headers: { 'Accept': 'text/plain', 'X-Return-Format': 'text' }
    });
    if (!response.ok) throw new Error('Jina retornou status ' + response.status);

    let text = await response.text();

    // 1) Divide em linhas e remove vazias
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // 2) Detecta início do conteúdo: aguarda 2 linhas longas (>80 chars)
    let startIdx = 0, longCount = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length > 80) { longCount++; if (longCount >= 2) { startIdx = i - 1; break; } }
    }

    // 3) Filtra linhas de navegação/ruído
    const filtered = lines.slice(startIdx).filter(l => {
      if (l.length < 20 && l === l.toUpperCase()) return false;
      if (/^(foto|image|crédito|photo|siga-nos)/i.test(l)) return false;
      return true;
    });

    // 4) Corta ao encontrar sinais de fim de artigo
    const cutAt = [
      /please enable javascript/i, /artigos relacionados/i,
      /not[íi]cia anterior/i, /pr[óo]xima not[íi]cia/i,
      /leia (mais|também)/i, /comments powered by/i,
      /formado em \d{4}/i, /jornalista formado/i,
      /trabalhou.{0,30}(redator|editor|repórter)/i,
      /é (tricolor|vascaíno|flamenguista|corintiano|são-paulino)/i,
    ];
    let cutIdx = filtered.length;
    for (let i = 0; i < filtered.length; i++) {
      if (cutAt.some(p => p.test(filtered[i]))) { cutIdx = i; break; }
    }

    // 5) Junta o texto
    text = filtered.slice(0, cutIdx).join(' ').replace(/\s{2,}/g, ' ').trim();

    // 6) Remove tags/categorias soltas no final (após o último ponto)
    const lastDot = Math.max(text.lastIndexOf('.'), text.lastIndexOf('!'), text.lastIndexOf('?'));
    if (lastDot > 0 && lastDot < text.length - 1) {
      const tail = text.slice(lastDot + 1).trim();
      // Se o que vem depois do último ponto não tem outro ponto = são tags, remove
      if (!tail.includes('.') && !tail.includes('!') && !tail.includes('?')) {
        text = text.slice(0, lastDot + 1);
      }
    }

    // 7) Limita a 400 palavras
    const words = text.split(/\s+/).filter(w => w.length > 0);
    if (words.length > 400) text = words.slice(0, 400).join(' ') + '...';

    if (!text || text.length < 50)
      return res.status(404).json({ error: 'Não foi possível extrair o texto da notícia.' });

    return res.status(200).json({ text });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
