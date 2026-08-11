import React, { useState, useEffect } from 'react';
import { apiGet } from '../api/poketrace';
import { DETAIL_SERIES } from '../data/grades';
import { getCardImage, getHiResImage } from '../utils/cardImage';
import PriceChart from './PriceChart';
import { fmtD } from '../utils/format';
import './PortfolioCardDetail.css';

const RANGES = [
  { days: 7, label: '7D' },
  { days: 30, label: '30D' },
  { days: 90, label: '90D' },
  { days: 365, label: '1Y' },
];

// Always requests a full year server-side (cached there) so switching the
// range buttons below is a pure client-side reslice of already-fetched
// data — see PriceChart's rangeDays bucketing — not a new network call.
const FETCH_PERIOD = '1y';

function historyParams(item, extra) {
  const p = new URLSearchParams({ name: item.name, period: FETCH_PERIOD, ...extra });
  if (item.set) p.set('set', item.set);
  if (item.edition) p.set('edition', item.edition);
  if (item.number) p.set('number', item.number);
  return p;
}

function toChartPoints(rows) {
  return (rows || []).map((h) => ({ t: h.captured_at * 1000, price: h.price }));
}

// Fetches raw price history plus whichever graded tiers (PSA 10 / PSA 9)
// this specific card actually has data for — a per-card capability check
// via /api/cards/:id/grades, independent of whether this particular copy
// is stored raw or graded, so a raw card's owner can still see how it'd
// compare graded, and vice versa.
function usePriceSeries(item) {
  const [gradeData, setGradeData] = useState({});
  const [availableKeys, setAvailableKeys] = useState(['raw']);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      const rawPromise = apiGet(`/api/price-history?${historyParams(item, { grade: 'nm' })}`).catch(() => []);

      let gradedSeries = [];
      if (item.cardId) {
        try {
          const res = await apiGet(`/api/cards/${encodeURIComponent(item.cardId)}/grades`);
          const options = new Set(res?.gradedOptions || []);
          gradedSeries = DETAIL_SERIES.filter((s) => s.tier && options.has(s.tier));
        } catch {
          gradedSeries = [];
        }
      }

      const [rawHistory, ...gradedHistories] = await Promise.all([
        rawPromise,
        ...gradedSeries.map((s) =>
          apiGet(`/api/price-history?${historyParams(item, { gradeTier: s.tier })}`).catch(() => [])
        ),
      ]);
      if (cancelled) return;

      const data = { raw: toChartPoints(rawHistory) };
      gradedSeries.forEach((s, i) => { data[s.key] = toChartPoints(gradedHistories[i]); });

      setGradeData(data);
      setAvailableKeys(['raw', ...gradedSeries.map((s) => s.key)]);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [item.id]);

  return { gradeData, availableKeys, loading };
}

// PokeTrace's real per-sale listing data (exact date, buyer platform,
// grader) is Scale-plan only — confirmed live, this account (Growth) gets
// a 403 "Scale plan required" on GET /cards/:id/listings. What's actually
// available on this plan, and already fetched for the chart above, is
// daily-aggregated price history — the average of that day's real sales,
// not individual line items. "Recent prices" here means the most recent
// days with sale activity, not a listing-by-listing feed.
const RECENT_PRICE_COUNT = 5;

function formatSaleDate(t) {
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Whichever tier this copy is actually stored/tracked as, falling back to
// raw — drives both the default chart toggle and the recent-prices list,
// so the two stay in sync on a single "primary" series.
function resolvePrimaryKey(card, availableKeys) {
  const storedKey = card.isGraded && card.gradeTier
    ? DETAIL_SERIES.find((s) => s.tier === card.gradeTier)?.key
    : 'raw';
  return availableKeys.includes(storedKey) ? storedKey : 'raw';
}

export default function PortfolioCardDetail({ card, onClose }) {
  const { gradeData, availableKeys, loading } = usePriceSeries(card);
  const [rangeDays, setRangeDays] = useState(30);
  const [activeGrades, setActiveGrades] = useState({ raw: true });

  const primaryKey = resolvePrimaryKey(card, availableKeys);

  useEffect(() => {
    setActiveGrades(Object.fromEntries(availableKeys.map((k) => [k, k === primaryKey])));
  }, [availableKeys, primaryKey]);

  const series = DETAIL_SERIES.filter((s) => availableKeys.includes(s.key));
  const toggleSeries = (key) => setActiveGrades((prev) => ({ ...prev, [key]: !prev[key] }));

  const primarySeries = DETAIL_SERIES.find((s) => s.key === primaryKey);
  const recentPrices = (gradeData[primaryKey] || []).slice(-RECENT_PRICE_COUNT).reverse();

  const image = getCardImage(card);
  const hiRes = getHiResImage(card);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal port-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 className="modal-set-name">{card.name}</h3>
            <p className="modal-set-sub">
              {[card.set, card.number && `#${card.number}`].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body port-detail-body">
          <div className="port-detail-image-col">
            {image ? (
              <img
                className="port-detail-image"
                src={hiRes || image}
                alt={card.name}
                onError={(e) => { if (e.target.src !== image) e.target.src = image; }}
              />
            ) : (
              <div className="port-detail-image-placeholder">?</div>
            )}
            <div className="port-detail-stats">
              <div className="port-detail-stat">
                <span className="port-detail-stat-lbl">Purchase</span>
                <span className="port-detail-stat-val">${fmtD(card.purchasePrice || 0)}</span>
              </div>
              <div className="port-detail-stat">
                <span className="port-detail-stat-lbl">Est. Value</span>
                <span className="port-detail-stat-val">
                  {card.estValue != null ? `$${fmtD(card.estValue)}` : 'No data'}
                </span>
              </div>
              <div className="port-detail-stat">
                <span className="port-detail-stat-lbl">P&amp;L</span>
                <span className={`port-detail-stat-val ${card.pnl == null ? '' : card.pnl >= 0 ? 'up' : 'down'}`}>
                  {card.pnl != null ? `${card.pnl >= 0 ? '+' : ''}$${fmtD(Math.abs(card.pnl))}` : '—'}
                </span>
              </div>
            </div>
          </div>

          <div className="port-detail-chart-col">
            <div className="port-detail-toolbar">
              <div className="port-detail-ranges">
                {RANGES.map((r) => (
                  <button
                    key={r.days}
                    className={`era-btn${rangeDays === r.days ? ' active' : ''}`}
                    onClick={() => setRangeDays(r.days)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <div className="port-detail-series-toggles">
                {DETAIL_SERIES.filter((s) => availableKeys.includes(s.key)).map((s) => {
                  const isActive = !!activeGrades[s.key];
                  return (
                    <button
                      key={s.key}
                      className={`port-series-pill${isActive ? ' active' : ''}`}
                      style={isActive ? { borderColor: s.color, color: s.color } : {}}
                      onClick={() => toggleSeries(s.key)}
                    >
                      <span className="port-series-swatch" style={{ background: s.color }} />
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {loading ? (
              <div className="modal-loading">
                <div className="scan-spinner" />
                Loading price history…
              </div>
            ) : (
              <>
                <PriceChart series={series} gradeData={gradeData} activeGrades={activeGrades} rangeDays={rangeDays} />

                <div className="port-detail-recent">
                  <div className="port-detail-recent-hdr">
                    <span>Recent Prices{primarySeries ? ` · ${primarySeries.label}` : ''}</span>
                    <span className="port-detail-recent-note">Daily avg, PokeTrace</span>
                  </div>
                  {recentPrices.length ? (
                    <ul className="port-detail-recent-list">
                      {recentPrices.map((p) => (
                        <li key={p.t} className="port-detail-recent-row">
                          <span className="port-detail-recent-date">{formatSaleDate(p.t)}</span>
                          <span className="port-detail-recent-price">${fmtD(p.price)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="port-detail-recent-empty">No recent price data.</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
