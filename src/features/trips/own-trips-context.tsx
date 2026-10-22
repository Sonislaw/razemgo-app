import {
  createContext,
  useContext,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';
import { DEMO_OWN_TRIPS } from '@/data/mocks/owned-trips';
import { useProfile } from '@/features/profile/profile-context';
import type { OwnTripsState, TripForm } from '@/types/owned-trip';
import {
  createOwnTripsState,
  getTripStatus,
  ownTripsReducer,
  todayDate,
  validateTripForm,
  type OwnTripsAction,
} from './own-trips-state';

interface OwnTripsContextValue {
  state: OwnTripsState;
  dispatch: Dispatch<OwnTripsAction>;
  saveTrip: (
    form: TripForm,
    id?: string,
    draft?: boolean,
  ) => { id?: string; errors: string[] };
}
const OwnTripsContext = createContext<OwnTripsContextValue | null>(null);
export function OwnTripsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(
    ownTripsReducer,
    DEMO_OWN_TRIPS,
    createOwnTripsState,
  );
  const { profile } = useProfile();
  const saveTrip: OwnTripsContextValue['saveTrip'] = (
    form,
    id,
    draft = false,
  ) => {
    const today = todayDate();
    const existing = state.trips.find((trip) => trip.id === id);
    const errors = draft ? [] : validateTripForm(form);
    if (id && !existing)
      errors.push('Ten wyjazd został usunięty. Wróć do listy.');
    if (
      !draft &&
      (!existing ||
        !['completed', 'cancelled'].includes(getTripStatus(existing, today))) &&
      form.endDate <= today
    )
      errors.push('Wybierz termin z powrotem w przyszłości.');
    if (errors.length) return { errors };
    const savedId = id ?? `local-trip-${state.nextSequence}`;
    dispatch({
      type: 'save',
      form,
      id,
      groupId: profile.group.id,
      draft,
      today,
      publishedAt: new Date().toISOString(),
    });
    return { id: savedId, errors: [] };
  };
  return (
    <OwnTripsContext value={{ state, dispatch, saveTrip }}>
      {children}
    </OwnTripsContext>
  );
}
export function useOwnTrips() {
  const context = useContext(OwnTripsContext);
  if (!context) throw new Error('OwnTripsProvider is required');
  return context;
}
