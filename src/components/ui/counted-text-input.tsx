import {useState, type Ref} from 'react';
import {StyleSheet, TextInput, View, type StyleProp, type TextInputInstance, type TextInputProps, type ViewStyle} from 'react-native';
import {Fonts, Radius, Typography} from '@/constants/theme';
import {useTheme} from '@/hooks/use-theme';
import {AppText} from './primitives';

type Props = Omit<TextInputProps, 'value' | 'maxLength'> & {
  value: string;
  maxLength: number;
  inputRef?: Ref<TextInputInstance>;
  containerStyle?: StyleProp<ViewStyle>;
  counterValue?: number;
  showCounter?: boolean;
};

// The counter occupies its own space inside the field border, so neither a
// scrolling textarea nor a long single-line value can run underneath it.
export function CountedTextInput({value, maxLength, inputRef, containerStyle, style, multiline = false,
  counterValue = value.length, showCounter = true, onFocus, onBlur, ...props}: Props) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return <View style={[styles.frame, {backgroundColor: theme.background, borderColor: focused ? theme.primaryStrong : theme.border},
    !multiline && styles.singleLine, containerStyle]}>
    <TextInput {...props} ref={inputRef} value={value} maxLength={maxLength} multiline={multiline}
      underlineColorAndroid="transparent"
      onFocus={event => {setFocused(true); onFocus?.(event);}}
      onBlur={event => {setFocused(false); onBlur?.(event);}}
      style={[styles.input, {color: theme.text}, multiline ? styles.multiline : styles.singleLineInput, style]} />
    {showCounter ? <View pointerEvents="none" style={[styles.counter, multiline && styles.multilineCounter]}>
      <AppText variant="caption" color="textSecondary"
        accessibilityLabel={`Wpisano ${counterValue} z ${maxLength} znaków`}
        style={styles.counterText}>{counterValue}/{maxLength}</AppText>
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  frame: {borderWidth: 1, borderRadius: Radius.small, minWidth: 0},
  singleLine: {flexDirection: 'row', alignItems: 'flex-end'},
  input: {minHeight: 50, minWidth: 0, padding: 12, borderWidth: 0, outlineStyle: 'solid', outlineWidth: 0, fontFamily: Fonts.sans, ...Typography.body},
  singleLineInput: {flex: 1},
  multiline: {minHeight: 110, textAlignVertical: 'top'},
  counter: {alignSelf: 'flex-end', paddingRight: 10, paddingBottom: 6},
  multilineCounter: {paddingLeft: 10},
  counterText: {textAlign: 'right', fontVariant: ['tabular-nums']},
});
