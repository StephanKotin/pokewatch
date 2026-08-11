import React from 'react';
import './WelcomeSplash.css';

const FEATURES = [
  {
    icon: '\u{1F4BC}',
    title: 'Portfolio',
    text: 'Track the cards you own — raw or graded — with live pricing pulled straight from PokeTrace.',
  },
  {
    icon: '⭐',
    title: 'Watchlist',
    text: "Save cards you're hunting for and set a target price you'd want to buy at.",
  },
  {
    icon: '\u{1F4D6}',
    title: 'Catalogue',
    text: 'Browse every set, grouped by era, and add cards straight to your Watchlist or Portfolio.',
  },
  {
    icon: '\u{1F4E1}',
    title: 'Live Listings',
    text: 'Scan real marketplace listings for anything on your Watchlist.',
  },
  {
    icon: '\u{1F514}',
    title: 'Alerts',
    text: 'Get notified the moment a watched card drops to your target price.',
  },
];

export default function WelcomeSplash({ onDismiss }) {
  return (
    <div className="welcome-overlay">
      <div className="welcome-card">
        <div className="welcome-topbar" />
        <div className="welcome-logo">
          Poke<span>Watch</span> &#128064;
        </div>
        <h2 className="welcome-title">Welcome!</h2>
        <p className="welcome-sub">Here&rsquo;s what you can do</p>

        <ul className="welcome-features">
          {FEATURES.map((f) => (
            <li key={f.title}>
              <span className="welcome-feature-icon">{f.icon}</span>
              <span>
                <strong>{f.title}</strong> &mdash; {f.text}
              </span>
            </li>
          ))}
        </ul>

        <button className="btn btn-primary welcome-cta" onClick={onDismiss}>
          Let&rsquo;s Go
        </button>
      </div>
    </div>
  );
}
