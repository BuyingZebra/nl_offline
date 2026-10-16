import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ThemeName, palettes } from '../themes/palette';
import { Panel } from './Panel';
import { TerminalButton } from './TerminalButton';
import { useOfflineRegion } from '../../core/offline/useOfflineRegion';
export function OfflinePanel({theme,onClose,offline}:{theme:ThemeName;onClose:()=>void;
 offline:ReturnType<typeof useOfflineRegion>}) {
 const p=palettes[theme];
 const isReady=offline.phase==='downloaded';
 return <Panel theme={theme} style={styles.container}>
   <View style={styles.row}><Text style={[styles.heading,{color:p.primary}]}>OFFLINE / AREA PACK</Text>
     <TerminalButton theme={theme} label="×" onPress={onClose} accessibilityLabel="Close offline settings" />
   </View>
   <Text style={[styles.name,{color:p.primary}]}>CARBONEAR · TEST AREA</Text>
   <Text style={[styles.copy,{color:p.secondary}]}>Download a small area over Wi-Fi, then switch your phone to airplane mode. Zoom levels 10–16. This is NOT a province-wide map.</Text>
   <View style={[styles.track,{backgroundColor:p.bg,borderColor:p.outline}]}>
     <View style={{backgroundColor:p.primary,width:`${offline.percent}%`,height:'100%'}} />
   </View>
   <Text style={[styles.state,{color:p.primaryDim}]}>{isReady?'✓ DOWNLOAD COMPLETED':offline.phase==='downloading'?`DOWNLOADING ${offline.percent}%`:offline.phase.toUpperCase().replaceAll('-',' ')}</Text>
   {!!offline.notice && <Text style={[styles.copy,{color:p.secondary}]}>{offline.notice}</Text>}
   <View style={[styles.row,{gap:8,marginTop:12}]}>
     <TerminalButton theme={theme} label="DOWNLOAD" disabled={offline.phase==='downloading'||isReady} style={{flex:1}}
       onPress={offline.download}/>
     <TerminalButton theme={theme} label="REMOVE" disabled={!isReady && offline.phase !== 'error'} onPress={offline.remove}/>
   </View>
   <Text style={[styles.disclaimer,{color:p.secondary}]}>Uses OpenFreeMap's limited evaluation downloads. Coverage, fonts and source availability must be verified on real devices.</Text>
 </Panel>;
}
const styles=StyleSheet.create({container:{maxWidth:440,width:'100%'},row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
 heading:{fontFamily:'monospace',fontSize:12,fontWeight:'700',letterSpacing:1,flex:1},
 name:{fontFamily:'monospace',fontSize:17,fontWeight:'700',marginTop:9,marginBottom:7},
 copy:{fontSize:12,lineHeight:18,fontFamily:'monospace'},
 track:{width:'100%',height:12,borderRadius:4,borderWidth:1,overflow:'hidden',marginTop:14,marginBottom:5},
 state:{fontSize:12,fontFamily:'monospace',marginTop:5},disclaimer:{fontSize:10,fontFamily:'monospace',lineHeight:16,marginTop:13}});
