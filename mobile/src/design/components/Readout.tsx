import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { palettes, ThemeName } from '../themes/palette';
export function Readout({ theme, label, value, flex }: {theme: ThemeName; label: string; value: string; flex?: number}) {
  const p = palettes[theme];
  return <View style={[styles.wrap, flex ? {flex} : null]}>
    <Text style={[styles.small, {color:p.secondary}]} numberOfLines={1}>{label}</Text>
    <Text style={[styles.value, {color:p.primary}]} numberOfLines={1}>{value}</Text>
  </View>;
}
const styles = StyleSheet.create({wrap:{minWidth:0}, small:{fontFamily:'monospace',fontSize:9,letterSpacing:1.2},
 value:{fontFamily:'monospace',fontSize:13,fontWeight:'700',marginTop:3}});
