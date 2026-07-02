import React from 'react';
import AdUnit from './AdUnit.jsx';

export default function SquareAd(props) {
  return (
    <AdUnit
      {...props}
      className={`aiiens-ad-square ${props.className || ''}`.trim()}
      minHeight={props.minHeight ?? 250}
      slotEnvName={props.slotEnvName || 'VITE_GOOGLE_ADSENSE_SLOT_SQUARE'}
      style={{ maxWidth: 336, ...props.style }}
    />
  );
}
