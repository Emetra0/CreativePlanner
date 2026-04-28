type ParsedColor = {
  r: number;
  g: number;
  b: number;
  a: number;
};

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clampAlpha(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function parseColor(input: string): ParsedColor | null {
  const color = input.trim();

  if (color.toLowerCase() === 'transparent') {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  if (color.startsWith('#')) {
    const clean = color.slice(1);
    if (![3, 4, 6, 8].includes(clean.length)) return null;

    const full = clean.length <= 4
      ? clean.split('').map((char) => char + char).join('')
      : clean;

    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      a: full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1,
    };
  }

  const rgbMatch = color.match(/^rgba?\(([^)]+)\)$/i);
  if (!rgbMatch) return null;

  const parts = rgbMatch[1].split(',').map((part) => part.trim());
  if (parts.length < 3 || parts.length > 4) return null;

  const [r, g, b] = parts.slice(0, 3).map((part) => Number.parseFloat(part));
  if ([r, g, b].some((value) => Number.isNaN(value))) return null;

  const alpha = parts[3] === undefined ? 1 : Number.parseFloat(parts[3]);
  if (Number.isNaN(alpha)) return null;

  return {
    r: clampChannel(r),
    g: clampChannel(g),
    b: clampChannel(b),
    a: clampAlpha(alpha),
  };
}

function toHexPair(value: number): string {
  return clampChannel(value).toString(16).padStart(2, '0');
}

export function toHexColor(color: ParsedColor, includeAlpha = color.a < 0.999): string {
  const base = `#${toHexPair(color.r)}${toHexPair(color.g)}${toHexPair(color.b)}`;
  if (!includeAlpha) return base;
  return `${base}${toHexPair(color.a * 255)}`;
}

export function getOpaqueHex(color: string, fallback = '#000000'): string {
  const parsed = parseColor(color);
  return parsed ? toHexColor({ ...parsed, a: 1 }, false) : fallback;
}

export function isTransparentColor(color: string): boolean {
  const parsed = parseColor(color);
  return !!parsed && parsed.a <= 0.001;
}

export function getColorAlpha(color: string, fallback = 1): number {
  const parsed = parseColor(color);
  return parsed ? parsed.a : fallback;
}

export function withOpacity(color: string, opacity: number, fallback = color): string {
  const parsed = parseColor(color);
  if (!parsed) return fallback;
  return toHexColor({ ...parsed, a: clampAlpha(opacity) });
}

/**
 * Adapts a hex color so it remains visible against the mindmap canvas in the
 * current light/dark theme.  Keeps hue & saturation, clamps lightness so:
 *   – dark mode  → L ≥ 40 % (colours are bright enough to see on the near-black canvas)
 *   – light mode → L ≤ 68 % (colours are dark enough to see on the near-white canvas)
 */
export function adaptColorForTheme(hex: string, isDark: boolean): string {
  const parsed = parseColor(hex);
  if (!parsed) return hex;

  const alpha = parsed.a;
  const r = parsed.r / 255;
  const g = parsed.g / 255;
  const b = parsed.b / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  // Clamp lightness for visibility
  if (isDark) l = Math.max(l, 0.40);
  else        l = Math.min(l, 0.68);

  // HSL → RGB
  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let nr: number, ng: number, nb: number;
  if (s === 0) {
    nr = ng = nb = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    nr = hue2rgb(p, q, h + 1 / 3);
    ng = hue2rgb(p, q, h);
    nb = hue2rgb(p, q, h - 1 / 3);
  }
  return toHexColor({
    r: nr * 255,
    g: ng * 255,
    b: nb * 255,
    a: alpha,
  });
}

export function getContrastColor(hexColor: string): string {
  const parsed = parseColor(hexColor);
  if (!parsed) return '#000000';
  
  const { r, g, b } = parsed;
  
  // Calculate luminance (perceived brightness)
  // Standard formula: 0.299*R + 0.587*G + 0.114*B
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  
  // Return black for bright colors, white for dark colors
  return (yiq >= 128) ? '#000000' : '#ffffff';
}
