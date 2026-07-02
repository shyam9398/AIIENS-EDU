import React from 'react';
import AdUnit from './AdUnit.jsx';

export default function InArticleAd(props) {
  return (
    <AdUnit
      {...props}
      className={`aiiens-ad-in-article ${props.className || ''}`.trim()}
      format={props.format || 'fluid'}
      layout={props.layout || 'in-article'}
      minHeight={props.minHeight ?? 180}
      slotEnvName={props.slotEnvName || 'VITE_GOOGLE_ADSENSE_SLOT_IN_ARTICLE'}
    />
  );
}
