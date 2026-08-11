import { TCG_CDN } from '../api/poketrace';

// Falls back to constructing a pokemontcg.io CDN URL from setId+number for
// pre-migration rows that don't have a stored `image` (see catalogue-sync
// skill) — current rows always have a real PokeTrace image URL already.
export function getCardImage(item) {
  if (item.image) return item.image;
  if (item.setId && item.number) return `${TCG_CDN}/${item.setId}/${item.number}.png`;
  return null;
}

// pokemontcg.io serves a sharper "_hires" variant at the same path for most
// cards; falls back to the regular image (via onError) if one doesn't exist.
export function getHiResImage(item) {
  const img = getCardImage(item);
  return img ? img.replace(/\.png$/, '_hires.png') : null;
}
