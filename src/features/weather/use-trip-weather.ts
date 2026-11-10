import {useCallback, useState} from 'react';
import {AppState} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {useAuth} from '@/features/auth/auth-context';
import {getSupabase} from '@/lib/supabase';
import {backendLifecycle} from '@/lib/request-lifecycle';
import {USE_DEMO_DATA} from '@/constants/app';
import type {TripPlan} from '@/types/travel';
import {findTripLocation} from '@/features/trips/trip-locations';
import {weatherAvailability, type TripWeather} from '../../../shared/trip-weather';

export function useTripWeather(trip: TripPlan) {
  const {session} = useAuth();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{data: TripWeather | null; error: boolean}>({data: null, error: false});
  const place = trip.mode === 'planned' ? trip.destination : trip.travelArea;
  const message = weatherAvailability(trip.startDate, trip.endDate);
  const localState = message ?? (['region', 'country'].includes(place.place?.kind ?? findTripLocation(place.locationId)?.kind ?? '') ? 'area' : null);
  const userId = session?.user.id;
  const tripId = trip.id;
  useFocusEffect(useCallback(() => {
    if (localState || USE_DEMO_DATA || !userId) return;
    let current = true;
    let controller: AbortController;
    const load = async () => {
      controller?.abort(); controller = new AbortController();
      const pending = controller;
      const boundary = backendLifecycle.capture();
      setResult({data: null, error: false});
      try {
        const response = await getSupabase().functions.invoke('trip-weather', {body: {tripId}, signal: pending.signal});
        boundary.assertCurrent();
        if (!current || pending.signal.aborted) return;
        const data = response.data as TripWeather | null;
        if (response.error || !data || !['future', 'past', 'needs_dates', 'needs_location', 'area', 'unavailable', 'forecast'].includes(data.state) ||
          (data.state === 'forecast' && (!Array.isArray(data.days) || !data.days.length || !Array.isArray(data.alerts)))) throw Error('Weather unavailable');
        setResult({data, error: false});
      } catch {if (current && !pending.signal.aborted) setResult({data: null, error: true});}
    };
    void load();
    const subscription = AppState.addEventListener('change', state => {if (state === 'active') void load();});
    const timer = setInterval(() => {if (AppState.currentState === 'active') void load();}, 10 * 60 * 1000);
    return () => {current = false; controller?.abort(); subscription.remove(); clearInterval(timer);};
    // The retry counter deliberately restarts the focused request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, tripId, localState, attempt]));
  return {data: localState ? {state: localState} as TripWeather : USE_DEMO_DATA ? {state: 'unavailable'} as TripWeather : result.data,
    error: !localState && result.error, retry: () => setAttempt(value => value + 1)};
}
