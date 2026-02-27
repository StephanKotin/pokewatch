#!/usr/bin/env node
/**
 * Downloads card data from PokemonTCG/pokemon-tcg-data GitHub repo
 * and generates a compact static JSON database for the app.
 *
 * Usage: node scripts/build-card-db.js
 * Output: src/data/cards.json
 */

const fs = require('fs');
const path = require('path');

const REPO_BASE = 'https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/cards/en';

// Map our app set IDs to repo file names where they differ
const SET_ID_TO_FILE = {
  fossil: 'base3',
  jungle: 'base2',
};

// All EN set IDs from our app (src/data/sets.js)
const EN_SET_IDS = [
  'sv9pt5','sv9','sv8pt5','sv8','sv7','sv6pt5','sv6','sv5','sv4pt5','sv4','sv3pt5','sv3','sv2','sv1',
  'swsh12pt5','swsh12','swsh11','swsh10','swsh9','swsh8','cel25','swsh7','swsh6','swsh5','swsh45','swsh4','swsh35','swsh3','swsh2','swsh1',
  'sm12','sm115','sm11','sm10','sm9','sm8','sm75','sm7','sm6','sm5','sm45','sm4','sm3','sm2','sm1',
  'xy12','xy11','xy10','xy9','xy8','xy75','xy7','xy6','xy4','xy3','xy2','xy1',
  'bw11','bw10','bw9','bw8','bw7','bw6','bw5','bw4','bw3','bw2','bw1',
  'col1','hgss4','hgss3','hgss2','hgss1',
  'pl4','pl3','pl2','pl1','dp7','dp6','dp5','dp4','dp3','dp2','dp1',
  'ex16','ex15','ex14','ex13','ex12','ex11','ex10','ex9','ex8','ex7','ex6','ex5','ex4','ex3','ex2','ex1',
  'ecard3','ecard2','ecard1',
  'neo4','neo3','neo2','neo1',
  'gym2','gym1',
  'base6','base5','base4','fossil','jungle','base1',
];

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

async function main() {
  const db = {};
  let downloaded = 0;
  let missed = 0;

  for (const setId of EN_SET_IDS) {
    const fileName = SET_ID_TO_FILE[setId] || setId;
    const url = `${REPO_BASE}/${fileName}.json`;
    process.stdout.write(`Fetching ${setId} (${fileName})...`);

    const cards = await fetchJSON(url);
    if (!cards) {
      console.log(' MISS');
      missed++;
      continue;
    }

    // Store compact card data: [name, number, rarity]
    // Cards are keyed by set ID in the app
    db[setId] = cards.map(c => ({
      id: c.id,
      name: c.name,
      number: c.number,
      rarity: c.rarity || '',
    }));

    console.log(` ${cards.length} cards`);
    downloaded++;

    // Small delay to be polite to GitHub
    await new Promise(r => setTimeout(r, 100));
  }

  const outPath = path.join(__dirname, '..', 'src', 'data', 'cards.json');
  fs.writeFileSync(outPath, JSON.stringify(db));

  const sizeMB = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
  console.log(`\nDone! ${downloaded} sets downloaded, ${missed} missed.`);
  console.log(`Output: ${outPath} (${sizeMB} MB)`);
}

main().catch(e => { console.error(e); process.exit(1); });
