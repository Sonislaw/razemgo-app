import type { ReactNode } from 'react';
import { View, type ViewInstance } from 'react-native';
import { AppText } from '@/components/ui/primitives';
import type { TripFormField } from './own-trips-state';

export interface TripFieldTarget { node: ViewInstance; focus?: () => void }
export interface TripEditorFields {
  errors: Partial<Record<TripFormField, string>>;
  register: (field: TripFormField, target: TripFieldTarget | null) => void;
}
export const tripFieldErrorId = (field: TripFormField) => 'trip-error-' + field;

export function TripEditorField({ name, label, fields, focus, children }: {
  name: TripFormField;
  label: string;
  fields: TripEditorFields;
  focus?: () => void;
  children: ReactNode;
}) {
  const error = fields.errors[name];
  return <View ref={node => fields.register(name, node ? { node, focus } : null)} collapsable={false}
    testID={'trip-field-' + name} tabIndex={-1} focusable={!!error} aria-invalid={!!error}
    accessibilityLabel={error ? label + '. ' + error : undefined}
    style={{ gap: 8 }}>
    {children}
    {error ? <AppText nativeID={tripFieldErrorId(name)} accessibilityRole="alert" accessibilityLiveRegion="polite"
      variant="caption" color="primaryStrong" style={{ fontWeight: '700' }}>Błąd: {error}</AppText> : null}
  </View>;
}
