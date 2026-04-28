import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Trash2, X, Palette, Wand2, Lightbulb, LayoutGrid, Sparkles, RefreshCw } from 'lucide-react';
import { useThemeStore, Theme } from '@/store/useThemeStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { usePluginStore } from '@/store/usePluginStore';
import { useFileStore } from '@/store/useFileStore';
import { readFile, createFile, createFolder, checkExists } from '@/lib/fileSystem';
import IdeasPanel from '@/components/IdeasPanel';
import { usePaletteStore, type StoredPalette } from '@/store/usePaletteStore';
import { useAppTranslation } from '@/lib/appTranslations';

// ─── Color Theory Utilities ──────────────────────────────────────────────────

export type PaletteHarmony = import('@/store/usePaletteStore').PaletteHarmony;
export type { StoredPalette };

export const HARMONY_LIST: { id: PaletteHarmony; label: string; description: string }[] = [
  { id: 'analogous',            label: 'Analogous',            description: 'Colors adjacent on the wheel — natural, calm, and cohesive' },
  { id: 'complementary',        label: 'Complementary',        description: 'Opposite hues — high contrast, bold, and dynamic' },
  { id: 'triadic',              label: 'Triadic',              description: 'Three evenly spaced hues — vibrant and richly varied' },
  { id: 'split-complementary',  label: 'Split-Complementary',  description: 'Base + two beside its complement — softer contrast' },
  { id: 'monochromatic',        label: 'Monochromatic',        description: 'One hue, five lightness steps — elegant and unified' },
  { id: 'tetradic',             label: 'Tetradic',             description: 'Four equally spaced hues — complex and expressive' },
];

function mkHsl(h: number, s: number, l: number): string {
  return `hsl(${Math.round(((h % 360) + 360) % 360)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

function generateHarmoniousPalette(harmony: PaletteHarmony): string[] {
  const hue = Math.floor(Math.random() * 360);
  const sat = 58 + Math.floor(Math.random() * 18); // 58–75%
  const h = (deg: number, s = sat, l = 50) =>
    `hsl(${Math.round(((hue + deg) % 360 + 360) % 360)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
  switch (harmony) {
    case 'analogous':           return [h(-40,sat,38), h(-20,sat,50), h(0,sat,62), h(20,sat,50), h(40,sat,38)];
    case 'complementary':       return [h(0,sat,30), h(0,sat,50), h(0,sat-8,70), h(180,sat,43), h(180,sat-8,62)];
    case 'triadic':             return [h(0,sat,50), h(120,sat,55), h(240,sat,50), h(0,sat-14,72), h(120,sat-14,72)];
    case 'split-complementary': return [h(0,sat,50), h(150,sat,50), h(210,sat,50), h(0,sat-10,70), h(150,sat-10,70)];
    case 'monochromatic':       return [h(0,sat,20), h(0,sat,36), h(0,sat,52), h(0,sat-12,68), h(0,sat-20,82)];
    case 'tetradic':            return [h(0,sat,50), h(90,sat,50), h(180,sat,50), h(270,sat,50), h(45,sat-10,68)];
    default:                    return Array(5).fill(0).map((_,i) => h(i*60));
  }
}

export default function ThemesPage() {
  const { text } = useAppTranslation();
  const { themes, setThemes, addTheme, removeTheme } = useThemeStore();
  const { projectPath } = useSettingsStore();
  const { plugins } = usePluginStore();
  const { triggerRefresh } = useFileStore();
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<'themes' | 'ideas' | 'prompts' | 'colorpalettes'>('themes');

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ['themes', 'ideas', 'prompts', 'colorpalettes'].includes(tab)) {
      setActiveTab(tab as any);
    }
  }, [searchParams]);

  const themeGeneratorPlugin = plugins.find(p => p.id === 'minecraft-theme' && p.installed && p.enabled);

  // Form State
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newColor, setNewColor] = useState('blue');

  // Prompts State
  const [currentPrompt, setCurrentPrompt] = useState('');
  
  // Color Palette State
  const { palettes, addPalette, removePalette } = usePaletteStore();
  const [paletteHarmony, setPaletteHarmony] = useState<PaletteHarmony>('analogous');

  useEffect(() => {
    setCurrentPrompt(text('Click generate to get a writing prompt!'));
  }, [text]);

  // Load Themes
  useEffect(() => {
    const load = async () => {
        // Determine root
        let root = 'root';
        if (projectPath) {
             const sep = projectPath.includes('\\') ? '\\' : '/';
             if (projectPath !== 'root/Cloud Storage') {
                 root = projectPath;
             }
        }
        
        // Phase 4: root/theme.json
        const sep = root.includes('\\') ? '\\' : '/';
        const path = `${root}${sep}theme.json`;
        
        const content = await readFile(path);
        if (content) {
            try {
                setThemes(JSON.parse(content));
            } catch (e) {
                console.error("Failed to parse theme.json", e);
            }
        }
        setIsLoaded(true);
    };
    load();
  }, [setThemes, projectPath]);

  // Save Themes
  useEffect(() => {
    if (!isLoaded || !projectPath) return;

    const save = async () => {
        let root = 'root';
        if (projectPath !== 'root/Cloud Storage') {
             root = projectPath;
        }

        await createFile(root, 'theme.json', JSON.stringify(themes, null, 2));
    };
    
    const timeout = setTimeout(save, 500);
    return () => clearTimeout(timeout);
  }, [themes, isLoaded, projectPath]);

  const handleAddTheme = (e: React.FormEvent) => {
      e.preventDefault();
      if (!newTitle) return;

      const theme: Theme = {
          id: Date.now().toString(),
          title: newTitle,
          description: newDesc,
          color: newColor,
          createdAt: new Date().toISOString()
      };

      addTheme(theme);
      setShowModal(false);
      setNewTitle('');
      setNewDesc('');
      setNewColor('blue');
  };

  const handleAutoGenerate = () => {
    const adjectives = ['Ancient', 'Futuristic', 'Ruined', 'Floating', 'Underground', 'Crystal', 'Steampunk', 'Cyberpunk', 'Medieval', 'Alien'];
    const nouns = ['City', 'Temple', 'Fortress', 'Village', 'Sanctuary', 'Laboratory', 'Garden', 'Spire', 'Dungeon', 'Hub'];
    
    const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
    
    // Generate a vibrant color (High Saturation, Medium Lightness)
    const hue = Math.floor(Math.random() * 360);
    const saturation = 70 + Math.floor(Math.random() * 30); // 70-100%
    const lightness = 45 + Math.floor(Math.random() * 15); // 45-60%
    const randomColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    
    const theme: Theme = {
        id: Date.now().toString(),
        title: `${randomAdj} ${randomNoun}`,
        description: `Auto-generated theme suggestion. Build a ${randomAdj.toLowerCase()} ${randomNoun.toLowerCase()} with unique features.`,
        color: randomColor,
        createdAt: new Date().toISOString()
    };
    addTheme(theme);
  };

  const generatePrompt = () => {
      const prompts = [
        text("A character discovers a secret door in their basement that wasn't there yesterday."),
        text('The villain is actually trying to save the world from a greater threat.'),
        text('Write a scene where two characters must communicate without speaking.'),
        text('A magical artifact that grants wishes, but with a terrible ironic twist.'),
        text('The protagonist wakes up with no memory in a futuristic city.'),
        text('A dragon who is afraid of fire.'),
        text('A world where music is the source of magic.'),
        text('The last tree on Earth begins to speak.')
      ];
      setCurrentPrompt(prompts[Math.floor(Math.random() * prompts.length)]);
  };

  const generatePalette = () => {
    const colors = generateHarmoniousPalette(paletteHarmony);
    addPalette({ id: Date.now().toString(), harmony: paletteHarmony, colors });
  };

  const filteredThemes = themes.filter(t => 
      t.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
      t.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const colorOptions = [
      { name: 'blue', colorClass: 'border-l-blue-500' },
      { name: 'green', colorClass: 'border-l-green-500' },
      { name: 'red', colorClass: 'border-l-red-500' },
      { name: 'yellow', colorClass: 'border-l-yellow-500' },
      { name: 'purple', colorClass: 'border-l-purple-500' },
      { name: 'pink', colorClass: 'border-l-pink-500' },
  ];

  return (
    <div className="p-8 h-full overflow-y-auto flex flex-col">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-bold text-gray-800 dark:text-white">{text('Mindstorming')}</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-2">{text('Manage your episode themes and brainstorm ideas.')}</p>
        </div>
        <div className="flex gap-2">
            {activeTab === 'themes' && themeGeneratorPlugin && (
                <button 
                    onClick={handleAutoGenerate}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm"
                >
                    <Wand2 size={20} />
                  {text('Auto Generate')}
                </button>
            )}
            {activeTab === 'themes' && (
                <button 
                    onClick={() => setShowModal(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm"
                >
                <Plus size={20} />
                {text('Add Theme')}
                </button>
            )}
        </div>
      </header>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-8 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
        {([
          { id: 'themes',       label: 'Themes',         Icon: LayoutGrid },
          { id: 'ideas',        label: 'Ideas',          Icon: Lightbulb  },
          { id: 'prompts',      label: 'Prompts',        Icon: Sparkles   },
          { id: 'colorpalettes',label: 'Color Palettes', Icon: Palette    },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <tab.Icon size={16} />
            {text(tab.label)}
          </button>
        ))}
      </div>

      {activeTab === 'themes' ? (
        <>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input 
                type="text" 
                placeholder={text('Search themes...')} 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-gray-800 dark:text-white placeholder-gray-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredThemes.map(theme => {
                const isCustomColor = theme.color.startsWith('hsl') || theme.color.startsWith('#') || theme.color.startsWith('rgb');
                return (
                <div 
                    key={theme.id}
                    className={`bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition-all group relative border-l-4 ${!isCustomColor ? `border-l-${theme.color}-500` : ''}`}
                    style={isCustomColor ? { borderLeftColor: theme.color } : {}}
                >
                    <div className="flex justify-between items-start mb-2">
                        <h3 className="text-lg font-bold text-gray-800 dark:text-white">{theme.title}</h3>
                        <button 
                            onClick={() => removeTheme(theme.id)}
                            className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <Trash2 size={18} />
                        </button>
                    </div>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mb-4 min-h-[40px]">{theme.description}</p>
                    <div className="flex gap-2 mt-auto">
                      <span className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs px-2 py-1 rounded-full">0 {text('Episodes')}</span>
                      <span className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs px-2 py-1 rounded-full">0 {text('References')}</span>
                    </div>
                </div>
                );
            })}
            
            {filteredThemes.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center py-12 text-gray-400">
                    <Palette size={48} className="mb-4 opacity-50" />
                <p>{text('No themes found. Create one to get started!')}</p>
                </div>
            )}
          </div>
        </>
      ) : activeTab === 'ideas' ? (
        <div className="flex-1">
          <IdeasPanel className="h-full" />
        </div>
      ) : activeTab === 'prompts' ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8">
              <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 max-w-2xl w-full text-center">
                  <Sparkles size={48} className="mx-auto text-purple-500 mb-4" />
                <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">{text('Creative Writing Prompt')}</h3>
                  <p className="text-lg text-gray-600 dark:text-gray-300 mb-8 italic">"{currentPrompt}"</p>
                  <button 
                    onClick={generatePrompt}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2 mx-auto"
                  >
                      <RefreshCw size={20} />
                  {text('Generate New Prompt')}
                  </button>
              </div>
          </div>
      ) : (
          <div className="flex-1 p-4">
              {/* Harmony selector */}
              <div className="mb-6">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">{text('Color Harmony')}</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {HARMONY_LIST.map(h => (
                    <button key={h.id} onClick={() => setPaletteHarmony(h.id)}
                      title={text(h.description)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                        paletteHarmony === h.id
                          ? 'bg-pink-600 text-white border-pink-600'
                          : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-pink-300'
                      }`}>
                      {text(h.label)}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                  {text(HARMONY_LIST.find(h => h.id === paletteHarmony)?.description ?? '')}
                </p>
              </div>

              <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold text-gray-800 dark:text-white">{text('Color Palettes')}</h3>
                  <button onClick={generatePalette}
                    className="bg-pink-600 hover:bg-pink-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors">
                      <Plus size={20} />{text('Generate Palette')}
                  </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {palettes.map((palette) => (
                      <div key={palette.id} className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition-all group">
                          {/* Swatch strip */}
                          <div className="flex h-20 rounded-lg overflow-hidden mb-3">
                              {palette.colors.map((color, i) => (
                                  <div key={i} className="flex-1 relative group/swatch" style={{ backgroundColor: color }} title={color}>
                                      <span className="absolute bottom-0 left-0 right-0 text-[9px] text-center py-0.5 bg-black/30 text-white opacity-0 group-hover/swatch:opacity-100 transition-opacity font-mono truncate px-0.5">
                                          {color.replace('hsl(', '').replace(')', '')}
                                      </span>
                                  </div>
                              ))}
                          </div>
                          {/* Individual swatches row */}
                          <div className="flex gap-1 mb-3">
                              {palette.colors.map((color, i) => (
                                  <div key={i} className="flex-1 h-6 rounded" style={{ backgroundColor: color }} />
                              ))}
                          </div>
                          <div className="flex justify-between items-center">
                              <span className={`text-xs font-semibold capitalize px-2 py-1 rounded-full ${
                                palette.harmony === 'analogous'           ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400'     :
                                palette.harmony === 'complementary'       ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'         :
                                palette.harmony === 'triadic'             ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400' :
                                palette.harmony === 'split-complementary' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'   :
                                palette.harmony === 'monochromatic'       ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'       :
                                                                              'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400'
                                }`}>{text(HARMONY_LIST.find((h) => h.id === palette.harmony)?.label ?? palette.harmony)}</span>
                              <button onClick={() => removePalette(palette.id)}
                                className="text-gray-300 dark:text-gray-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                                  <Trash2 size={16} />
                              </button>
                          </div>
                      </div>
                  ))}
                  {palettes.length === 0 && (
                      <div className="col-span-full text-center py-16 text-gray-400">
                          <Palette size={48} className="mx-auto mb-4 opacity-40" />
                        <p className="font-medium mb-1">{text('No palettes yet')}</p>
                        <p className="text-sm text-gray-300 dark:text-gray-600">{text('Choose a harmony type above and click Generate')}</p>
                      </div>
                  )}
              </div>
          </div>
      )}

      {/* Add Theme Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm" onClick={() => setShowModal(false)}>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl w-96 max-w-full mx-4 border border-gray-100 dark:border-gray-700" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">{text('New Theme')}</h3>
                    <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                        <X size={24} />
                    </button>
                </div>
                
                <form onSubmit={handleAddTheme}>
                    <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{text('Title')}</label>
                        <input
                            type="text"
                            value={newTitle}
                            onChange={(e) => setNewTitle(e.target.value)}
                            className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-gray-900 dark:text-white"
                  placeholder={text('e.g. Hope')}
                            autoFocus
                        />
                    </div>
                    
                    <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{text('Description')}</label>
                        <textarea
                            value={newDesc}
                            onChange={(e) => setNewDesc(e.target.value)}
                            className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-gray-900 dark:text-white resize-none h-24"
                  placeholder={text('What is this theme about?')}
                        />
                    </div>

                    <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{text('Color')}</label>
                        <div className="flex gap-2">
                            {colorOptions.map(c => (
                                <button
                                    key={c.name}
                                    type="button"
                                    onClick={() => setNewColor(c.name)}
                      title={text(c.name)}
                                    className={`w-8 h-8 rounded-full border-2 ${c.name === 'white' ? 'bg-white' : `bg-${c.name}-500`} ${newColor === c.name ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent'}`}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="flex justify-end gap-3">
                        <button 
                            type="button"
                            onClick={() => setShowModal(false)}
                            className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                        >
                        {text('Cancel')}
                        </button>
                        <button 
                            type="submit"
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-lg"
                        >
                        {text('Create Theme')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
}
