import { AppText, Card, SectionTitle } from '@/components/ui/primitives';

export function GroupAboutCard({ about, own = false }: { about?: string; own?: boolean }) {
  return (
    <Card testID="group-about-card">
      <SectionTitle title="O ekipie" />
      <AppText color="textSecondary">
        {about?.trim() || (own
          ? 'Przedstaw swoją ekipę w edycji profilu.'
          : 'Ekipa nie dodała jeszcze opisu.')}
      </AppText>
    </Card>
  );
}
