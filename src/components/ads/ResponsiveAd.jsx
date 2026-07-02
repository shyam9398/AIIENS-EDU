import React from 'react';
import AdUnit from './AdUnit.jsx';

export default function ResponsiveAd(props) {
  return (
    <AdUnit
      {...props}
      className={`aiiens-ad-responsive ${props.className || ''}`.trim()}
      minHeight={props.minHeight ?? 140}
      slotEnvName={props.slotEnvName || 'VITE_GOOGLE_ADSENSE_SLOT_RESPONSIVE'}
    />
  );
}
