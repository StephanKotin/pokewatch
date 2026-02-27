import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPut } from '../api/poketrace';

const defaults = {
  alertWebhookUrl: '',
  alertEmail: '',
  lastScan: null,
  scanInterval: 0,
  soundAlerts: false,
  browserNotifications: false,
  includeAuctions: true,
  usOnly: false,
  freeShipping: false,
};

export function useSettings() {
  const [settings, setSettingsState] = useState(defaults);

  useEffect(() => {
    apiGet('/api/settings')
      .then((data) => setSettingsState((prev) => ({ ...prev, ...data })))
      .catch((e) => console.warn('Failed to load settings:', e.message));
  }, []);

  const updateSettings = useCallback((updates) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...updates };
      apiPut('/api/settings', updates).catch((e) =>
        console.warn('Failed to save settings:', e.message)
      );
      return next;
    });
  }, []);

  return { settings, updateSettings };
}
