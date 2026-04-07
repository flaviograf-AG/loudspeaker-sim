import { useEffect } from 'react';
import type { DesignStateV2 } from '../types';

export function useUrlSync(design: DesignStateV2) {
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const json = JSON.stringify(design);
        const encoded = btoa(unescape(encodeURIComponent(json)));
        history.replaceState(null, '', '#v2=' + encoded);
      } catch { /* ignore encoding errors */ }
    }, 500);
    return () => clearTimeout(timer);
  }, [design]);
}

export function decodeFromUrl(): DesignStateV2 | null {
  const hash = location.hash;
  if (!hash || hash.length < 5) return null;

  // New v2 format
  if (hash.startsWith('#v2=')) {
    try {
      const json = decodeURIComponent(escape(atob(hash.slice(4))));
      const parsed = JSON.parse(json);
      if (parsed.version === 2) return parsed;
    } catch { /* fall through */ }
  }

  // Legacy formats — ignore, show setup wizard
  return null;
}
