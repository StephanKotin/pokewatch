#!/usr/bin/env node
/**
 * Downloads card data from PokemonTCG/pokemon-tcg-data GitHub repo
 * and generates a compact static JSON database for the app.
 *
 * Set IDs come directly from src/data/sets.js (ALL_SETS) rather than a
 * separately hand-maintained list, so this can't silently drift out of
 * sync with the set metadata the app actually browses by.
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

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

async function main() {
  const { ALL_SETS } = await import('../src/data/sets.js');
  const enSetIds = ALL_SETS.map((s) => s.id);

  const db = {};
  let downloaded = 0;
  let missed = 0;
  const missedIds = [];

  for (const setId of enSetIds) {
    const fileName = SET_ID_TO_FILE[setId] || setId;
    const url = `${REPO_BASE}/${fileName}.json`;
    process.stdout.write(`Fetching ${setId} (${fileName})...`);

    const cards = await fetchJSON(url);
    if (!cards) {
      console.log(' MISS');
      missed++;
      missedIds.push(setId);
      continue;
    }

    // Store compact card data: id, name, number, rarity
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
  if (missedIds.length) console.log(`Missed: ${missedIds.join(', ')}`);
  console.log(`Output: ${outPath} (${sizeMB} MB)`);
}

main().catch(e => { console.error(e); process.exit(1); });
