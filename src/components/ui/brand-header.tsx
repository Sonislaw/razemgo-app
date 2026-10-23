import type { ReactNode } from 'react';
import { IllustratedPageHeader } from './illustrated-page-header';

export function BrandHeader({ actions }: { actions?: ReactNode }) {
  return (
    <IllustratedPageHeader
      title="RazemGO"
      description={'Znajdź towarzystwo\nna kolejną przygodę.'}
      actions={actions}
    />
  );
}
