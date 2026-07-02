import React from 'react';
import AdUnit from './AdUnit.jsx';

export default function BannerAd(props) {
  return (
    <AdUnit
      {...props}
      className={`aiiens-ad-banner ${props.className || ''}`.trim()}
      minHeight={props.minHeight ?? 120}
      slotEnvName={props.slotEnvName || 'VITE_GOOGLE_ADSENSE_SLOT_BANNER'}
    />
  );
}
