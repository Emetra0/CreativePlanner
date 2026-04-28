import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from 'next-themes';
import { Check, ChevronDown, EyeOff, RotateCcw } from 'lucide-react';
import { HexColorPicker } from 'react-colorful';
import { getColorAlpha, getOpaqueHex, isTransparentColor, parseColor, withOpacity } from '@/lib/colors';
import { useAppTranslation } from '@/lib/appTranslations';
import { useSettingsStore } from '@/store/useSettingsStore';

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  label?: string;
  compact?: boolean;
  buttonLabel?: string;
  className?: string;
  inline?: boolean;
  paletteMode?: 'default' | 'office';
  commitMode?: 'live' | 'confirm';
  automaticColor?: string;
  automaticLabel?: string;
  panelZIndex?: number;
}

const DEFAULT_PRESETS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
  '#f43f5e', '#ffffff', '#9ca3af', '#000000',
];

const OFFICE_THEME_COLUMNS = [
  ['#ffffff', '#f2f2f2', '#d9d9d9', '#bfbfbf', '#7f7f7f', '#595959'],
  ['#000000', '#1f1f1f', '#3f3f3f', '#595959', '#7f7f7f', '#a5a5a5'],
  ['#e7e6e6', '#d0cece', '#aeaaaa', '#7f7f7f', '#5b5b5b', '#3a3a3a'],
  ['#44546a', '#dbe5f1', '#b4c7e7', '#8faadc', '#2f75b5', '#1f4e79'],
  ['#5b9bd5', '#ddebf7', '#bdd7ee', '#9dc3e6', '#2e75b6', '#1f4e79'],
  ['#ed7d31', '#fbe5d6', '#f4b183', '#ed7d31', '#c55a11', '#833c0c'],
  ['#70ad47', '#e2efd9', '#c6e0b4', '#a9d18e', '#548235', '#385723'],
  ['#255e91', '#d9e2f3', '#9fbad0', '#5b9bd5', '#1f4e79', '#0f243e'],
  ['#9e4ea8', '#eadcf0', '#d7bde2', '#c084cc', '#7f2f83', '#53265a'],
  ['#70ad47', '#e2f0d9', '#c5e0b3', '#a8d08d', '#548235', '#385723'],
];

const OFFICE_STANDARD_COLORS = ['#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0'];

export default function ColorPicker({
  color,
  onChange,
  label,
  compact = false,
  buttonLabel,
  className,
  inline = false,
  paletteMode = 'default',
  commitMode = 'live',
  automaticColor,
  automaticLabel = 'Automatic',
  panelZIndex = 1100,
}: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [panelPosition, setPanelPosition] = useState<{ top: number; left: number } | null>(null);
  const [inputColor, setInputColor] = useState(getOpaqueHex(color, '#ffffff'));
  const [opacity, setOpacity] = useState(Math.round(getColorAlpha(color) * 100));
  const [draftColor, setDraftColor] = useState(color);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const { resolvedTheme } = useTheme();
  const { text } = useAppTranslation();
  const isDark = resolvedTheme === 'dark';
  const recentColors = useSettingsStore((state) => state.recentColors);
  const pushRecentColor = useSettingsStore((state) => state.pushRecentColor);
  const isOfficePalette = paletteMode === 'office';
  const requiresExplicitApply = commitMode === 'confirm';
  const automaticLabelText = automaticLabel === 'Automatic' ? text('Automatic') : automaticLabel;

  // Sync internal input state when prop changes
  useEffect(() => {
    setInputColor(getOpaqueHex(color, '#ffffff'));
    setOpacity(Math.round(getColorAlpha(color) * 100));
    setDraftColor(color);
  }, [color]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const finishDrag = () => {
      isDraggingRef.current = false;
    };

    window.addEventListener('pointerup', finishDrag);
    return () => window.removeEventListener('pointerup', finishDrag);
  }, []);

  // Close on click outside
  useEffect(() => {
    if (inline) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (isDraggingRef.current) return;
      const target = event.target as Node;
      if (containerRef.current && !containerRef.current.contains(target) && !panelRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [inline]);

  useEffect(() => {
    if (inline || !isOpen) return;

    const updatePosition = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const panelWidth = 256;
      const maxLeft = Math.max(12, window.innerWidth - panelWidth - 12);
      setPanelPosition({
        top: rect.bottom + 8,
        left: Math.min(rect.left, maxLeft),
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [inline, isOpen]);

  const selectedColor = requiresExplicitApply ? draftColor : color;
  const selectedIsTransparent = isTransparentColor(selectedColor);

  const commitColor = (nextColor: string) => {
    onChange(nextColor);
    pushRecentColor(nextColor);
    setDraftColor(nextColor);
  };

  const previewColor = (nextOpaqueHex: string, nextOpacity = opacity) => withOpacity(nextOpaqueHex, nextOpacity / 100, nextOpaqueHex);

  const stageColor = (nextColor: string) => {
    setDraftColor(nextColor);
    setInputColor(getOpaqueHex(nextColor, '#ffffff'));
    setOpacity(Math.round(getColorAlpha(nextColor) * 100));
    if (!requiresExplicitApply) {
      commitColor(nextColor);
    }
  };

  const applyDraftColor = () => {
    commitColor(draftColor);
    setIsOpen(false);
  };

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputColor(val);
    if (/^#[0-9A-F]{6}$/i.test(val)) {
      stageColor(previewColor(val));
    }
  };

  const handleColorChange = (nextHex: string) => {
    setInputColor(nextHex);
    stageColor(previewColor(nextHex));
  };

  const handleOpacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextOpacity = Number.parseInt(e.target.value, 10);
    setOpacity(nextOpacity);
    stageColor(previewColor(inputColor, nextOpacity));
  };

  const startDragInteraction = () => {
    isDraggingRef.current = true;
  };

  const handleTransparent = () => {
    setOpacity(0);
    stageColor('#00000000');
  };

  const previewSwatch = selectedIsTransparent
    ? 'linear-gradient(135deg, rgba(156,163,175,0.18) 25%, transparent 25%, transparent 50%, rgba(156,163,175,0.18) 50%, rgba(156,163,175,0.18) 75%, transparent 75%, transparent)'
    : selectedColor;

  const renderOfficeSwatch = (swatch: string, className = 'h-5 w-5') => {
    const isSelected = getOpaqueHex(selectedColor, '#ffffff').toLowerCase() === swatch.toLowerCase() && !selectedIsTransparent;
    return (
      <button
        key={swatch}
        type="button"
        onClick={() => handleColorChange(swatch)}
        className={`${className} border transition-all ${isSelected ? 'border-blue-500 ring-1 ring-blue-400/60' : isDark ? 'border-slate-600 hover:border-slate-400' : 'border-slate-300 hover:border-slate-500'}`}
        style={{ backgroundColor: swatch }}
        title={swatch}
      />
    );
  };

  const panel = (
    <div className={inline
      ? `${isOfficePalette ? 'w-[17.5rem]' : 'w-64'} rounded-xl border p-3 ${isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-700'}`
      : `${isOfficePalette ? 'w-[17.5rem]' : 'w-64'} rounded-xl border p-3 shadow-2xl ${isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-700'} z-[1100]`}>
      {isOfficePalette ? (
        <>
          {automaticColor ? (
            <div className="mb-3 border-b border-slate-200 pb-3 dark:border-slate-700">
              <button
                type="button"
                onClick={() => stageColor(automaticColor)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm underline-offset-2 transition-colors hover:underline ${isDark ? 'text-slate-100 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-50'}`}
              >
                <span className="h-4 w-4 border border-slate-400" style={{ backgroundColor: automaticColor }} />
                {automaticLabelText}
              </button>
            </div>
          ) : null}

          <div className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">{text('Theme Colors')}</div>
          <div className="mb-4 flex gap-1">
            {OFFICE_THEME_COLUMNS.map((column, columnIndex) => (
              <div key={`theme-column-${columnIndex}`} className="flex flex-col gap-1">
                {column.map((swatch) => renderOfficeSwatch(swatch))}
              </div>
            ))}
          </div>

          <div className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">{text('Standard Colors')}</div>
          <div className="mb-4 grid grid-cols-10 gap-1">
            {OFFICE_STANDARD_COLORS.map((swatch) => renderOfficeSwatch(swatch, 'h-6 w-6'))}
          </div>

          <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700">
            <div onPointerDown={startDragInteraction}>
              <HexColorPicker color={inputColor} onChange={handleColorChange} style={{ width: '100%', height: '150px' }} />
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{text('HEX')}</span>
              <input
                type="text"
                value={inputColor}
                onChange={handleHexChange}
                className={`flex-1 rounded border p-1 text-sm uppercase ${isDark ? 'bg-slate-950 border-slate-600 text-white focus:border-blue-500' : 'bg-white border-slate-300 text-slate-900 focus:border-blue-500'}`}
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setDraftColor(color);
                  setInputColor(getOpaqueHex(color, '#ffffff'));
                  setOpacity(Math.round(getColorAlpha(color) * 100));
                  setIsOpen(false);
                }}
                className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${isDark ? 'border-slate-600 text-slate-200 hover:bg-slate-800' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
              >
                {text('Cancel')}
              </button>
              <button
                type="button"
                onClick={applyDraftColor}
                className="inline-flex items-center gap-1 rounded-md border border-blue-500 bg-blue-500 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-600"
              >
                <Check size={12} /> {text('Apply')}
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="mb-3">
            <div onPointerDown={startDragInteraction}>
              <HexColorPicker color={inputColor} onChange={handleColorChange} style={{ width: '100%', height: '150px' }} />
            </div>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleTransparent}
              className={`flex items-center justify-center gap-2 rounded-md border px-2 py-2 text-xs font-medium transition-colors ${selectedIsTransparent ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/20 dark:text-blue-300' : isDark ? 'border-slate-700 text-slate-200 hover:bg-slate-800' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
            >
              <EyeOff size={13} /> {text('Transparent')}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpacity(100);
                handleColorChange(inputColor);
              }}
              className={`flex items-center justify-center gap-2 rounded-md border px-2 py-2 text-xs font-medium transition-colors ${isDark ? 'border-slate-700 text-slate-200 hover:bg-slate-800' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
            >
              <RotateCcw size={13} /> {text('Opaque')}
            </button>
          </div>

          <div className="grid grid-cols-5 gap-2 mb-3">
            {DEFAULT_PRESETS.map((preset) => (
              <button
                key={preset}
                onClick={() => handleColorChange(preset)}
                className={`
                  w-8 h-8 rounded-full border flex items-center justify-center transition-transform hover:scale-110
                  ${isDark ? 'border-slate-600' : 'border-slate-200'}
                `}
                style={{ backgroundColor: withOpacity(preset, opacity / 100, preset) }}
                title={preset}
              >
                {inputColor.toLowerCase() === preset.toLowerCase() && (
                  <Check size={14} className={['#ffffff', '#f43f5e', '#eab308', '#f59e0b'].includes(preset) ? 'text-black' : 'text-white'} />
                )}
              </button>
            ))}
          </div>

          {recentColors.length > 0 && (
            <div className="mb-3 border-t border-slate-200 pt-3 dark:border-slate-700">
              <div className={`mb-2 text-[11px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{text('Recent')}</div>
              <div className="grid grid-cols-6 gap-2">
                {recentColors.map((recent) => {
                  const transparent = isTransparentColor(recent);
                  const swatchStyle = transparent
                    ? { backgroundImage: 'linear-gradient(135deg, rgba(156,163,175,0.18) 25%, transparent 25%, transparent 50%, rgba(156,163,175,0.18) 50%, rgba(156,163,175,0.18) 75%, transparent 75%, transparent)' }
                    : { backgroundColor: recent };
                  return (
                    <button
                      key={recent}
                      type="button"
                      onClick={() => {
                        const parsed = parseColor(recent);
                        const opaque = parsed ? getOpaqueHex(recent, '#ffffff') : '#ffffff';
                        setInputColor(opaque);
                        setOpacity(Math.round(getColorAlpha(recent) * 100));
                        setDraftColor(recent);
                        if (!requiresExplicitApply) {
                          commitColor(recent);
                        }
                      }}
                      className={`h-8 rounded-md border transition-transform hover:scale-105 ${isDark ? 'border-slate-600' : 'border-slate-200'}`}
                      title={transparent ? text('Transparent') : recent}
                      style={swatchStyle}
                    />
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700">
            <div className="flex items-center justify-between gap-3">
              <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{text('Opacity')}</span>
              <span className={`text-xs tabular-nums ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{opacity}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={opacity}
              onChange={handleOpacityChange}
              onPointerDown={startDragInteraction}
              className="w-full accent-blue-500"
              aria-label={text('Opacity')}
            />
          </div>

          <div className="mt-3 flex items-center gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
            <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{text('HEX')}</span>
            <input
              type="text"
              value={inputColor}
              onChange={handleHexChange}
              className={`
                flex-1 p-1 text-sm border rounded uppercase
                ${isDark 
                  ? 'bg-slate-950 border-slate-600 text-white focus:border-blue-500' 
                  : 'bg-white border-slate-300 text-slate-900 focus:border-blue-500'
                }
              `}
            />
          </div>
        </>
      )}
    </div>
  );

  const floatingPanel = !inline && isOpen && isMounted && panelPosition
    ? createPortal(
        <div ref={panelRef} className="fixed" style={{ top: panelPosition.top, left: panelPosition.left, zIndex: panelZIndex }}>
          {panel}
        </div>,
        document.body,
      )
    : null;

  return (
    <div className={`relative ${className || ''}`.trim()} ref={containerRef}>
      {label && (
        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">
          {label}
        </label>
      )}
      
      {!inline && (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`
            ${compact ? 'inline-flex min-w-0 h-11 px-3 py-2 rounded-lg' : 'w-full p-2 rounded'} flex items-center gap-2 border transition-all
            ${isDark 
              ? 'bg-slate-900 border-slate-700 hover:bg-slate-800 text-slate-100' 
              : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
            }
          `}
        >
          <div 
            className={`${compact ? 'h-7 w-7 rounded-md' : 'h-6 w-6 rounded'} border border-slate-200 shadow-sm dark:border-slate-600`}
            style={selectedIsTransparent ? { backgroundImage: previewSwatch } : { backgroundColor: color }}
          />
          <span className={`${compact ? 'text-[11px]' : 'text-sm'} flex-1 text-left ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
            {buttonLabel || selectedColor}
          </span>
          <ChevronDown size={14} className={isDark ? 'text-slate-400' : 'text-slate-500'} />
        </button>
      )}

      {inline && panel}
      {floatingPanel}
    </div>
  );
}
