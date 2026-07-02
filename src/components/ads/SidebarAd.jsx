import React from 'react';
import AdUnit from './AdUnit.jsx';

export default function SidebarAd(props) {
  return (
    <AdUnit
      {...props}
      className={`aiiens-ad-sidebar ${props.className || ''}`.trim()}
      minHeight={props.minHeight ?? 250}
      slotEnvName={props.slotEnvName || 'VITE_GOOGLE_ADSENSE_SLOT_SIDEBAR'}
    />
  );
}
