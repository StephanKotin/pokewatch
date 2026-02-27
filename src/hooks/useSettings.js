import { useState, useCallback } from 'react';

const STORAGE_KEY = 'pokewatch-settings';

function loadSettings() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) return JSON.parse(s);
  } catch (e) {}
  return {};
}

const defaults = {
  demoMode: true,
  tcgApiKey: '',
  alertWebhookUrl: '',
  alertEmail: '',
  lastScan: null,
};

export function useSettings() {
  const [settings, setSettingsState] = useState(() => {
    const stored = loadSettings();
    return { ...defaults, ...stored };
  });

  const updateSettings = useCallback((updates) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...updates };
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            demoMode: next.demoMode,
            tcgApiKey: next.tcgApiKey,
            alertWebhookUrl: next.alertWebhookUrl,
            alertEmail: next.alertEmail,
            lastScan: next.lastScan,
          })
        );
      } catch (e) {}
      return next;
    });
  }, []);

  return { settings, updateSettings };
}
