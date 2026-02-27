import React, { useState } from 'react';
import Toggle from '../components/Toggle';
import { fmt, fmtD, timeAgo } from '../utils/format';
import './Alerts.css';

export default function Alerts({ watchlist, firedAlerts, clearAlert, settings, updateSettings, toast }) {
  const [webhookUrl, setWebhookUrl] = useState(settings.alertWebhookUrl || '');
  const [email, setEmail] = useState(settings.alertEmail || '');
  const [banners, setBanners] = useState(settings.alertBanners !== false);
  const [emailEnabled, setEmailEnabled] = useState(!!settings.alertEmail);

  const alertCards = (watchlist || []).filter(c => c.maxPrice);

  const firedList = Object.entries(firedAlerts || {})
    .map(([key, alert]) => ({ key, ...alert }))
    .sort((a, b) => new Date(b.firedAt) - new Date(a.firedAt));

  function handleSave() {
    updateSettings({
      alertWebhookUrl: webhookUrl,
      alertEmail: emailEnabled ? email : '',
      alertBanners: banners,
    });
    if (toast) toast('Alert settings saved');
  }

  return (
    <div className="alerts-page">
      {/* Alert Configuration */}
      <div className="alert-config-panel">
        <h3 className="port-section-hdr">Alert Configuration</h3>

        <div className="setting-row">
          <div>
            <div className="setting-label">In-App Banners</div>
            <div className="setting-desc">Show banner notifications within the app</div>
          </div>
          <Toggle checked={banners} onChange={setBanners} />
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">Email / Webhook Alerts</div>
            <div className="setting-desc">Send alerts to external services</div>
          </div>
          <Toggle checked={emailEnabled} onChange={setEmailEnabled} />
        </div>

        {emailEnabled && (
          <>
            <div className="setting-row">
              <div>
                <div className="setting-label">Webhook URL</div>
                <div className="setting-desc">Discord or Slack webhook endpoint</div>
              </div>
              <input
                type="url"
                className="input"
                placeholder="https://discord.com/api/webhooks/..."
                value={webhookUrl}
                onChange={e => setWebhookUrl(e.target.value)}
              />
            </div>

            <div className="setting-row">
              <div>
                <div className="setting-label">Email Address</div>
                <div className="setting-desc">Receive email notifications</div>
              </div>
              <input
                type="email"
                className="input"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
          </>
        )}

        <button className="btn btn-primary" onClick={handleSave}>Save Alert Settings</button>
      </div>

      {/* Active Price Alerts */}
      <div className="alerts-section">
        <h3 className="port-section-hdr">Active Price Alerts</h3>
        {alertCards.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🔔</div>
            <p>No price alerts configured. Set a max price on a watchlist card to create an alert.</p>
          </div>
        ) : (
          <div className="alert-list">
            {alertCards.map(card => {
              const alertKey = Object.keys(firedAlerts || {}).find(k => k.includes(`-${card.id}-`));
              const hasFired = !!alertKey;

              return (
                <div key={card.id} className={`alert-card${hasFired ? ' fired' : ' watching'}`}>
                  <span className={`alert-dot ${hasFired ? 'sent' : 'watching'}`} />
                  <div className="alert-info">
                    <div className="alert-name">{card.name}</div>
                    <div className="alert-desc">
                      {card.condition || 'Any condition'}
                    </div>
                    <div className="alert-threshold">
                      Threshold: ${fmtD(card.maxPrice)}
                    </div>
                  </div>
                  <div className="alert-actions">
                    {hasFired ? (
                      <button className="btn btn-secondary" onClick={() => clearAlert(alertKey)}>
                        Reset
                      </button>
                    ) : (
                      <span className="alert-status-label">Watching</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Alert History */}
      <div className="alerts-section">
        <h3 className="port-section-hdr">Alert History</h3>
        {firedList.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📜</div>
            <p>No alerts have fired yet.</p>
          </div>
        ) : (
          <div className="alert-list">
            {firedList.map(alert => (
              <div key={alert.key} className="alert-card fired">
                <div className="alert-info">
                  <div className="alert-name">{alert.cardName}</div>
                  <div className="alert-desc">{alert.title}</div>
                  <div className="alert-threshold">
                    {fmt(alert.price)} &middot; {timeAgo(alert.firedAt)}
                  </div>
                </div>
                <a
                  className="btn btn-view"
                  href={alert.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
