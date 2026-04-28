import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@/store/useStore';
import { useTheme } from 'next-themes';
import ColorPicker from './ColorPicker';

export interface ContextMenuItem {
  label: string;
  action?: () => void;
  danger?: boolean;
    shortcut?: string;
    type?: 'default' | 'color-picker' | 'category-picker' | 'shape-picker' | 'divider' | 'label';
  currentColor?: string;
  onColorChange?: (color: string) => void;
  currentCategoryId?: string;
  categories?: { id: string; name: string; color: string }[];
  onCategoryChange?: (categoryId: string) => void;
  currentShape?: string;
  shapes?: { id: string; label: string }[];
  onShapeChange?: (shape: string) => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
    const { resolvedTheme } = useTheme();
    const isDarkTheme = resolvedTheme === 'dark';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

    return createPortal(
    <div
      ref={menuRef}
            className={`fixed z-[220] min-w-[180px] rounded-xl border py-1 shadow-2xl ${isDarkTheme ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}
      style={{ top: y, left: x }}
    >
      {items.map((item, index) => {
        if (item.type === 'divider') {
            return <div key={index} className={`my-1 h-px ${isDarkTheme ? 'bg-slate-700' : 'bg-slate-100'}`} />;
        }

        if (item.type === 'label') {
            return (
                <div
                    key={index}
                    className={`px-4 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${isDarkTheme ? 'text-slate-500' : 'text-slate-400'}`}
                >
                    {item.label}
                </div>
            );
        }

        if (item.type === 'color-picker') {
            return (
                <div key={index} className={`my-1 border-y px-4 py-2 ${isDarkTheme ? 'border-slate-700' : 'border-slate-100'}`}>
                    <ColorPicker 
                        color={item.currentColor || '#ffffff'} 
                        onChange={(color) => {
                            item.onColorChange?.(color);
                        }}
                        label={item.label}
                        paletteMode="office"
                        commitMode="confirm"
                    />
                </div>
            );
        }

        if (item.type === 'category-picker' && item.categories) {
            return (
                <div key={index} className={`my-1 border-y px-4 py-2 ${isDarkTheme ? 'border-slate-700' : 'border-slate-100'}`}>
                    <div className={`mb-1.5 text-xs font-medium ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>{item.label}</div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                        {item.categories.map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => {
                                    item.onCategoryChange?.(cat.id);
                                    onClose();
                                }}
                                className={`w-full flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors ${
                                    item.currentCategoryId === cat.id 
                                    ? (isDarkTheme ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600')
                                    : (isDarkTheme ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-50')
                                }`}
                            >
                                <span 
                                    className="w-2 h-2 rounded-full" 
                                    style={{ backgroundColor: cat.color }}
                                />
                                {cat.name}
                            </button>
                        ))}
                    </div>
                </div>
            );
        }

        if (item.type === 'shape-picker' && item.shapes) {
            return (
                <div key={index} className={`my-1 border-y px-4 py-2 ${isDarkTheme ? 'border-slate-700' : 'border-slate-100'}`}>
                    <div className={`mb-1.5 text-xs font-medium ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>{item.label}</div>
                    <div className="grid grid-cols-2 gap-1">
                        {item.shapes.map(shape => (
                            <button
                                key={shape.id}
                                onClick={() => {
                                    item.onShapeChange?.(shape.id);
                                    onClose();
                                }}
                                className={`px-2 py-1 rounded text-xs font-medium transition-colors text-left ${
                                    item.currentShape === shape.id
                                    ? (isDarkTheme ? 'bg-yellow-800/40 text-yellow-300' : 'bg-yellow-100 text-yellow-700')
                                    : (isDarkTheme ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-50')
                                }`}
                            >
                                {shape.label}
                            </button>
                        ))}
                    </div>
                </div>
            );
        }

        return (
            <button
            key={index}
            onClick={() => {
                item.action?.();
                onClose();
            }}
            className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                item.danger 
                                ? (isDarkTheme ? 'text-red-400 hover:bg-red-900/20' : 'text-red-600 hover:bg-red-50')
                                : (isDarkTheme ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-50')
            }`}
            >
                        <span className="flex items-center justify-between gap-4">
                            <span>{item.label}</span>
                            {item.shortcut ? (
                                                                <span className={`text-[11px] ${isDarkTheme ? 'text-slate-500' : 'text-slate-400'}`}>{item.shortcut}</span>
                            ) : null}
                        </span>
            </button>
        );
      })}
        </div>,
        document.body,
  );
}
