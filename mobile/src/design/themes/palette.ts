export type ThemeName = 'pipboy' | 'dark';
export type Palette = {
  bg: string; panel: string; panelAlt: string; outline: string;
  primary: string; primaryDim: string; secondary: string; water: string;
  building: string; road: string; highway: string; route: string;
};
export const palettes: Record<ThemeName, Palette> = {
  pipboy: {
    bg: '#06140e', panel: '#071c12', panelAlt: '#102a1a', outline: '#285b3a',
    primary: '#9af7ae', primaryDim: '#58b87a', secondary: '#5d9270',
    water: '#0b2823', building: '#1c593b', road: '#61cc82',
    highway: '#a4ffb8', route: '#ecfcb0',
  },
  dark: {
    bg: '#10151d', panel: '#131b25', panelAlt: '#202e3d', outline: '#405368',
    primary: '#e4eff9', primaryDim: '#8eacc7', secondary: '#758da5',
    water: '#172f3f', building: '#314255', road: '#9cadbf',
    highway: '#e7f0fc', route: '#f4de7f',
  },
};
