import { Pressable, useWindowDimensions, View } from 'react-native';
import { AppText } from '@/components/ui/primitives';
import { IllustratedPageHeader } from '@/components/ui/illustrated-page-header';
import { IS_DEMO_MODE } from '@/constants/app';
import { useTheme } from '@/hooks/use-theme';
import { HomeNotifications } from '@/features/notifications/home-notifications';

export function HomeHeader({ onOpenDemo }: { onOpenDemo: () => void }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();

  return (
    <IllustratedPageHeader
      title="RazemGO"
      description={'Znajdź towarzystwo\nna kolejną przygodę.'}
      actions={
        <>
          {IS_DEMO_MODE ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Warianty ekranu Start"
              onPress={onOpenDemo}
              style={{
                minWidth: 48,
                minHeight: 48,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <View
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 12,
                  backgroundColor: theme.hero,
                }}
              >
                <AppText variant="caption">Demo</AppText>
              </View>
            </Pressable>
          ) : null}
          <HomeNotifications key={width} />
        </>
      }
    />
  );
}
