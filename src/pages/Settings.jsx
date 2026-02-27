import React, { useState } from 'react';
import Toggle from '../components/Toggle';
import './Settings.css';

export default function Settings({ settings, updateSettings, onClearData, onExportData, toast }) {
  const [apiKey, setApiKey] = useState(settings.tcgApiKey || '');
  const [demoMode, setDemoMode] = useState(settings.demoMode || false);
  const [scanInterval, setScanInterval] = useState(settings.scanInterval || 0);
  const [soundAlerts, setSoundAlerts] = useState(settings.soundAlerts || false);
  const [browserNotifs, setBrowserNotifs] = useState(settings.browserNotifications || false);
  const [includeAuctions, setIncludeAuctions] = useState(settings.includeAuctions !== false);
  const [usOnly, setUsOnly] = useState(settings.usOnly || false);
  const [freeShipping, setFreeShipping] = useState(settings.freeShipping || false);

  function handleSaveSettings() {
    updateSettings({
      tcgApiKey: apiKey,
      demoMode,
    });
    if (toast) toast('Settings saved');
  }

  function handleSaveScan() {
    updateSettings({
      scanInterval,
      soundAlerts,
      browserNotifications: browserNotifs,
      includeAuctions,
    });
    if (toast) toast('Scan settings saved');
  }

  function handleSaveFilters() {
    updateSettings({
      usOnly,
      freeShipping,
    });
    if (toast) toast('Filter settings saved');
  }

  function handleBrowserNotifs(val) {
    if (val && 'Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission().then(perm => {
        setBrowserNotifs(perm === 'granted');
      });
    } else {
      setBrowserNotifs(val);
    }
  }

  return (
    <div className="settings-page">
      <div className="settings-grid">
        {/* Price Data Config */}
        <div className="settings-panel">
          <h3>Price Data Config</h3>

          <div className="setting-row">
            <div>
              <div className="setting-label">Data Source</div>
              <div className="setting-desc">Poketrace API connection</div>
            </div>
            <span className="connected-badge">Connected</span>
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-label">TCG API Key</div>
              <div className="setting-desc">Optional key for enhanced data</div>
            </div>
            <input
              type="password"
              className="input"
              placeholder="Enter API key..."
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
            />
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-label">Demo Mode</div>
              <div className="setting-desc">Use sample data instead of live API</div>
            </div>
            <Toggle checked={demoMode} onChange={setDemoMode} />
          </div>

          <button className="btn btn-primary" onClick={handleSaveSettings}>
            Save Settings
          </button>
        </div>

        {/* Scan Settings */}
        <div className="settings-panel">
          <h3>Scan Settings</h3>

          <div className="setting-row">
            <div>
              <div className="setting-label">Auto-Scan Interval</div>
              <div className="setting-desc">How often to check for new listings</div>
            </div>
            <select
              className="input"
              value={scanInterval}
              onChange={e => setScanInterval(Number(e.target.value))}
            >
              <option value={0}>Manual Only</option>
              <option value={5}>Every 5 minutes</option>
              <option value={15}>Every 15 minutes</option>
              <option value={30}>Every 30 minutes</option>
              <option value={60}>Every 60 minutes</option>
            </select>
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-label">Sound Alerts</div>
              <div className="setting-desc">Play a sound when new deals are found</div>
            </div>
            <Toggle checked={soundAlerts} onChange={setSoundAlerts} />
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-label">Browser Notifications</div>
              <div className="setting-desc">Show desktop notifications for alerts</div>
            </div>
            <Toggle checked={browserNotifs} onChange={handleBrowserNotifs} />
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-label">Include Auctions</div>
              <div className="setting-desc">Show auction listings in scan results</div>
            </div>
            <Toggle checked={includeAuctions} onChange={setIncludeAuctions} />
          </div>

          <button className="btn btn-primary" onClick={handleSaveScan}>
            Save Scan Settings
          </button>
        </div>

        {/* Filters */}
        <div className="settings-panel">
          <h3>Filters</h3>

          <div className="setting-row">
            <div>
              <div className="setting-label">US Sellers Only</div>
              <div className="setting-desc">Only show listings from US-based sellers</div>
            </div>
            <Toggle checked={usOnly} onChange={setUsOnly} />
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-label">Free Shipping Only</div>
              <div className="setting-desc">Only show listings with free shipping</div>
            </div>
            <Toggle checked={freeShipping} onChange={setFreeShipping} />
          </div>

          <button className="btn btn-primary" onClick={handleSaveFilters}>
            Save Filters
          </button>
        </div>

        {/* Data Management */}
        <div className="settings-panel">
          <h3>Data</h3>

          <div className="setting-row">
            <div>
              <div className="setting-label">Export Data</div>
              <div className="setting-desc">Download watchlist and settings as JSON</div>
            </div>
            <button className="btn btn-secondary" onClick={onExportData}>
              Export
            </button>
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-label">Clear All Data</div>
              <div className="setting-desc">Remove all watchlist cards, listings, and settings</div>
            </div>
            <button className="btn btn-danger" onClick={onClearData}>
              Clear Data
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
