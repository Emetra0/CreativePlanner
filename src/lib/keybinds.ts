export type KeybindScope = 'mindmap' | 'moodboard' | 'storyboard' | 'planner';
export type KeybindModifier = 'mod' | 'shift' | 'alt';

export interface KeybindDefinition {
  action: string;
  scope: KeybindScope;
  label: string;
  description: string;
  modifiers: KeybindModifier[];
  defaultKey: string;
}

interface KeybindEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export const KEYBIND_SECTION_ORDER: KeybindScope[] = ['mindmap', 'moodboard', 'storyboard', 'planner'];

export const KEYBIND_SECTION_META: Record<KeybindScope, { label: string; description: string }> = {
  mindmap: {
    label: 'Mindmap',
    description: 'Canvas shortcuts for node creation, grouping, editing, and help.',
  },
  moodboard: {
    label: 'Moodboard',
    description: 'Selection, delete, grouping, and history shortcuts for the moodboard canvas.',
  },
  storyboard: {
    label: 'Storyboard',
    description: 'Storyboard editor shortcuts.',
  },
  planner: {
    label: 'Planner',
    description: 'Planner shortcuts for creating events and navigating the schedule.',
  },
};

export const KEYBIND_DEFINITIONS: KeybindDefinition[] = [
  {
    action: 'mindmap.group',
    scope: 'mindmap',
    label: 'Group Selected Nodes',
    description: 'Group selected nodes, or create an empty group if nothing is selected.',
    modifiers: ['mod'],
    defaultKey: 'g',
  },
  {
    action: 'mindmap.addNode',
    scope: 'mindmap',
    label: 'Add New Node',
    description: 'Create a new node at the current viewport center.',
    modifiers: ['mod'],
    defaultKey: 'b',
  },
  {
    action: 'mindmap.delete',
    scope: 'mindmap',
    label: 'Delete Selected Node',
    description: 'Delete the current selection with confirmation. Hold Ctrl/Cmd for instant delete.',
    modifiers: [],
    defaultKey: 'Delete',
  },
  {
    action: 'mindmap.pan',
    scope: 'mindmap',
    label: 'Pan Canvas (Hold)',
    description: 'Hold this key to pan the canvas.',
    modifiers: [],
    defaultKey: 'Space',
  },
  {
    action: 'mindmap.undo',
    scope: 'mindmap',
    label: 'Undo',
    description: 'Undo the last mindmap change.',
    modifiers: ['mod'],
    defaultKey: 'z',
  },
  {
    action: 'mindmap.redo',
    scope: 'mindmap',
    label: 'Redo',
    description: 'Redo the last undone mindmap change.',
    modifiers: ['mod'],
    defaultKey: 'y',
  },
  {
    action: 'mindmap.help',
    scope: 'mindmap',
    label: 'Shortcut Help',
    description: 'Open or close the mindmap shortcuts panel.',
    modifiers: [],
    defaultKey: 'h',
  },
  {
    action: 'moodboard.group',
    scope: 'moodboard',
    label: 'Group Selected Nodes',
    description: 'Group selected moodboard nodes, or create an empty group if nothing is selected.',
    modifiers: ['mod'],
    defaultKey: 'g',
  },
  {
    action: 'moodboard.delete',
    scope: 'moodboard',
    label: 'Delete Selected Node',
    description: 'Delete the selected moodboard node with confirmation. Hold Ctrl/Cmd for instant delete.',
    modifiers: [],
    defaultKey: 'Delete',
  },
  {
    action: 'moodboard.deleteEdge',
    scope: 'moodboard',
    label: 'Delete Selected Connection',
    description: 'Delete the selected connection.',
    modifiers: [],
    defaultKey: 'Delete',
  },
  {
    action: 'moodboard.undo',
    scope: 'moodboard',
    label: 'Undo',
    description: 'Undo the last moodboard change.',
    modifiers: ['mod'],
    defaultKey: 'z',
  },
  {
    action: 'moodboard.redo',
    scope: 'moodboard',
    label: 'Redo',
    description: 'Redo the last undone moodboard change.',
    modifiers: ['mod'],
    defaultKey: 'y',
  },
  {
    action: 'storyboard.newFrame',
    scope: 'storyboard',
    label: 'Create New Frame',
    description: 'Insert a new storyboard frame.',
    modifiers: [],
    defaultKey: 'n',
  },
  {
    action: 'planner.newEvent',
    scope: 'planner',
    label: 'Create New Event',
    description: 'Open the planner event dialog for the current view.',
    modifiers: ['mod'],
    defaultKey: 'x',
  },
  {
    action: 'planner.help',
    scope: 'planner',
    label: 'Shortcut Help',
    description: 'Open or close the planner shortcuts panel.',
    modifiers: [],
    defaultKey: 'h',
  },
];

export const defaultKeybinds = Object.fromEntries(
  KEYBIND_DEFINITIONS.map((definition) => [definition.action, definition.defaultKey]),
) as Record<string, string>;

export function getKeybindDefinition(action: string) {
  return KEYBIND_DEFINITIONS.find((definition) => definition.action === action);
}

export function normalizeKeybindKey(key: string) {
  switch (key) {
    case ' ':
      return 'Space';
    case 'Escape':
      return 'Esc';
    case 'Esc':
      return 'Esc';
    case 'ArrowUp':
    case 'ArrowDown':
    case 'ArrowLeft':
    case 'ArrowRight':
    case 'Delete':
    case 'Backspace':
    case 'Enter':
    case 'Tab':
    case 'Home':
    case 'End':
    case 'PageUp':
    case 'PageDown':
      return key;
    case 'Control':
      return 'Ctrl';
    case 'Meta':
      return 'Meta';
    case 'Alt':
      return 'Alt';
    case 'Shift':
      return 'Shift';
    default:
      return key.length === 1 ? key.toLowerCase() : key;
  }
}

export function isModifierOnlyKey(key: string) {
  const normalized = normalizeKeybindKey(key);
  return normalized === 'Ctrl' || normalized === 'Meta' || normalized === 'Alt' || normalized === 'Shift';
}

export function getKeybindValue(action: string, keybinds: Record<string, string>) {
  return normalizeKeybindKey(keybinds[action] || getKeybindDefinition(action)?.defaultKey || '');
}

export function formatKeybindKey(key: string) {
  const normalized = normalizeKeybindKey(key);
  return normalized.length === 1 ? normalized.toUpperCase() : normalized;
}

export function formatKeybindModifier(modifier: KeybindModifier) {
  if (modifier === 'mod') return 'Ctrl/Cmd';
  if (modifier === 'shift') return 'Shift';
  return 'Alt';
}

export function formatKeybindCombo(action: string, keybinds: Record<string, string>) {
  const definition = getKeybindDefinition(action);
  if (!definition) return formatKeybindKey(getKeybindValue(action, keybinds));

  return [
    ...definition.modifiers.map(formatKeybindModifier),
    formatKeybindKey(getKeybindValue(action, keybinds)),
  ].join(' + ');
}

export function eventMatchesKeybind(action: string, event: KeybindEventLike, keybinds: Record<string, string>) {
  const definition = getKeybindDefinition(action);
  if (!definition) return false;

  const expectedKey = getKeybindValue(action, keybinds);
  const actualKey = normalizeKeybindKey(event.key);
  const requiresMod = definition.modifiers.includes('mod');
  const requiresShift = definition.modifiers.includes('shift');
  const requiresAlt = definition.modifiers.includes('alt');

  return actualKey === expectedKey
    && (event.ctrlKey || event.metaKey) === requiresMod
    && event.shiftKey === requiresShift
    && event.altKey === requiresAlt;
}