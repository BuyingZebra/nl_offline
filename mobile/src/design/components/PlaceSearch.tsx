import React, { useMemo, useState } from 'react';
import { FlatList, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { searchPlaces, Place } from '../../data/places';
import { ThemeName, palettes } from '../themes/palette';
import { Panel } from './Panel';
import { TerminalButton } from './TerminalButton';
export function PlaceSearch({ theme, onSelect, onClose }:
  { theme:ThemeName; onSelect:(p:Place)=>void; onClose:()=>void }) {
  const [query, setQuery] = useState('');
  const p = palettes[theme];
  const results = useMemo(() => searchPlaces(query),[query]);
  return <Panel theme={theme} style={styles.container}>
    <View style={styles.titleRow}><Text style={[styles.title,{color:p.primary}]}>LOCATE / COMMUNITIES</Text>
      <TerminalButton theme={theme} label="×" onPress={()=>{Keyboard.dismiss();onClose();}} accessibilityLabel="Close place search"/>
    </View>
    <TextInput autoFocus value={query} onChangeText={setQuery} placeholder="Search town name…"
      placeholderTextColor={p.secondary} returnKeyType="search" autoCapitalize="none"
      style={[styles.field,{color:p.primary,backgroundColor:p.bg,borderColor:p.outline}]}
      accessibilityLabel="Search towns"/>
    <Text style={[styles.note,{color:p.secondary}]}>PROTOTYPE: COMMUNITY PRESETS ONLY — STREET SEARCH COMING LATER</Text>
    <FlatList data={results} keyboardShouldPersistTaps="handled"
      keyExtractor={item=>item.name} style={{maxHeight:230}}
      ListEmptyComponent={<Text style={{color:p.secondary,paddingVertical:12}}>No matching town in prototype list.</Text>}
      renderItem={({item})=><Pressable onPress={()=>{Keyboard.dismiss();onSelect(item);}}
        accessibilityRole="button" style={[styles.result,{borderColor:p.outline}]}>
        <Text style={[styles.place,{color:p.primary}]}>{item.name}</Text>
        <Text style={[styles.sub,{color:p.secondary}]}>{item.label}  ↗</Text>
      </Pressable>}/>
  </Panel>;
}
const styles=StyleSheet.create({container:{maxWidth:440,width:'100%'},titleRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:9},
 title:{fontFamily:'monospace',fontWeight:'700',fontSize:12,letterSpacing:0.9,flex:1},
 field:{borderWidth:1,borderRadius:6,height:48,paddingHorizontal:12,fontSize:15,fontFamily:'monospace'},
 note:{fontFamily:'monospace',fontSize:9,letterSpacing:0.2,marginTop:9,marginBottom:8,lineHeight:15},
 result:{paddingVertical:12,borderBottomWidth:1}, place:{fontFamily:'monospace',fontWeight:'700',fontSize:14},
 sub:{fontFamily:'monospace',fontSize:10,marginTop:3}});
