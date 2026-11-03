import { Link } from 'expo-router';
import { AppText } from '@/components/ui/primitives';
import { useProfile } from '@/features/profile/profile-context';
import { useTheme } from '@/hooks/use-theme';
import { DEV_SHARING_ENABLED } from './share-config';
import { splitSharedText } from './share-links';

export function SharedMessageText({ text, self }: { text: string; self: boolean }) {
  const theme = useTheme();
  const { profile } = useProfile();
  const color = self ? theme.onPrimary : theme.text;
  const parts = DEV_SHARING_ENABLED ? splitSharedText(text) : [{ text }];
  return <AppText style={{ color, fontSize: 15, lineHeight: 22 }}>
    {parts.map((part, index) => part.target ? <Link key={index}
      href={part.target.kind === 'trip'
        ? { pathname: '/shared-trip/[id]', params: { id: part.target.id } }
        : part.target.id === profile.group.id
          ? '/profile'
          : { pathname: '/crew/[id]', params: { id: part.target.id } }}
      accessibilityLabel={part.target.kind === 'trip' ? 'Otwórz udostępniony wyjazd' : 'Otwórz udostępnioną ekipę'}
      onPress={event => event.stopPropagation()}
      style={{ color: self ? theme.onPrimary : theme.primaryStrong, textDecorationLine: 'underline', fontWeight: '600' }}>
      {part.text}
    </Link> : part.text)}
  </AppText>;
}
