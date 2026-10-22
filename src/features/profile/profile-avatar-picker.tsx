import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { AppText, Button, FieldLabel, layout } from '@/components/ui/primitives';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { IllustrationChoice } from '@/components/ui/illustration-choice';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ProfileAvatarId } from '@/types/avatar';
import { getProfileAvatar, PROFILE_AVATARS } from './profile-avatar-data';
import { ProfileAvatar } from './profile-avatar';

export function ProfileAvatarPicker({
  value,
  onChange,
}: {
  value?: ProfileAvatarId;
  onChange: (avatarId: ProfileAvatarId) => void;
}) {
  const theme = useTheme();
  const current = getProfileAvatar(value);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(current.id);
  const selected = getProfileAvatar(selectedId);

  return (
    <>
      <View style={styles.field}>
        <FieldLabel>Awatar ekipy</FieldLabel>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Wybierz awatar ekipy"
          accessibilityHint={current.name + '. ' + current.description}
          onPress={() => {
            Keyboard.dismiss();
            setSelectedId(current.id);
            setOpen(true);
          }}
          style={({ pressed }) => [
            styles.preview,
            {
              backgroundColor: theme.backgroundSelected,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <ProfileAvatar avatarId={current.id} size={64} decorative />
          <View style={styles.copy}>
            <AppText variant="label">{current.name}</AppText>
            <AppText variant="caption" color="textSecondary">
              {current.description}
            </AppText>
            <AppText variant="caption" color="primaryStrong">
              Zmień awatar
            </AppText>
          </View>
          <Icon name="edit" size={20} />
        </Pressable>
      </View>
      {open ? (
        <BottomSheet title="Wybierz awatar" onClose={() => setOpen(false)}>
          <AppText variant="caption" color="textSecondary">
            Każdy ma swój charakter. Który pasuje do Twoich podróży?
          </AppText>
          <View
            testID="avatar-selection-preview"
            style={[styles.preview, { backgroundColor: theme.muted }]}
            accessibilityLiveRegion="polite"
          >
            <ProfileAvatar avatarId={selected.id} size={72} decorative />
            <View style={styles.copy}>
              <AppText variant="heading" style={styles.previewTitle}>
                {selected.name}
              </AppText>
              <AppText variant="caption" color="textSecondary">
                {selected.description}
              </AppText>
            </View>
          </View>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Awatar ekipy"
            style={styles.grid}
          >
            {PROFILE_AVATARS.map((avatar) => (
              <View key={avatar.id} style={styles.option}>
                <IllustrationChoice
                  label={'Awatar: ' + avatar.name}
                  selectionMode="single"
                  selected={selectedId === avatar.id}
                  onPress={() => setSelectedId(avatar.id)}
                >
                  <ProfileAvatar avatarId={avatar.id} size={54} decorative />
                </IllustrationChoice>
                <AppText
                  variant="caption"
                  color={selectedId === avatar.id ? 'primaryStrong' : 'text'}
                  style={styles.optionLabel}
                >
                  {avatar.name}
                </AppText>
              </View>
            ))}
          </View>
          <Button
            label="Użyj tego awatara"
            icon="check"
            onPress={() => {
              onChange(selectedId);
              setOpen(false);
            }}
          />
        </BottomSheet>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  field: { gap: Spacing.two },
  preview: {
    ...layout.row,
    gap: Spacing.three,
    padding: 12,
    borderRadius: Radius.small,
  },
  copy: { flex: 1, minWidth: 0, gap: Spacing.one },
  previewTitle: { fontSize: 17, lineHeight: 23 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: Spacing.three,
  },
  option: { width: '30%', alignItems: 'center', gap: Spacing.two },
  optionLabel: { textAlign: 'center' },
});
