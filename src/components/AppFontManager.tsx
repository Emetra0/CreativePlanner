import { useEffect } from 'react';
import { buildFontFaceSource, normalizeFontFamily, resolveFontChoice } from '@/lib/fontSettings';
import { useSettingsStore } from '@/store/useSettingsStore';

export default function AppFontManager() {
  const appFontId = useSettingsStore((state) => state.appFontId);
  const customFonts = useSettingsStore((state) => state.customFonts);

  useEffect(() => {
    let cancelled = false;

    const loadFonts = async () => {
      const resolved = resolveFontChoice(appFontId, customFonts);
      document.documentElement.style.setProperty('--app-font-family', resolved.cssFamily);
      if (document.body) {
        document.body.style.setProperty('--app-font-family', resolved.cssFamily);
      }

      for (const font of customFonts) {
        const fontFaceSource = buildFontFaceSource(font);
        if (!fontFaceSource) continue;

        const normalizedFontFamily = normalizeFontFamily(font.cssFamily);
        const alreadyLoaded = Array.from(document.fonts).some((item) => normalizeFontFamily(item.family) === normalizedFontFamily);
        if (alreadyLoaded) continue;

        try {
          const fontFace = new FontFace(font.cssFamily, fontFaceSource);
          await fontFace.load();
          if (!cancelled) document.fonts.add(fontFace);
        } catch (error) {
          console.error('Failed to load custom font', font.name, error);
        }
      }

      if (!cancelled) {
        document.documentElement.style.setProperty('--app-font-family', resolved.cssFamily);
        if (document.body) {
          document.body.style.setProperty('--app-font-family', resolved.cssFamily);
        }
      }
    };

    void loadFonts();

    return () => {
      cancelled = true;
    };
  }, [appFontId, customFonts]);

  return null;
}