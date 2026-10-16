import type { ThemeName } from '../design/themes/palette';

// Immutable pilot test styles. These JSON files were generated from
// createMapStyle.ts and are pinned to the same repository commit.
// The live map AND the native offline pack MUST use the identical URL.
// GitHub raw hosting is ONLY for evaluating the small Carbonear test area.
// Production builds require our own hosted/prefetched NL tile packages.
const pilotStyleRevision = '7fd756eb488a834eaddefa5f3db48eccf07c05c6';
const pilotStyleBase =
  'https://raw.githubusercontent.com/BuyingZebra/nl_offline/' + pilotStyleRevision + '/mobile/styles/';

export const PILOT_STYLE_URLS: Record<ThemeName, string> = {
  pipboy: pilotStyleBase + 'field-atlas-pipboy.json',
  dark: pilotStyleBase + 'field-atlas-dark.json',
};
