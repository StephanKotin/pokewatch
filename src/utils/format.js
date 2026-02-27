// fmt: input cents -> human dollars
export function fmt(cents) {
  if (cents == null) return '—';
  const d = cents / 100;
  if (d >= 1000000) return (d / 1000000).toFixed(2) + 'M';
  if (d >= 10000) return (d / 1000).toFixed(1) + 'k';
  if (d >= 1000) return (d / 1000).toFixed(2) + 'k';
  return d.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

// fmtD: input dollars
export function fmtD(dollars) {
  if (dollars == null) return '—';
  if (dollars >= 1000000) return (dollars / 1000000).toFixed(2) + 'M';
  if (dollars >= 1000) return (dollars / 1000).toFixed(1) + 'k';
  return dollars.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function rarityClass(rarity) {
  if (!rarity) return '';
  const r = rarity.toLowerCase();
  if (r.includes('secret') || r.includes('special illustration') || r.includes('hyper'))
    return 'secret';
  if (
    r.includes('ultra') ||
    r.includes('v max') ||
    r.includes('vmax') ||
    r.includes('full art') ||
    r.includes('rainbow') ||
    r.includes('alternate')
  )
    return 'ultra';
  if (r.includes('holo') || r.includes('rare holo')) return 'holo';
  if (r.includes('illustration') || r.includes('shiny')) return 'special';
  return '';
}
