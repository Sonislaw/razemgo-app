import { createContext, useContext, useState, type ReactNode } from 'react';
import { DEMO_PROFILE } from '@/data/mocks/profile';
import type { TravelerProfile } from '@/types/profile';
import {
  cloneProfile,
  createEmptyProfile,
  normalizeProfile,
  validateProfile,
} from './profile-data';

interface ProfileState {
  profile: TravelerProfile;
  hasProfile: boolean;
  resetProfile: (kind: 'example' | 'new') => void;
  saveProfile: (profile: TravelerProfile) => string[];
}
const ProfileContext = createContext<ProfileState | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState(() => cloneProfile(DEMO_PROFILE));
  const [hasProfile, setHasProfile] = useState(true);
  const resetProfile = (kind: 'example' | 'new') => {
    setProfile(
      kind === 'new' ? createEmptyProfile() : cloneProfile(DEMO_PROFILE),
    );
    setHasProfile(kind !== 'new');
  };
  const saveProfile = (next: TravelerProfile) => {
    const normalized = normalizeProfile(next);
    const errors = validateProfile(normalized);
    if (!errors.length) {
      setProfile(normalized);
      setHasProfile(true);
    }
    return errors;
  };
  return (
    <ProfileContext value={{ profile, hasProfile, resetProfile, saveProfile }}>
      {children}
    </ProfileContext>
  );
}

export function useProfile() {
  const value = useContext(ProfileContext);
  if (!value) throw new Error('ProfileProvider is required');
  return value;
}
