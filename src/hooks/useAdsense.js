import { useEffect, useRef, useState } from 'react';

const ADSENSE_CLIENT_ID = 'ca-pub-6792429372820465';

function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function isAdsenseReady() {
  return isBrowser() && Array.isArray(window.adsbygoogle);
}

export function useAdsense({ adRef, adSlot, rootMargin = '200px 0px', routeKey = '' } = {}) {
  const initializedRef = useRef(false);
  const observerRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    initializedRef.current = false;
    setIsVisible(false);
  }, [adSlot, routeKey]);

  useEffect(() => {
    if (!isBrowser() || !adRef?.current || !adSlot) return undefined;

    const element = adRef.current;

    if (!('IntersectionObserver' in window)) {
      setIsVisible(true);
      return undefined;
    }

    observerRef.current?.disconnect();
    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true);
          observerRef.current?.disconnect();
          observerRef.current = null;
        }
      },
      { root: null, rootMargin, threshold: 0.01 },
    );

    observerRef.current.observe(element);

    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, [adRef, adSlot, rootMargin, routeKey]);

  useEffect(() => {
    if (!isBrowser() || !isVisible || !adSlot || initializedRef.current) return undefined;

    const element = adRef?.current;
    if (!element || element.dataset.adsbygoogleStatus === 'done') {
      initializedRef.current = true;
      return undefined;
    }

    let attempts = 0;
    let timerId;

    const initialize = () => {
      if (initializedRef.current) return;
      attempts += 1;

      try {
        window.adsbygoogle = window.adsbygoogle || [];
        if (isAdsenseReady()) {
          window.adsbygoogle.push({});
          initializedRef.current = true;
          return;
        }
      } catch {
        initializedRef.current = true;
        return;
      }

      if (attempts < 20) {
        timerId = window.setTimeout(initialize, 250);
      }
    };

    initialize();

    return () => {
      if (timerId) window.clearTimeout(timerId);
    };
  }, [adRef, adSlot, isVisible, routeKey]);

  return {
    clientId: ADSENSE_CLIENT_ID,
    isAdsenseLoaded: isAdsenseReady(),
    isVisible,
    shouldRenderAd: Boolean(adSlot),
  };
}

export { ADSENSE_CLIENT_ID };
