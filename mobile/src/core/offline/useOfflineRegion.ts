import { useCallback, useEffect, useRef, useState } from 'react';
import { OfflineManager } from '@maplibre/maplibre-react-native';
import { CARBONEAR_BOUNDS, DOWNLOAD_ZOOM, OFFLINE_STYLE_URL, REGION_ID } from './regions';

type Phase = 'checking'|'not-downloaded'|'downloading'|'downloaded'|'error';
type Status = { state?: string; completedResourceCount?: number; requiredResourceCount?: number;
  completedResourceSize?: number; requiredResourceCountIsPrecise?: boolean };
export function useOfflineRegion() {
  const [phase, setPhase] = useState<Phase>('checking');
  const [percent, setPercent] = useState(0);
  const [notice, setNotice] = useState('');
  const alive = useRef(true);
  const packId = useRef<string | null>(null);
  useEffect(() => {
    alive.current = true;
    OfflineManager.getPacks().then(packs => {
      if (!alive.current) return;
      const match = packs.find(p => (p.metadata as { regionId?: string } | undefined)?.regionId === REGION_ID);
      packId.current = match?.id ?? null;
      if (!match) { setPhase('not-downloaded'); return; }
      match.status().then(status => {
        if (!alive.current) return;
        setPhase(status.state === 'complete' ? 'downloaded' : 'not-downloaded');
        if (status.state !== 'complete') setNotice('A previous download is incomplete. Remove it before downloading again.');
      }).catch(() => { if (alive.current) setPhase('error'); });
    }).catch(() => { if (alive.current) { setPhase('error'); setNotice('Unable to inspect offline map storage.'); } });
    return () => { alive.current = false; };
  }, []);
  const download = useCallback(async () => {
    if (phase === 'downloading') return;
    setPhase('downloading'); setPercent(0); setNotice('Downloading Carbonear test map…');
    try {
      if (packId.current) { await OfflineManager.deletePack(packId.current); packId.current = null; }
      // The raster/symbol resources cached by this source style must match the
      // vector tile and glyph URLs in our custom local style (see README).
      const pack = await OfflineManager.createPack({
        mapStyle: OFFLINE_STYLE_URL,
        bounds: CARBONEAR_BOUNDS,
        minZoom: DOWNLOAD_ZOOM.minZoom,
        maxZoom: DOWNLOAD_ZOOM.maxZoom,
        metadata: { regionId: REGION_ID, label: 'Carbonear test area' },
      }, (_region, status) => {
        if (!alive.current) return;
        const s = status as Status;
        if (s.requiredResourceCount && s.requiredResourceCount > 0) {
          setPercent(Math.min(100, Math.floor(100 * (s.completedResourceCount ?? 0) / s.requiredResourceCount)));
        }
        if (s.state === 'complete') { setPercent(100); setPhase('downloaded'); setNotice('Map download completed. Test in airplane mode.'); }
      }, (_region, error) => {
        if (!alive.current) return;
        setPhase('error'); setNotice(`Download error: ${String(error)}`);
      });
      packId.current = pack.id;
      // Completion may follow createPack; inspect status on next app launch as well.
    } catch(e) {
      setPhase('error'); setNotice(`Unable to download: ${String(e)}`);
    }
  }, [phase]);
  const remove = useCallback(async () => {
    if (!packId.current) return;
    try { await OfflineManager.deletePack(packId.current); packId.current = null;
      setPercent(0); setPhase('not-downloaded'); setNotice('Offline map removed.');
    } catch { setNotice('Unable to remove offline map.'); }
  }, []);
  return { phase, percent, notice, download, remove };
}
