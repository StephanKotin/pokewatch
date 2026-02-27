import React from 'react';

export default function Toggle({ on, onToggle }) {
  return (
    <div
      className={`toggle ${on ? 'on' : ''}`}
      onClick={onToggle}
      role="switch"
      aria-checked={on}
    />
  );
}
