import { AppText, Card, SectionTitle } from '@/components/ui/primitives';
import { Shadows } from '@/constants/theme';

export function GroupAboutCard({ about, own = false }: { about?: string; own?: boolean }) {
  return (
    <Card testID="group-about-card" style={{ boxShadow: Shadows.profileCard }}>
      <SectionTitle title="O ekipie" />
      <AppText color="textSecondary">
        {about?.trim() || (own
          ? 'Przedstaw swoją ekipę w edycji profilu.'
          : 'Ekipa nie dodała jeszcze opisu.')}
      </AppText>
    </Card>
  );
}
