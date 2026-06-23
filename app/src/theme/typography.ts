import { useFonts } from 'expo-font';
import { Cinzel_400Regular } from '@expo-google-fonts/cinzel';
import { EBGaramond_400Regular } from '@expo-google-fonts/eb-garamond';
import { theme } from './theme';

/**
 * Load display (Cinzel) and body (EB Garamond) fonts.
 * Returns { loaded } — wait until true before rendering themed text.
 *
 * Falls back gracefully: if fonts fail to load, RN uses system defaults.
 */
export function useLoadFonts(): { loaded: boolean } {
  const [loaded] = useFonts({
    [theme.font.display]: Cinzel_400Regular,
    [theme.font.body]: EBGaramond_400Regular,
  });

  return { loaded: !!loaded };
}
