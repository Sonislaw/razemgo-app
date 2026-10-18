import { createContext, useContext, useState, type ReactNode } from 'react';
import { DEMO_PROFILE } from '@/data/mocks/profile';
import type { TravelerProfile } from '@/types/profile';
import {
  cloneProfile,
  normalizeProfile,
  validateProfile,
} from './profile-data';

interface ProfileState {
  profile: TravelerProfile;
  saveProfile: (profile: TravelerProfile) => string[];
}
const ProfileContext = createContext<ProfileState | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState(() => cloneProfile(DEMO_PROFILE));
  const saveProfile = (next: TravelerProfile) => {
    const normalized = normalizeProfile(next);
    const errors = validateProfile(normalized);
    if (!errors.length) setProfile(normalized);
    return errors;
  };
  return (
    <ProfileContext value={{ profile, saveProfile }}>{children}</ProfileContext>
  );
}

export function useProfile() {
  const value = useContext(ProfileContext);
  if (!value) throw new Error('ProfileProvider is required');
  return value;
}
