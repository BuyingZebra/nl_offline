import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { palettes, ThemeName } from '../themes/palette';
export function Panel({ theme, children, style }: {theme: ThemeName; children: React.ReactNode; style?: ViewStyle}) {
 const p = palettes[theme];
 return <View style={[styles.panel, { backgroundColor: p.panel, borderColor: p.outline }, style]}>{children}</View>;
}
const styles = StyleSheet.create({ panel: { borderRadius: 9, borderWidth: 1, padding: 12 } });
