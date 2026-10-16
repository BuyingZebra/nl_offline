import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, GeoJSONSource, Layer, Map } from '@maplibre/maplibre-react-native';
import { usePhoneLayout } from '../design/layouts/usePhoneLayout';
import { palettes, ThemeName } from '../design/themes/palette';
import { TerminalButton } from '../design/components/TerminalButton';
import { PlaceSearch } from '../design/components/PlaceSearch';
import { OfflinePanel } from '../design/components/OfflinePanel';
import { Panel } from '../design/components/Panel';
import { Readout } from '../design/components/Readout';
import { useGps } from '../core/gps/useGps';
import { useOfflineRegion } from '../core/offline/useOfflineRegion';
import { createMapStyle } from '../map/createMapStyle';
import { Place } from '../data/places';

type Sheet = 'search'|'offline'|'about'|null;
type Coordinate = [number, number];
const HOME: Coordinate = [-53.2270, 47.7350];
function pointGeoJson(coordinate: Coordinate) {
  return { type:'FeatureCollection' as const,
    features:[{type:'Feature' as const, properties:{}, geometry:{type:'Point' as const, coordinates:coordinate}}]};
}
function coordText(n: number, suffix: string) { return `${Math.abs(n).toFixed(4)}°${suffix}`; }

export function MapScreen() {
  const pLayout = usePhoneLayout();
  const inset = useSafeAreaInsets();
  const [theme, setTheme] = useState<ThemeName>('pipboy');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [viewCenter, setViewCenter] = useState<Coordinate>(HOME);
  const [zoom, setZoom] = useState(14.2);
  const [pin, setPin] = useState<Coordinate | null>(null);
  const [follow, setFollow] = useState(false);
  const camera = useRef<React.ElementRef<typeof Camera> | null>(null);
  const gps = useGps();
  const offline = useOfflineRegion();
  const p = palettes[theme];
  const mapStyle = useMemo(() => createMapStyle(theme), [theme]);
  const placeSelected = useCallback((place: Place) => {
    setFollow(false);
    camera.current?.easeTo({ center: place.coordinate, zoom: place.zoom, duration: 750 });
    setSheet(null);
  }, []);
  const goHome = () => { setFollow(false); camera.current?.easeTo({center: HOME, zoom: 14.2, duration:800}); };
  const locate = async () => {
    if (gps.permission !== 'granted') { await gps.request(); return; }
    if (!gps.fix) { Alert.alert('Waiting for GPS', gps.error ?? 'The device is acquiring a location fix.'); return; }
    setFollow(true);
    camera.current?.easeTo({center: [gps.fix.longitude, gps.fix.latitude], zoom: 15.5, duration:650});
  };
  const zoomBy = (delta: number) => camera.current?.zoomTo(Math.max(4,Math.min(19,zoom + delta)), {duration:200});
  const pinned = useMemo(() => pin ? pointGeoJson(pin) : null,[pin]);
  const gpsGeojson = useMemo(() => gps.fix ? pointGeoJson([gps.fix.longitude,gps.fix.latitude]) : null,[gps.fix]);
  const bottomBuffer = Math.max(inset.bottom, 8);
  const navButtons = (
    <>
      <TerminalButton theme={theme} label="⌕ SEARCH" onPress={()=>setSheet('search')} accessibilityLabel="Search communities" style={styles.navButton} />
      <TerminalButton theme={theme} label="◧ MAPS" onPress={()=>setSheet('offline')} accessibilityLabel="Download offline test area" style={styles.navButton}/>
      <TerminalButton theme={theme} label="⌖ PIN" onPress={()=>setPin(viewCenter)} accessibilityLabel="Pin the current map centre" style={styles.navButton}/>
      <TerminalButton theme={theme} label="? INFO" onPress={()=>setSheet('about')} accessibilityLabel="About this prototype" style={styles.navButton}/>
    </>
  );
  return <View style={[styles.root,{backgroundColor:p.bg}]}>
    <Map mapStyle={mapStyle as React.ComponentProps<typeof Map>["mapStyle"]} style={StyleSheet.absoluteFillObject}
      compass={false} logo={false} attribution attributionPosition={{bottom:pLayout.landscape?16:115,right:7}}
      onRegionDidChange={e=>{
        const state = e.nativeEvent;
        if (state?.center?.length === 2) setViewCenter([state.center[0],state.center[1]]);
        if (typeof state?.zoom === 'number') setZoom(state.zoom);
        if (state?.userInteraction) setFollow(false);
      }}>
      <Camera ref={camera} initialViewState={{center:HOME,zoom:14.2}}
        minZoom={4} maxZoom={19} trackUserLocation={follow ? 'default' : undefined} />
      {gpsGeojson && <GeoJSONSource id="device-gps" data={gpsGeojson}>
        <Layer id="gps-halo" type="circle" paint={{'circle-color':p.primary,'circle-radius':14,'circle-opacity':0.13}}/>
        <Layer id="gps-point" type="circle" paint={{'circle-color':p.highway,'circle-radius':5.5,
          'circle-stroke-width':2.5,'circle-stroke-color':p.bg}}/>
      </GeoJSONSource>}
      {pinned && <GeoJSONSource id="marked-point" data={pinned}>
        <Layer id="pin-glow" type="circle" paint={{'circle-color':p.route,'circle-radius':12,'circle-opacity':0.2}}/>
        <Layer id="pin-core" type="circle" paint={{'circle-color':p.route,'circle-radius':5,
          'circle-stroke-color':p.bg,'circle-stroke-width':2}}/>
      </GeoJSONSource>}
    </Map>
    <View pointerEvents="none" style={[styles.edgeTop,{borderColor:p.outline}]} />
    <View pointerEvents="none" style={[styles.edgeBottom,{borderColor:p.outline}]} />

    <View pointerEvents="box-none" style={[styles.safeOverlay,{paddingTop:inset.top+5,paddingBottom:bottomBuffer+4}]}>
      <View style={[styles.header,{backgroundColor:p.panel,borderColor:p.outline}]}>
        <View style={{flex:1,minWidth:0}}>
          <Text style={[styles.overline,{color:p.secondary}]}>FIELD ATLAS / NEWFOUNDLAND</Text>
          <Text style={[styles.brand,{color:p.primary}]} numberOfLines={1}>NAVIGATION SYSTEM</Text>
        </View>
        <TerminalButton theme={theme} label={theme==='pipboy'?'◐':'◑'}
          accessibilityLabel="Toggle map colour theme" onPress={()=>setTheme(t=>t==='pipboy'?'dark':'pipboy')}/>
      </View>
      <View pointerEvents="box-none" style={styles.mainArea}>
        {pLayout.landscape && <View style={[styles.rail,{width:pLayout.sideRailWidth,backgroundColor:p.panel,borderColor:p.outline}]}>
          <Text style={[styles.smallTitle,{color:p.primary}]}>SYSTEM / READY</Text>
          <Text style={[styles.micro,{color:p.secondary,marginVertical:9}]}>MAP AND GPS VIEWER · V0.1</Text>
          {navButtons}
          <View style={{flex:1}}/>
          <Text style={[styles.micro,{color:p.secondary}]}>GPS {gps.fix?'ACTIVE':'NOT ACTIVE'}</Text>
        </View>}
        <View style={{flex:1}} pointerEvents="box-none">
          <View style={[styles.mapControls,{top:pLayout.landscape?12:60}]}>
            <TerminalButton theme={theme} label="＋" onPress={()=>zoomBy(1)} accessibilityLabel="Zoom in" />
            <TerminalButton theme={theme} label="－" onPress={()=>zoomBy(-1)} accessibilityLabel="Zoom out" />
            <TerminalButton theme={theme} label="◎" onPress={locate} accessibilityLabel="Find my location" active={follow} />
            <TerminalButton theme={theme} label="⌂" onPress={goHome} accessibilityLabel="Return to Carbonear" />
          </View>
          {pin && <Pressable accessibilityRole="button" onPress={()=>setPin(null)}
            style={[styles.pinFlag,{backgroundColor:p.panel,borderColor:p.outline}]}>
            <Text style={{color:p.route,fontFamily:'monospace',fontSize:10}}>PIN SAVED · TAP TO CLEAR</Text>
          </Pressable>}
        </View>
      </View>
      <View style={[styles.footer,{backgroundColor:p.panel,borderColor:p.outline}]}>
        <View style={styles.readouts}>
          <Readout theme={theme} label="LATITUDE" value={coordText(viewCenter[1],viewCenter[1]>=0?'N':'S')} flex={1}/>
          <Readout theme={theme} label="LONGITUDE" value={coordText(viewCenter[0],viewCenter[0]>=0?'E':'W')} flex={1}/>
          <Readout theme={theme} label="ZOOM" value={zoom.toFixed(1)}/>
        </View>
        {!pLayout.landscape && <View style={styles.navRow}>{navButtons}</View>}
        <View style={styles.statusRow}>
          <Text style={[styles.status,{color:p.secondary}]} numberOfLines={1}>{offline.phase==='downloaded'?'▰ CARBONEAR TEST PACK SAVED':'◇ MAP REQUIRES NETWORK UNTIL SAVED'}</Text>
          <Text style={[styles.status,{color:p.primaryDim}]}>{gps.fix?'● GPS':'○ GPS OFF'}</Text>
        </View>
      </View>
    </View>
    {!!sheet && <View style={[styles.sheetShade,{paddingTop:inset.top+20,paddingBottom:Math.max(inset.bottom,12)+12}]}
      pointerEvents="box-none">
      <Pressable onPress={()=>setSheet(null)} style={StyleSheet.absoluteFillObject} accessibilityLabel="Dismiss overlay" />
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={[styles.sheetPosition,{justifyContent:pLayout.landscape?'center':'flex-end'}]}>
        {sheet==='search' && <PlaceSearch theme={theme} onSelect={placeSelected} onClose={()=>setSheet(null)}/>}
        {sheet==='offline' && <OfflinePanel theme={theme} offline={offline} onClose={()=>setSheet(null)}/>}
        {sheet==='about' && <Panel theme={theme} style={{width:'100%',maxWidth:440}}>
          <Text style={[styles.heading,{color:p.primary}]}>FIELD ATLAS // V0.1</Text>
          <Text style={[styles.infoText,{color:p.secondary}]}>
            A working map-and-GPS development prototype. Real vector tiles include mapped building outlines and road labels. GPS positioning and town shortcuts are available. The Carbonear map pack is small and must be downloaded before airplane-mode testing.\n\nNOT IMPLEMENTED YET: street-name search, address search, routing, turn-by-turn navigation, province-wide downloadable maps.\n\nDo not depend on this prototype for driving or emergencies.
          </Text>
          <TerminalButton theme={theme} label="CLOSE" onPress={()=>setSheet(null)}/>
        </Panel>}
      </KeyboardAvoidingView>
    </View>}
  </View>;
}
const styles=StyleSheet.create({
  root:{flex:1},edgeTop:{position:'absolute',top:0,left:0,right:0,borderTopWidth:2,opacity:.7},
  edgeBottom:{position:'absolute',bottom:0,left:0,right:0,borderBottomWidth:2,opacity:.7},
  safeOverlay:{...StyleSheet.absoluteFillObject},
  header:{marginHorizontal:10,paddingVertical:9,paddingHorizontal:12,borderWidth:1,borderRadius:7,
    flexDirection:'row',alignItems:'center',gap:10},
  overline:{fontFamily:'monospace',fontSize:9,letterSpacing:1.6},
  brand:{fontFamily:'monospace',fontSize:16,fontWeight:'900',letterSpacing:1.4,marginTop:3},
  mainArea:{flex:1,flexDirection:'row'},
  rail:{margin:10,marginRight:0,borderRadius:7,borderWidth:1,padding:10,gap:8},
  mapControls:{position:'absolute',right:12,gap:8},
  pinFlag:{position:'absolute',bottom:11,alignSelf:'center',borderRadius:5,borderWidth:1,paddingHorizontal:12,paddingVertical:9},
  footer:{marginHorizontal:10,borderRadius:7,borderWidth:1,paddingHorizontal:10,paddingTop:9,paddingBottom:8},
  readouts:{flexDirection:'row',gap:12,paddingBottom:7},
  navRow:{flexDirection:'row',gap:7,justifyContent:'space-between',paddingVertical:6},
  navButton:{flex:1,minWidth:0},
  statusRow:{flexDirection:'row',justifyContent:'space-between',gap:8,marginTop:7,paddingTop:7,
    borderTopWidth:1,borderColor:'#274c39'},
  status:{fontFamily:'monospace',fontSize:9,letterSpacing:.1},
  smallTitle:{fontFamily:'monospace',fontWeight:'700',fontSize:12},
  micro:{fontFamily:'monospace',fontSize:10},
  sheetShade:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(2,8,5,.72)'},
  sheetPosition:{flex:1,alignItems:'center',paddingHorizontal:12},
  heading:{fontSize:18,fontFamily:'monospace',fontWeight:'800',marginBottom:10},
  infoText:{fontFamily:'monospace',fontSize:12,lineHeight:19,marginBottom:15},
});
