import { useCallback, useEffect, useState } from 'react';
import * as Location from 'expo-location';
export type Fix = { latitude: number; longitude: number; accuracy: number | null; heading: number | null };
export function useGps() {
  const [fix, setFix] = useState<Fix | null>(null);
  const [permission, setPermission] = useState<'unknown'|'granted'|'denied'>('unknown');
  const [error, setError] = useState<string | null>(null);
  const request = useCallback(async () => {
    try {
      const current = await Location.requestForegroundPermissionsAsync();
      setPermission(current.granted ? 'granted' : 'denied');
      if (!current.granted) setError('Location permission denied. Enable it in device settings.');
    } catch { setPermission('denied'); setError('Unable to request GPS permission.'); }
  }, []);
  useEffect(() => {
    if (permission !== 'granted') return;
    let active = true;
    let subscription: Location.LocationSubscription | undefined;
    Location.watchPositionAsync({
      accuracy: Location.Accuracy.High,
      timeInterval: 2000,
      distanceInterval: 5,
    }, (result) => {
      if (!active) return;
      setFix({ latitude: result.coords.latitude, longitude: result.coords.longitude,
        accuracy: result.coords.accuracy, heading: result.coords.heading });
      setError(null);
    }).then(s => { if (active) subscription = s; else s.remove(); })
      .catch(() => { if (active) setError('GPS unavailable. Check device location services.'); });
    return () => { active = false; subscription?.remove(); };
  }, [permission]);
  return { fix, permission, error, request };
}
