/**
 * Targeted fetch for the cards that don't yet have a faceUrl.
 * Tries multiple Wikipedia title variants per player and accepts
 * the broader free-license set (incl. bare "Attribution").
 *
 *   node scripts/fetch-missing-faces.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const USER_AGENT = 'live-fifa-open/0.1 (https://github.com/HenryWorksHard/live-fifa-open)';

// "Attribution" alone is effectively CC-BY in Wikipedia metadata. Excluded:
// anything ending in NonCommercial / NoDerivs / Non-free.
const FREE = (s) => {
  if (!s) return false;
  if (/non[-\s]?commercial|nonderiv|no[-\s]?deriv|non[-\s]?free|fair[-\s]?use/i.test(s)) return false;
  return /cc[-\s]?by|cc[-\s]?0|public[\s-]?domain|^pd\b|gfdl|attribution/i.test(s);
};

const CANDIDATES = {
  'lfo-006':  ['Rodri (footballer, born 1996)', 'Rodrigo Hernández Cascante', 'Rodri'],
  'lfo-016':  ['Antony (footballer, born 2000)', 'Antony Matheus dos Santos'],
  'lfo-025':  ['Hirving Lozano'],
  'lfo-044':  ['Luis Díaz (Colombian footballer)', 'Luis Fernando Díaz'],
  'lfo-049':  ['Mathew Ryan', 'Mat Ryan'],
  'lfo-050':  ['Harry Souttar'],
  'lfo-052':  ['Sardar Azmoun'],
  'lfo-057':  ['Wilfred Ndidi'],
  'lfo-059':  ['Sébastien Haller'],
  'lfo-060':  ['Franck Kessié'],
  'lfo-066':  ['Dušan Vlahović'],
  'lfo-073':  ['Kasper Schmeichel'],
  'lfo-075':  ['Uriel Antuna'],
  'lfo-076':  ['Raúl Jiménez'],
};

async function api(params) {
  const url = `https://en.wikipedia.org/w/api.php?${new URLSearchParams({ format:'json', origin:'*', ...params })}`;
  const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function fetchForTitle(title) {
  const page = await api({
    action:'query', titles:title, prop:'pageimages|pageprops',
    pithumbsize:'500', redirects:1,
  });
  const p = Object.values(page.query.pages)[0];
  if (!p?.thumbnail || !p.pageimage) return null;

  const info = await api({
    action:'query', titles:`File:${p.pageimage}`,
    prop:'imageinfo', iiprop:'url|extmetadata',
  });
  const ii = Object.values(info.query.pages)[0]?.imageinfo?.[0];
  if (!ii) return null;
  const license = ii.extmetadata?.LicenseShortName?.value || '';
  if (!FREE(license)) return { license, free:false, thumb:p.thumbnail.source };
  return { license, free:true, thumb:p.thumbnail.source };
}

const cardsPath = path.resolve('data', 'cards.json');
const data = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));
const cardsById = Object.fromEntries(data.cards.map(c => [c.id, c]));

let added = 0, skipped = 0;
for (const [id, titles] of Object.entries(CANDIDATES)) {
  const card = cardsById[id];
  if (!card) { console.log(`! ${id} missing in data`); continue; }
  if (card.faceUrl) { console.log(`= ${id}  ${card.name}  already has faceUrl`); continue; }

  let resolved = null;
  for (const t of titles) {
    try {
      const r = await fetchForTitle(t);
      if (r?.free) { resolved = { ...r, title: t }; break; }
      else if (r) console.log(`  ${id}  tried "${t}"  non-free (${r.license})`);
      else       console.log(`  ${id}  tried "${t}"  no image`);
    } catch (e) {
      console.log(`  ${id}  "${t}"  ERR ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 120));
  }

  if (resolved) {
    card.faceUrl = resolved.thumb;
    card.faceLicense = resolved.license;
    console.log(`✓ ${id}  ${card.name.padEnd(20)}  ${resolved.license.padEnd(20)}  ${resolved.title}`);
    added++;
  } else {
    console.log(`✗ ${id}  ${card.name}  STILL MISSING`);
    skipped++;
  }
}

fs.writeFileSync(cardsPath, JSON.stringify(data, null, 2));
console.log(`\n${added} added, ${skipped} still missing.`);
