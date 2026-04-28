import { useState, useMemo } from 'react';
import { X, Search, Star, Check, Trash2, BookOpen, BarChart2, Calendar, Brain, Layout, Lightbulb, Map, Zap, ClipboardList, FileText, Wrench, GitBranch, type LucideIcon } from 'lucide-react';
import { useAppTranslation } from '@/lib/appTranslations';
import { BUILT_IN_TEMPLATES, MindmapTemplate, useMindmapStore } from '@/store/useMindmapStore';

// ─── Template icon map (icon-id → LucideIcon component) ──────────────────────
const TEMPLATE_ICON_MAP: Record<string, LucideIcon> = {
  'map':            Map,
  'zap':            Zap,
  'search':         Search,
  'clipboard-list': ClipboardList,
  'file-text':      FileText,
  'wrench':         Wrench,
  'book-open':      BookOpen,
  'calendar':       Calendar,
  'git-branch':     GitBranch,
  'brain':          Brain,
};

function TemplateIcon({ id, size = 16 }: { id: string; size?: number }) {
  const Icon = TEMPLATE_ICON_MAP[id] ?? Lightbulb;
  return <Icon size={size} />;
}

type Category = 'all' | MindmapTemplate['category'];

const CATEGORY_LABELS: Record<Category, string> = {
  all: 'All Templates',
  general: 'General',
  planning: 'Planning',
  analysis: 'Analysis',
  story: 'Story & Writing',
  personal: 'Personal',
  custom: 'My Templates',
};

const CATEGORY_ICONS: Record<Category, React.ReactNode> = {
  all: <Layout size={15} />,
  general: <Brain size={15} />,
  planning: <Calendar size={15} />,
  analysis: <BarChart2 size={15} />,
  story: <BookOpen size={15} />,
  personal: <Star size={15} />,
  custom: <Lightbulb size={15} />,
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (title: string, templateId: string) => void;
}

export default function MindmapTemplateModal({ isOpen, onClose, onCreate }: Props) {
  const { t, text } = useAppTranslation();
  const { customTemplates, deleteCustomTemplate } = useMindmapStore();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('blank');
  const [title, setTitle] = useState('');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<Category>('all');

  const getTemplateName = (template?: MindmapTemplate | null) => {
    if (!template) return t('mindmapTemplateModal.defaultTitlePlaceholder');
    return template.isBuiltIn ? text(template.name) : template.name;
  };

  const getTemplateDescription = (template: MindmapTemplate) => (
    template.isBuiltIn ? text(template.description) : template.description
  );

  const categoryLabels: Record<Category, string> = {
    all: t('mindmapTemplateModal.categoryAll'),
    general: t('mindmapTemplateModal.categoryGeneral'),
    planning: t('mindmapTemplateModal.categoryPlanning'),
    analysis: t('mindmapTemplateModal.categoryAnalysis'),
    story: t('mindmapTemplateModal.categoryStory'),
    personal: t('mindmapTemplateModal.categoryPersonal'),
    custom: t('mindmapTemplateModal.categoryCustom'),
  };

  const allTemplates: MindmapTemplate[] = [
    ...BUILT_IN_TEMPLATES,
    ...customTemplates,
  ];

  const filtered = useMemo(() => {
    let list = allTemplates;
    if (activeCategory !== 'all') {
      list = list.filter((t) => t.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((template) => {
        const name = getTemplateName(template).toLowerCase();
        const description = getTemplateDescription(template).toLowerCase();
        return name.includes(q) || description.includes(q);
      });
    }
    return list;
  }, [allTemplates, activeCategory, search, text, t]);

  const selectedTemplate = allTemplates.find((t) => t.id === selectedTemplateId);

  const handleCreate = () => {
    const name = title.trim() || getTemplateName(selectedTemplate) || t('mindmapTemplateModal.untitled');
    onCreate(name, selectedTemplateId);
    // reset state
    setTitle('');
    setSelectedTemplateId('blank');
    setSearch('');
    setActiveCategory('all');
  };

  if (!isOpen) return null;

  const categories: Category[] = ['all', 'general', 'planning', 'analysis', 'story', 'personal'];
  if (customTemplates.length > 0) categories.push('custom');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('mindmapTemplateModal.title')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('mindmapTemplateModal.subtitle')}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* Left sidebar — categories */}
          <aside className="w-52 shrink-0 border-r border-gray-200 dark:border-gray-700 p-3 flex flex-col gap-1 overflow-y-auto">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left w-full ${
                  activeCategory === cat
                    ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <span className="opacity-70">{CATEGORY_ICONS[cat]}</span>
                {categoryLabels[cat]}
                {cat === 'custom' && (
                  <span className="ml-auto text-xs bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-300 px-1.5 py-0.5 rounded-full">
                    {customTemplates.length}
                  </span>
                )}
              </button>
            ))}
          </aside>

          {/* Main — template grid */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Search */}
            <div className="px-4 pt-4 pb-3 shrink-0">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder={t('mindmapTemplateModal.searchPlaceholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-yellow-500 outline-none text-gray-800 dark:text-white"
                />
              </div>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                  <Lightbulb size={32} strokeWidth={1} className="mb-2" />
                  <p className="text-sm">{t('mindmapTemplateModal.empty')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {filtered.map((tpl) => (
                    <TemplateCard
                      key={tpl.id}
                      template={tpl}
                      selected={selectedTemplateId === tpl.id}
                      onSelect={() => setSelectedTemplateId(tpl.id)}
                      onDelete={!tpl.isBuiltIn ? () => deleteCustomTemplate(tpl.id) : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 shrink-0 flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              {t('mindmapTemplateModal.mindmapTitle')}
            </label>
            <input
              autoFocus
              type="text"
              placeholder={getTemplateName(selectedTemplate)}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') onClose();
              }}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-yellow-500 outline-none text-gray-900 dark:text-white"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0 pt-5">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              {t('mindmapTemplateModal.cancel')}
            </button>
            <button
              onClick={handleCreate}
              className="px-5 py-2 text-sm rounded-lg bg-yellow-500 hover:bg-yellow-600 text-white font-semibold transition-colors shadow-sm"
            >
              {t('mindmapTemplateModal.create')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Template Card ────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  selected,
  onSelect,
  onDelete,
}: {
  template: MindmapTemplate;
  selected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}) {
  const { t, text } = useAppTranslation();
  const nodeCount = template.nodes.length;
  const edgeCount = template.edges.length;
  const templateName = template.isBuiltIn ? text(template.name) : template.name;
  const templateDescription = template.isBuiltIn ? text(template.description) : template.description;

  return (
    <button
      onClick={onSelect}
      className={`group relative text-left p-4 rounded-xl border-2 transition-all hover:shadow-md ${
        selected
          ? 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 shadow-md'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-yellow-300 dark:hover:border-yellow-700'
      }`}
    >
      {/* Selection checkmark */}
      {selected && (
        <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-yellow-400 flex items-center justify-center">
          <Check size={12} className="text-white" strokeWidth={3} />
        </span>
      )}

      {/* Delete button for custom templates */}
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute top-3 right-3 p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-all"
          title={t('mindmapTemplateModal.deleteTemplate')}
        >
          <Trash2 size={13} />
        </button>
      )}

      {/* Preview mini-map */}
      <TemplateMinimap template={template} />

      {/* Info */}
      <div className="mt-3">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-base text-gray-500 dark:text-gray-400"><TemplateIcon id={template.icon} size={16} /></span>
          <h3 className={`font-semibold text-sm truncate ${selected ? 'text-yellow-800 dark:text-yellow-300' : 'text-gray-800 dark:text-white'}`}>
            {templateName}
          </h3>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
          {templateDescription}
        </p>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
            {t('mindmapTemplateModal.nodes', { count: String(nodeCount) })}
          </span>
          <span className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300 inline-block" />
            {t('mindmapTemplateModal.connections', { count: String(edgeCount) })}
          </span>
          {!template.isBuiltIn && (
            <span className="text-[10px] text-yellow-600 dark:text-yellow-400 font-medium">{t('mindmapTemplateModal.custom')}</span>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Template minimap SVG preview ─────────────────────────────────────────────

function TemplateMinimap({ template }: { template: MindmapTemplate }) {
  if (template.nodes.length === 0) return (
    <div className="w-full h-24 bg-gray-50 dark:bg-gray-700/50 rounded-lg flex items-center justify-center text-gray-300 dark:text-gray-500">
      <TemplateIcon id={template.icon} size={28} />
    </div>
  );

  // Compute bounds
  const xs = template.nodes.map((n) => n.position.x);
  const ys = template.nodes.map((n) => n.position.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const W = 180, H = 96;
  const padX = 24, padY = 16;
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const scale = Math.min((W - padX * 2) / rangeX, (H - padY * 2) / rangeY, 1);

  const px = (x: number) => padX + (x - minX) * scale + (W - padX * 2 - rangeX * scale) / 2;
  const py = (y: number) => padY + (y - minY) * scale + (H - padY * 2 - rangeY * scale) / 2;

  const nodeById: Record<string, { x: number; y: number }> = {};
  template.nodes.forEach((nd) => { nodeById[nd.id] = { x: px(nd.position.x), y: py(nd.position.y) }; });

  return (
    <div className="w-full h-24 bg-gray-50 dark:bg-gray-700/50 rounded-lg overflow-hidden">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full h-full">
        {/* Edges */}
        {template.edges.map((edge) => {
          const s = nodeById[edge.source];
          const t = nodeById[edge.target];
          if (!s || !t) return null;
          return (
            <line
              key={edge.id}
              x1={s.x} y1={s.y} x2={t.x} y2={t.y}
              stroke="#cbd5e1" strokeWidth={1.5}
            />
          );
        })}
        {/* Nodes */}
        {template.nodes.map((nd, i) => {
          const pos = nodeById[nd.id];
          const isRoot = i === 0;
          return (
            <g key={nd.id}>
              <rect
                x={pos.x - (isRoot ? 14 : 8)}
                y={pos.y - (isRoot ? 7 : 4)}
                width={isRoot ? 28 : 16}
                height={isRoot ? 14 : 8}
                rx={isRoot ? 7 : 4}
                fill={isRoot ? '#fbbf24' : '#e2e8f0'}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
