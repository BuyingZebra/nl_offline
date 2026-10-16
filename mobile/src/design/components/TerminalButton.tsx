import React from 'react';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { palettes, ThemeName } from '../themes/palette';
import { touchTarget } from '../tokens/spacing';

type Props = { label: string; onPress: () => void; theme: ThemeName; active?: boolean;
  accessibilityLabel?: string; style?: ViewStyle; disabled?: boolean; };
export function TerminalButton({ label, onPress, theme, active, style, disabled, accessibilityLabel }: Props) {
  const p = palettes[theme];
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
    accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled: !!disabled, selected: !!active }}
    style={({ pressed }) => [styles.button, { borderColor: active ? p.primary : p.outline,
      backgroundColor: active ? p.panelAlt : p.panel, opacity: disabled ? 0.35 : pressed ? 0.75 : 1 }, style]}>
    <Text maxFontSizeMultiplier={1.5} style={[styles.text, { color: active ? p.primary : p.primaryDim }]}>{label}</Text>
  </Pressable>;
}
const styles = StyleSheet.create({
  button: { minWidth: touchTarget, minHeight: touchTarget, borderWidth: 1,
    borderRadius: 7, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  text: { fontFamily: 'monospace', fontSize: 15, fontWeight: '700', letterSpacing: 0.6 },
});
