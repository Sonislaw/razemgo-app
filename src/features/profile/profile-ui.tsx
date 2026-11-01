import type { ReactNode } from 'react';
import { AppText, HeaderRow, IconButton } from '@/components/ui/primitives';

export function ProfileSubpageHeader({
  title,
  onBack,
  backLabel = 'Wróć do profilu',
  actions,
}: {
  title: string;
  onBack: () => void;
  backLabel?: string;
  actions?: ReactNode;
}) {
  return (
    <HeaderRow>
      <IconButton icon="back" label={backLabel} onPress={onBack} />
      <AppText variant="heading" accessibilityRole="header" style={{ flex: 1 }}>
        {title}
      </AppText>
      {actions}
    </HeaderRow>
  );
}
