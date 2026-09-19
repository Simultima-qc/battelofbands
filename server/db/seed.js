'use strict';

const path = require('path');
const { initializeStore, getStore, closeStore } = require('./store');

const ARTISTS = require(path.join(__dirname, '../data/artists.json'));

async function seed() {
  await initializeStore();
  try {
    const result = await getStore().seedArtists(ARTISTS);
    console.log(`[Seed] Canonical artist catalog ready. Total in DB: ${result.total}`);
    return result;
  } finally {
    await closeStore();
  }
}

if (require.main === module) {
  seed().catch((error) => {
    console.error('[Seed]', error);
    process.exitCode = 1;
  });
}

module.exports = { seed };
