import { useWindowDimensions } from 'react-native';
export function usePhoneLayout() {
  const { width, height, fontScale } = useWindowDimensions();
  const landscape = width > height;
  // The same UI reorganizes when horizontal space exceeds vertical space.
  return { width, height, fontScale, landscape,
    compact: width < 370,
    sideRailWidth: landscape ? Math.min(252, Math.max(178, width * 0.31)) : 0,
    panelWidth: Math.min(440, Math.max(0, width - 32)),
  };
}
