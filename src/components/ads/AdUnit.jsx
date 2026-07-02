import React, { useRef } from 'react';
import { ADSENSE_CLIENT_ID, useAdsense } from '../../hooks/useAdsense.js';

function getEnvSlot(name) {
  return import.meta.env?.[name] || import.meta.env?.VITE_GOOGLE_ADSENSE_SLOT || '';
}

export default function AdUnit({
  adSlot,
  className = '',
  format = 'auto',
  layout = '',
  minHeight = 120,
  responsive = true,
  routeKey = '',
  slotEnvName = '',
  style,
}) {
  const insRef = useRef(null);
  const resolvedSlot = adSlot || (slotEnvName ? getEnvSlot(slotEnvName) : '');
  const { shouldRenderAd } = useAdsense({
    adRef: insRef,
    adSlot: resolvedSlot,
    routeKey,
  });

  if (!shouldRenderAd) return null;

  return (
    <div
      className={`aiiens-ad-slot ${className}`.trim()}
      aria-label="Advertisement"
      style={{ minHeight, ...style }}
    >
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={ADSENSE_CLIENT_ID}
        data-ad-slot={resolvedSlot}
        data-ad-format={format}
        data-ad-layout={layout || undefined}
        data-full-width-responsive={responsive ? 'true' : 'false'}
      />
    </div>
  );
}
