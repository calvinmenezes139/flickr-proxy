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

    // Remove linhas curtas repetitivas de menu/navegação no início (menos de 60 chars)
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // Detecta onde começa o conteúdo real: primeira linha longa (>80 chars) ou após título
    let startIdx = 0;
    let longLineCount = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length > 80) {
        longLineCount++;
        if (longLineCount >= 2) { startIdx = i - 1; break; }
      }
    }

    const cleanLines = lines.slice(startIdx);

    // Remove linhas que parecem navegação, autor ou rodapé
    const filtered = cleanLines.filter(l => {
      if (l.length < 20 && l === l.toUpperCase()) return false; // ex: "NOTÍCIAS"
      if (/^(foto|image|crédito|photo):/i.test(l)) return false;
      if (/^siga-nos/i.test(l)) return false;
      return true;
    });

    // Corta o texto ao encontrar sinais de fim do artigo (autor, relacionadas, comentários)
    const cutPatterns = [
      /please enable javascript/i,
      /artigos relacionados/i,
      /not[íi]cia anterior/i,
      /pr[óo]xima not[íi]cia/i,
      /leia (mais|também)/i,
      /comments powered by/i,
      /formado em \d{4}/i,
      /jornalista formado/i,
      /é (tricolor|vascaíno|flamenguista|corintiano|são-paulino)/i,
      /trabalhou.{0,30}(redator|editor|repórter)/i,
    ];

    // Corta tudo após o último ponto/exclamação/interrogação
    // Remove tags/categorias/autor que ficam no final sem pontuação
    const lastPunct = Math.max(text.lastIndexOf('.'), text.lastIndexOf('!'), text.lastIndexOf('?'));
    if (lastPunct > text.length * 0.5) text = text.slice(0, lastPunct + 1);

    let cutIdx = filtered.length;
    for (let i = 0; i < filtered.length; i++) {
      if (cutPatterns.some(p => p.test(filtered[i]))) {
        cutIdx = i;
        break;
      }
    }

    text = filtered.slice(0, cutIdx).join(' ').replace(/\s{2,}/g, ' ').trim();

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
