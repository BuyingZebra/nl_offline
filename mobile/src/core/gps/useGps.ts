import { useCallback, useEffect, useState } from 'react';
import * as Location from 'expo-location';

export type Fix = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
};

// Foreground location only. GPS does not require a network once the device
// has acquired a fix. Do not infer a coordinate when permission is missing.
export function useGps() {
  const [fix, setFix] = useState<Fix | null>(null);
  const [permission, setPermission] = useState<'unknown'|'granted'|'denied'>('unknown');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    Location.getForegroundPermissionsAsync()
      .then(value => {
        if (mounted && value.granted) setPermission('granted');
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  const request = useCallback(async (): Promise<boolean> => {
    try {
      const current = await Location.requestForegroundPermissionsAsync();
      setPermission(current.granted ? 'granted' : 'denied');
      if (!current.granted) {
        setError('Location permission denied. Enable it in device settings.');
      } else {
        setError(null);
      }
      return current.granted;
    } catch {
      setPermission('denied');
      setError('Unable to request GPS permission.');
      return false;
    }
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
      const c = result.coords;
      if (!Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) return;
      setFix({
        latitude: c.latitude,
        longitude: c.longitude,
        accuracy: c.accuracy,
        heading: c.heading,
      });
      setError(null);
    }).then(s => { if (active) subscription = s; else s.remove(); })
      .catch(() => {
        if (active) setError('GPS unavailable. Check device location services.');
      });
    return () => { active = false; subscription?.remove(); };
  }, [permission]);

  return { fix, permission, error, request };
}
