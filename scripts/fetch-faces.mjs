/**
 * Fetch CC-licensed player photos from Wikipedia for the cards in data/cards.json,
 * verify each is on a free license, and write the URLs back into cards.json
 * under a `faceUrl` field. Skips any card whose image is non-free or missing.
 *
 * Run with:  node scripts/fetch-faces.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const USER_AGENT = 'live-fifa-open/0.1 (https://github.com/HenryWorksHard/live-fifa-open; contact via repo)';
const FREE_LICENSE_PATTERNS = [
  /cc[-\s]?by/i,        // CC-BY, CC-BY-SA variants
  /cc[-\s]?0/i,         // CC0
  /public[\s-]?domain/i,
  /^pd\b/i,
  /gfdl/i,              // GNU Free Documentation License
];

// Map card id -> Wikipedia article title. Only the marquee names — the long tail
// stays on the silhouette placeholder.
const WIKI_TITLES = {
  'lfo-001': 'Lionel Messi',
  'lfo-002': 'Kylian Mbappé',
  'lfo-003': 'Erling Haaland',
  'lfo-004': 'Jude Bellingham',
  'lfo-005': 'Vinícius Júnior',
  'lfo-006': 'Rodri',
  'lfo-007': 'Lamine Yamal',
  'lfo-008': 'Florian Wirtz',
  'lfo-009': 'Jamal Musiala',
  'lfo-010': 'Phil Foden',
  'lfo-011': 'Bukayo Saka',
  'lfo-012': 'Pedri',
  'lfo-013': 'Kevin De Bruyne',
  'lfo-014': 'Virgil van Dijk',
  'lfo-015': 'Trent Alexander-Arnold',
  'lfo-017': 'Manuel Akanji',
  'lfo-018': 'Son Heung-min',
  'lfo-019': 'Luka Modrić',
  'lfo-020': 'Theo Hernandez',
  'lfo-021': 'Casemiro',
  'lfo-022': 'Christian Pulisic',
  'lfo-023': 'Alphonso Davies',
  'lfo-024': 'Romelu Lukaku',
  'lfo-026': 'Michael Olise',
  'lfo-027': 'Robert Lewandowski',
  'lfo-028': 'Mohamed Salah',
  'lfo-029': 'Sadio Mané',
  'lfo-030': 'Kalidou Koulibaly',
  'lfo-031': 'John Stones',
  'lfo-032': 'Marcus Rashford',
  'lfo-033': 'Gianluigi Donnarumma',
  'lfo-034': 'Thibaut Courtois',
  'lfo-035': 'Pelé',
  'lfo-036': 'Diego Maradona',
  'lfo-037': 'Cristiano Ronaldo',
  'lfo-038': 'Bernardo Silva',
  'lfo-039': 'João Félix',
  'lfo-040': 'Rafael Leão',
  'lfo-041': 'Federico Valverde',
  'lfo-042': 'Darwin Núñez',
  'lfo-043': 'Ronald Araújo',
  'lfo-044': 'Luis Díaz',
  'lfo-045': 'James Rodríguez',
  'lfo-046': 'Takefusa Kubo',
  'lfo-047': 'Kaoru Mitoma',
  'lfo-048': 'Wataru Endō',
  'lfo-051': 'Mehdi Taremi',
  'lfo-053': 'Hakim Ziyech',
  'lfo-054': 'Achraf Hakimi',
  'lfo-055': 'Yassine Bounou',
  'lfo-056': 'Victor Osimhen',
  'lfo-058': 'Mohammed Kudus',
  'lfo-061': 'André Onana',
  'lfo-062': 'Rasmus Højlund',
  'lfo-063': 'Christian Eriksen',
  'lfo-064': 'Alexander Isak',
  'lfo-065': 'Viktor Gyökeres',
  'lfo-066': 'Dušan Vlahović',
  'lfo-067': 'Sergej Milinković-Savić',
  'lfo-068': 'Hakan Çalhanoğlu',
  'lfo-069': 'Arda Güler',
  'lfo-070': 'Andrew Robertson (footballer)',
  'lfo-071': 'Scott McTominay',
  'lfo-072': 'Dominik Szoboszlai',
  'lfo-074': 'Keylor Navas',
  'lfo-077': 'Weston McKennie',
  'lfo-078': 'Yunus Musah',
  'lfo-079': 'Tyler Adams',
  'lfo-080': 'Jonathan David',
  'lfo-081': 'Luis Suárez',
  'lfo-082': 'Zinedine Zidane',
  'lfo-083': 'Johan Cruyff',
  'lfo-084': 'Roberto Carlos (footballer)',
};

async function api(params) {
  const url = `https://en.wikipedia.org/w/api.php?${new URLSearchParams({ format: 'json', origin: '*', ...params })}`;
  const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

async function fetchPlayerImage(title) {
  // Step 1: pageimages — get the infobox image filename + thumbnail URL
  const page = await api({
    action: 'query',
    titles: title,
    prop: 'pageimages|pageprops',
    pithumbsize: '500',
    redirects: 1,
  });
  const pageObj = Object.values(page.query.pages)[0];
  if (!pageObj || !pageObj.thumbnail || !pageObj.pageimage) return null;

  const fileName = pageObj.pageimage;            // e.g. "Lionel_Messi_2018.jpg"
  const thumbUrl = pageObj.thumbnail.source;     // 500px thumbnail URL on upload.wikimedia.org

  // Step 2: imageinfo — verify the license of that file
  const info = await api({
    action: 'query',
    titles: `File:${fileName}`,
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
  });
  const infoPage = Object.values(info.query.pages)[0];
  const ii = infoPage?.imageinfo?.[0];
  if (!ii) return null;

  const licenseRaw =
    ii.extmetadata?.LicenseShortName?.value ||
    ii.extmetadata?.License?.value ||
    '';
  const isFree = FREE_LICENSE_PATTERNS.some(rx => rx.test(licenseRaw));
  if (!isFree) return { thumbUrl, license: licenseRaw, free: false };

  return { thumbUrl, license: licenseRaw, free: true };
}

const cardsPath = path.resolve('data', 'cards.json');
const cardsData = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));
const cardsById = Object.fromEntries(cardsData.cards.map(c => [c.id, c]));

let added = 0;
let skipped = 0;
let missing = 0;

for (const [id, title] of Object.entries(WIKI_TITLES)) {
  if (!cardsById[id]) {
    console.log(`! ${id} not in cards.json, skipping`);
    continue;
  }
  try {
    const res = await fetchPlayerImage(title);
    if (!res) {
      console.log(`✗ ${id}  ${title.padEnd(34)}  no image`);
      missing++;
    } else if (!res.free) {
      console.log(`⚠ ${id}  ${title.padEnd(34)}  non-free (${res.license})`);
      skipped++;
    } else {
      cardsById[id].faceUrl = res.thumbUrl;
      cardsById[id].faceLicense = res.license;
      console.log(`✓ ${id}  ${title.padEnd(34)}  ${res.license}`);
      added++;
    }
  } catch (e) {
    console.log(`! ${id}  ${title}  ERROR ${e.message}`);
    missing++;
  }
  await new Promise(r => setTimeout(r, 120)); // be polite to wikipedia
}

fs.writeFileSync(cardsPath, JSON.stringify(cardsData, null, 2));
console.log(`\nResult: ${added} free photos added, ${skipped} non-free skipped, ${missing} missing.`);
