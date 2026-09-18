'use strict';

const MVP_BRACKET_SIZE = 16;

function normalizeArtistName(name) {
  return String(name || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function dedupeArtistsByName(artists) {
  const seen = new Set();
  const unique = [];

  for (const artist of artists) {
    const key = normalizeArtistName(artist?.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(artist);
  }

  return unique;
}

function weightedSampleWithoutReplacement(artists, count, random = Math.random) {
  const unique = dedupeArtistsByName(artists);
  if (unique.length < count) {
    throw new RangeError(`Need at least ${count} unique artists; got ${unique.length}.`);
  }

  return unique
    .map((artist) => {
      const weight = Math.max(1, Number(artist.popularity) || 1);
      const u = Math.min(1 - Number.EPSILON, Math.max(Number.MIN_VALUE, random()));
      return {
        artist,
        key: Math.pow(u, 1 / weight),
      };
    })
    .sort((a, b) => b.key - a.key)
    .slice(0, count)
    .map(({ artist }) => artist);
}

module.exports = {
  MVP_BRACKET_SIZE,
  normalizeArtistName,
  dedupeArtistsByName,
  weightedSampleWithoutReplacement,
};
