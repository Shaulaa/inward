/**
 * Writes every caption and fact shown in Inward, with its scene and its
 * check marker, to docs/teks-dan-fakta.md — a checklist for verifying the
 * facts against sources. Reads src/content/story.js directly, so the list
 * always matches the site. Run with: npm run facts
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FALLBACK, NOTE, OUTRO, SCENES, UI } from '../src/content/story.js';

const check = (c) => (c ? `**Cek: ${c.level}** — ${c.what}. Saran sumber: ${c.source}.` : '');
const lines = [
  '# Teks dan fakta Inward',
  '',
  'Dibuat otomatis dari `src/content/story.js` (`npm run facts`). Jangan diedit di sini; ubah teksnya di file data itu.',
  '',
  'Tanda cek: **wajib** = ada angka atau perkiraan, cocokkan ke sumber primer sebelum rilis. **disarankan** = fakta buku teks, pastikan kalimatnya sesuai sumber. "Saran sumber" adalah rujukan untuk mengecek, bukan tanda bahwa faktanya sudah dicek.',
  '',
];
let n = 0;
for (const [id, scene] of Object.entries(SCENES)) {
  lines.push(`## ${scene.label} (${scene.scale})`, '');
  lines.push(`${++n}. **Skala** ${scene.scale}  `, `   ${check(scene.scaleCheck)}`, '');
  lines.push(`${++n}. **Teks scene — ${scene.caption.title}**  `, `   ${scene.caption.text}  `, `   ${check(scene.caption.check)}`, '');
  for (const spot of scene.hotspots) {
    lines.push(`${++n}. **Titik klik — ${spot.title}** (label: ${spot.label}, id: \`${id}/${spot.id}\`)  `, `   ${spot.text}  `, `   ${check(spot.check)}`, '');
  }
}
lines.push('## Penutup', '');
lines.push(`${++n}. **${OUTRO.fact.kicker} — ${OUTRO.fact.title}**  `, `   ${OUTRO.fact.text}  `, `   ${check(OUTRO.fact.check)}`, '');
lines.push(`${++n}. **${OUTRO.closing.title}**  `, `   ${OUTRO.closing.text}  `, `   ${check(OUTRO.closing.check)}`, '');
lines.push('## Teks lain (bukan klaim fakta)', '');
lines.push(`- Catatan ilustrasi: ${NOTE}`);
lines.push(`- Tombol penutup: ${OUTRO.replay}`);
lines.push(`- Titik klik: awalan label "${UI.hotspotPrefix}", tombol tutup "${UI.closeFact}"`);
for (const [key, value] of Object.entries(FALLBACK)) {
  if (typeof value === 'string') lines.push(`- Fallback (${key}): ${value}`);
  else lines.push(`- Fallback (${key}): **${value.title}** — ${value.text}`);
}
lines.push('');

const target = fileURLToPath(new URL('../docs/teks-dan-fakta.md', import.meta.url));
writeFileSync(target, lines.join('\n'), 'utf8');
console.log(`Wrote ${n} items to docs/teks-dan-fakta.md`);
