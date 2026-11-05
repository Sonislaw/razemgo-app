import Constants from 'expo-constants';
import { router, usePathname } from 'expo-router';
import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type ComponentRef } from 'react';
import type { View } from 'react-native';
import { USE_DEMO_DATA } from '@/constants/app';
import { useAuth } from '@/features/auth/auth-context';
import { useAccountSyncJob } from '@/features/auth/account-sync-context';
import { useProfile } from '@/features/profile/profile-context';
import { sessionStorage } from '@/lib/session-storage';
import { createTutorialStore, type TutorialDecision } from './tutorial-store';
import { fetchTutorialState, saveTutorialState } from './tutorial-repository';

// Enable alongside the Dev migration; Preview is promoted separately.
export const TUTORIAL_ENABLED = Constants.expoConfig?.extra?.appVariant === 'development';
export const TUTORIAL_STEPS = [
  { target: 'index', title: 'Start',
    text: 'To punkt startowy aplikacji. Przejdziesz stąd do szukania ekipy lub dodasz własny wyjazd. Poniżej znajdziesz najnowsze ogłoszenie, gdy pojawi się w aplikacji.' },
  { target: 'notifications', title: 'Powiadomienia',
    text: 'Tutaj znajdziesz informacje o nowych wiadomościach i zaproszeniach, reakcjach na Twoje ogłoszenia, pasujących wyjazdach oraz nowych ogłoszeniach ulubionych ekip. Trafiają tu również alerty zapisanych filtrów.\n\nLiczba przy dzwonku pokazuje nieodczytane powiadomienia.' },
  { target: 'explore', title: 'Odkrywaj',
    text: 'Przeglądaj wyjazdy i profile innych ekip. Filtrami dopasujesz wyniki do swoich planów, a wybrane zestawy zapiszesz na później. Serduszkiem dodasz wyjazdy i ekipy do ulubionych.' },
  { target: 'trips', title: 'Wyjazdy',
    text: 'Tutaj zarządzasz swoimi ogłoszeniami. Dodaj „Mam plan”, gdy znasz cel, lub „Szukam pomysłu”, gdy chcesz zaplanować coś wspólnie. Możesz też edytować szczegóły i zmieniać status swoich wyjazdów.' },
  { target: 'messages', title: 'Wiadomości',
    text: 'Tutaj znajdziesz otrzymane i wysłane zaproszenia do kontaktu. Aby kogoś poznać, w Odkrywaj otwórz wybrany wyjazd lub profil ekipy i wybierz „Zaproś do kontaktu”.\n\nPo przyjęciu zaproszenia w „Rozmowach” pojawi się czat, w którym ustalicie wspólne plany.' },
  { target: 'profile', title: 'Profil',
    text: 'Przedstaw swoją ekipę innym podróżnikom. Uzupełnij opis, skład ekipy, sposób podróżowania i zainteresowania, żeby łatwiej znaleźć wspólny język. Stąd przejdziesz też do ustawień aplikacji.' },
] as const;
export type TutorialTargetId = typeof TUTORIAL_STEPS[number]['target'];
export type TutorialAnchor = { node: ComponentRef<typeof View> };
type TutorialContextValue = {
  available: boolean; offer: boolean; step: number | null;
  start: () => void; skip: () => void; next: () => void; back: () => void;
  anchors: Map<TutorialTargetId, TutorialAnchor>;
};
const TutorialContext = createContext<TutorialContextValue | null>(null);

export function TutorialProvider({ children }: { children: ReactNode }) {
  const { session, isLoading, isRecovering, error } = useAuth();
  const { hasProfile, status } = useProfile();
  const pathname = usePathname();
  const userId = session?.user.id;
  const ready = TUTORIAL_ENABLED && !USE_DEMO_DATA && !!userId && !isLoading && !isRecovering && !error && hasProfile && status === 'ready';
  const store = useMemo(() => {
    const project = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `razemgo.${project}.tutorial.v1.${userId ?? 'guest'}`;
    return createTutorialStore({
      readCache: () => sessionStorage.getItem(key),
      writeCache: value => sessionStorage.setItem(key, value),
      load: () => fetchTutorialState(userId!),
      save: value => saveTutorialState(userId!, value),
    });
  }, [userId]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [offer, setOffer] = useState(false);
  const [step, setStep] = useState<number | null>(null);
  const [anchors] = useState(() => new Map<TutorialTargetId, TutorialAnchor>());
  const offered = useRef(false);
  useAccountSyncJob('tutorial', store.synchronize, ready);
  useEffect(() => () => store.stop(), [store]);
  useEffect(() => {
    if (!ready || !state.loaded || state.status || offered.current || pathname !== '/' || step !== null) return;
    const timer = setTimeout(() => { offered.current = true; setOffer(true); }, 400);
    return () => clearTimeout(timer);
  }, [ready, state.loaded, state.status, pathname, step]);
  const finish = (decision: TutorialDecision) => {
    setOffer(false); setStep(null); offered.current = true;
    store.finish(decision);
  };
  const move = (index: number) => {
    setOffer(false); offered.current = true; setStep(index);
  };
  return <TutorialContext value={{
    available: ready, offer: ready && !state.status && offer, step: ready ? step : null, anchors,
    start: () => { if (ready) { router.navigate('/'); move(0); } }, skip: () => finish('skipped'),
    next: () => { if (step === TUTORIAL_STEPS.length - 1) finish('completed'); else move((step ?? -1) + 1); },
    back: () => { if (step !== null && step > 0) move(step - 1); },
  }}>{children}</TutorialContext>;
}
export function useTutorial() {
  const value = useContext(TutorialContext);
  if (!value) throw Error('TutorialProvider missing');
  return value;
}
