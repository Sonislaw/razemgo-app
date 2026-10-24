import {
  createContext, useCallback, useContext, useEffect, useReducer, useRef, useState,
  type Dispatch, type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { DEMO_OWN_TRIPS } from '@/data/mocks/owned-trips';
import { USE_DEMO_DATA } from '@/constants/app';
import { useAuth } from '@/features/auth/auth-context';
import { useProfile } from '@/features/profile/profile-context';
import type { OwnTripsState, TripForm } from '@/types/owned-trip';
import {
  createOwnTripsState, getTripStatus, ownTripsReducer, todayDate, validateTripForm,
  type OwnTripsAction,
} from './own-trips-state';
import { duplicateTrip, fetchOwnTrips, persistTrip, persistTripStatus, removeTrip, tripErrorMessage } from './trip-repository';

export type TripMutation = Extract<OwnTripsAction, { type: 'status' | 'duplicate' | 'delete' }>;
interface MutationResult { id?: string; errors: string[] }
interface OwnTripsContextValue {
  state: OwnTripsState;
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  hasLoaded: boolean;
  isSaving: boolean;
  refresh: () => Promise<void>;
  dispatch: Dispatch<OwnTripsAction>;
  saveTrip: (form: TripForm, id?: string, draft?: boolean, requestKey?: string) => Promise<MutationResult>;
  mutateTrip: (action: TripMutation) => Promise<MutationResult>;
}
const OwnTripsContext = createContext<OwnTripsContextValue | null>(null);
export function OwnTripsProvider({ children }: { children: ReactNode }) {
  const [state, commit] = useReducer(ownTripsReducer, USE_DEMO_DATA ? DEMO_OWN_TRIPS : [], createOwnTripsState);
  const { session } = useAuth();
  const { hasProfile, status: profileStatus, profile } = useProfile();
  const userId = session?.user.id;
  const [status, setStatus] = useState<OwnTripsContextValue['status']>(USE_DEMO_DATA ? 'ready' : 'loading');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setSaving] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(USE_DEMO_DATA);
  const alive = useRef(true);
  const busy = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  const refresh = useCallback(async () => {
    if (USE_DEMO_DATA || !userId || !hasProfile || profileStatus !== 'ready' || busy.current) return;
    const request = ++generation.current;
    setStatus('loading');
    setError(null);
    try {
      const trips = await fetchOwnTrips();
      if (!alive.current || generation.current !== request) return;
      commit({ type: 'hydrate', trips });
      setHasLoaded(true);
      setStatus('ready');
    } catch {
      if (!alive.current || generation.current !== request) return;
      setStatus('error');
      setError('Nie udało się pobrać wyjazdów. Sprawdź połączenie i spróbuj ponownie.');
    }
  }, [userId, hasProfile, profileStatus]);
  useEffect(() => {
    void Promise.resolve().then(refresh);
    const subscription = AppState.addEventListener('change', value => {
      if (value === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  async function run(action: OwnTripsAction, requestKey?: string): Promise<MutationResult> {
    if (busy.current) return { errors: ['Zapis już trwa. Poczekaj chwilę.'] };
    if (status !== 'ready') return { errors: ['Najpierw odśwież i wczytaj swoje wyjazdy.'] };
    if (!USE_DEMO_DATA && !userId) return { errors: ['Zaloguj się ponownie.'] };
    busy.current = true;
    generation.current++;
    setSaving(true);
    try {
      if (USE_DEMO_DATA) {
        const next = ownTripsReducer(state, action);
        if (next === state) return { errors: ['Nie można teraz zmienić tego wyjazdu.'] };
        commit(action);
        return { id: next.lastSavedId, errors: [] };
      }
      if (action.type === 'delete') {
        await removeTrip(action.id);
        if (!alive.current) return { errors: ['Sesja uległa zmianie.'] };
        commit({ type: 'removed', id: action.id });
        return { errors: [] };
      }
      const saved = action.type === 'save'
        ? await persistTrip(action.form, action.id, action.draft, requestKey)
        : action.type === 'status'
          ? await persistTripStatus(action.id, action.status)
          : action.type === 'duplicate'
            ? await duplicateTrip(action.id)
            : undefined;
      if (!saved) return { errors: ['Nieobsługiwana operacja.'] };
      if (!alive.current) return { errors: ['Sesja uległa zmianie.'] };
      commit({ type: 'persisted', trip: saved });
      return { id: saved.id, errors: [] };
    } catch (cause) {
      return { errors: [tripErrorMessage(cause, 'Nie udało się zapisać zmiany. Sprawdź połączenie i spróbuj ponownie.')] };
    } finally {
      busy.current = false;
      if (alive.current) setSaving(false);
    }
  }
  const saveTrip: OwnTripsContextValue['saveTrip'] = async (form, id, draft = false, requestKey) => {
    const today = todayDate();
    const existing = state.trips.find(trip => trip.id === id);
    const errors = draft ? [] : validateTripForm(form);
    if (id && !existing) errors.push('Ten wyjazd jest niedostępny. Odśwież listę wyjazdów.');
    if (!draft && (!existing || !['completed','cancelled'].includes(getTripStatus(existing, today))) && form.endDate <= today)
      errors.push('Wybierz termin z powrotem w przyszłości.');
    if (errors.length) return { errors };
    return run({ type: 'save', form, id, groupId: profile.group.id, draft, today, publishedAt: new Date().toISOString() }, requestKey);
  };
  return (
    <OwnTripsContext value={{
      state, status, error, isSaving, refresh, hasLoaded,
      dispatch: action => { if (USE_DEMO_DATA) commit(action); },
      saveTrip,
      mutateTrip: action => run(action),
    }}>{children}</OwnTripsContext>
  );
}
export function useOwnTrips() {
  const context = useContext(OwnTripsContext);
  if (!context) throw new Error('OwnTripsProvider is required');
  return context;
}
