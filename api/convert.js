import { spawn } from 'child_process';
import { writeFile, readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

export const config = { api: { bodyParser: { sizeLimit: '100mb' } } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const tmp = tmpdir();
  const inPath  = join(tmp, `in_${Date.now()}.webm`);
  const outPath = join(tmp, `out_${Date.now()}.mp4`);

  try {
    // Recebe o body como buffer
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    await writeFile(inPath, buffer);

    // Converte com ffmpeg
    await new Promise((resolve, reject) => {
      const ff = spawn('ffmpeg', [
        '-i', inPath,
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-movflags', '+faststart', // permite seek
        '-preset', 'fast',
        '-y', outPath
      ]);
      ff.on('close', code => code === 0 ? resolve() : reject(new Error('ffmpeg saiu com código ' + code)));
      ff.stderr.on('data', () => {}); // suprime logs
    });

    const mp4 = await readFile(outPath);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', mp4.length);
    res.setHeader('Content-Disposition', 'attachment; filename="noticia-video.mp4"');
    return res.status(200).send(mp4);

  } catch(e) {
    return res.status(500).json({ error: e.message });
  } finally {
    await unlink(inPath).catch(() => {});
    await unlink(outPath).catch(() => {});
  }
}
