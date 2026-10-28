import { USE_DEMO_DATA } from '@/constants/app';
import { demoProfile } from '@/data/demo-adapter';
import { useAuth } from '@/features/auth/auth-context';
import type { TravelerProfile } from '@/types/profile';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  cloneProfile,
  createEmptyProfile,
  normalizeProfile,
  validateProfile,
} from './profile-data';
import { fetchProfile, persistProfile } from './profile-repository';

interface ProfileState {
  profile: TravelerProfile;
  hasProfile: boolean;
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  retry: () => void;
  isSaving: boolean;
  resetProfile: (kind: 'example' | 'new') => void;
  saveProfile: (profile: TravelerProfile) => Promise<string[]>;
}
const ProfileContext = createContext<ProfileState | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [profile, setProfile] = useState(() =>
    USE_DEMO_DATA ? cloneProfile(demoProfile()) : createEmptyProfile(),
  );
  const [hasProfile, setHasProfile] = useState(USE_DEMO_DATA);
  const [status, setStatus] = useState<ProfileState['status']>(
    USE_DEMO_DATA || !userId ? 'ready' : 'loading',
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setSaving] = useState(false);
  const [attempt, retry] = useState(0);
  const alive = useRef(true);
  const saving = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (USE_DEMO_DATA || !userId) return;
    let current = true;
    void fetchProfile(userId)
      .then((loaded) => {
        if (!current) return;
        setProfile(loaded ?? createEmptyProfile());
        setHasProfile(Boolean(loaded));
        setStatus('ready');
      })
      .catch(() => {
        if (!current) return;
        setStatus('error');
        setError(
          'Nie udało się pobrać profilu. Sprawdź połączenie i spróbuj ponownie.',
        );
      });
    return () => {
      current = false;
    };
  }, [userId, attempt]);
  const resetProfile = (kind: 'example' | 'new') => {
    if (!USE_DEMO_DATA) return;
    setProfile(
      kind === 'new' ? createEmptyProfile() : cloneProfile(demoProfile()),
    );
    setHasProfile(kind !== 'new');
  };
  const saveProfile = useCallback(
    async (next: TravelerProfile) => {
      if (saving.current) return ['Zapis już trwa.'];
      if (!USE_DEMO_DATA && !userId)
        return ['Zaloguj się ponownie, aby zapisać profil.'];
      const normalized = normalizeProfile(next);
      const errors = validateProfile(normalized);
      if (errors.length) return errors;
      saving.current = true;
      setSaving(true);
      try {
        const saved = USE_DEMO_DATA
          ? normalized
          : await persistProfile(normalized);
        if (!alive.current)
          return ['Sesja uległa zmianie. Zaloguj się ponownie.'];
        setProfile(saved);
        setHasProfile(true);
        setStatus('ready');
        return [];
      } catch {
        return [
          'Nie udało się zapisać profilu. Twoje zmiany pozostają w formularzu. Spróbuj ponownie.',
        ];
      } finally {
        saving.current = false;
        if (alive.current) setSaving(false);
      }
    },
    [userId],
  );
  return (
    <ProfileContext
      value={{
        profile,
        hasProfile,
        status,
        error,
        retry: () => {
          setStatus('loading');
          setError(null);
          retry((n) => n + 1);
        },
        isSaving,
        resetProfile,
        saveProfile,
      }}
    >
      {children}
    </ProfileContext>
  );
}

export function useProfile() {
  const value = useContext(ProfileContext);
  if (!value) throw new Error('ProfileProvider is required');
  return value;
}
