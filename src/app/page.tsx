import { Link, useNavigate } from 'react-router-dom';
import { Lightbulb, Heart, Calendar, Clock, RefreshCw, ArrowRight, Plus, CheckSquare, CheckCircle2, Circle, RotateCcw, Flag, ChevronLeft, ChevronRight, MessageCircle, Trash2, Send, Flame, Palette, Users } from "lucide-react";
import { usePluginStore } from "@/store/usePluginStore";
import { useThemeStore } from "@/store/useThemeStore";
import { useIdeaStore } from "@/store/useIdeaStore";
import { useStore } from "@/store/useStore";
import { useMindmapStore } from "@/store/useMindmapStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useCalendarStore } from "@/store/useCalendarStore";
import { useState, useEffect } from "react";
import { ensureUserDirectories } from "@/lib/fileSystem";
import { useTodoStore, todayString, TodoPriority } from "@/store/useTodoStore";
import { useInspirationStore } from "@/store/useInspirationStore";
import { useCommentModerationStore } from '@/store/useCommentModerationStore';
import { screenComment } from '@/lib/profanityFilter';
import { useChatStore } from '@/store/useChatStore';
import { useFriendStore } from '@/store/useFriendStore';
import { useAppDialogs } from '@/components/AppDialogs';
import { StatusDot } from '@/components/StatusDot';
import { useAppTranslation } from '@/lib/appTranslations';
import {
  startOfMonth, endOfMonth, eachDayOfInterval, format, isToday,
  isSameDay, parseISO, addMonths, subMonths,
} from 'date-fns';

const VERSES_EN = [
  { text: "For I know the plans I have for you, declares the LORD, plans to prosper you and not to harm you, plans to give you hope and a future.", ref: "Jeremiah 29:11" },
  { text: "We are God's handiwork, created in Christ Jesus to do good works, which God prepared in advance for us to do.", ref: "Ephesians 2:10" },
  { text: "Whatever you do, work at it with all your heart, as working for the Lord, not for human masters.", ref: "Colossians 3:23" },
  { text: "Let your light shine before others, that they may see your good deeds and glorify your Father in heaven.", ref: "Matthew 5:16" },
  { text: "I can do all this through him who gives me strength.", ref: "Philippians 4:13" },
  { text: "But those who hope in the LORD will renew their strength. They will soar on wings like eagles.", ref: "Isaiah 40:31" },
  { text: "The Lord is my shepherd, I lack nothing.", ref: "Psalm 23:1" },
  { text: "Trust in the Lord with all your heart and lean not on your own understanding.", ref: "Proverbs 3:5" },
  { text: "Be strong and courageous. Do not be afraid; do not be discouraged, for the Lord your God will be with you wherever you go.", ref: "Joshua 1:9" },
  { text: "And we know that in all things God works for the good of those who love him, who have been called according to his purpose.", ref: "Romans 8:28" },
  { text: "Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God.", ref: "Philippians 4:6" },
  { text: "But the fruit of the Spirit is love, joy, peace, forbearance, kindness, goodness, faithfulness, gentleness and self-control.", ref: "Galatians 5:22-23" },
  { text: "The Lord is my light and my salvation—whom shall I fear?", ref: "Psalm 27:1" },
  { text: "Cast all your anxiety on him because he cares for you.", ref: "1 Peter 5:7" },
  { text: "I have told you these things, so that in me you may have peace. In this world you will have trouble. But take heart! I have overcome the world.", ref: "John 16:33" },
];

const VERSES_NB = [
  { text: "For jeg vet hvilke tanker jeg har med dere, sier Herren, fredstanker og ikke ulykkestanker. Jeg vil gi dere fremtid og håp.", ref: "Jeremia 29:11" },
  { text: "For vi er hans verk, skapt i Kristus Jesus til gode gjerninger, som Gud på forhånd har lagt ferdige for at vi skulle vandre i dem.", ref: "Efeserne 2:10" },
  { text: "Alt dere gjør, gjør det av hjertet, som for Herren og ikke for mennesker.", ref: "Kolosserne 3:23" },
  { text: "Slik skal deres lys skinne for menneskene, så de kan se de gode gjerningene deres og prise deres Far i himmelen.", ref: "Matteus 5:16" },
  { text: "Alt makter jeg i ham som gjør meg sterk.", ref: "Filipperne 4:13" },
  { text: "Men de som venter på Herren, får ny kraft. De løfter vingene som ørner.", ref: "Jesaja 40:31" },
  { text: "Herren er min hyrde, jeg mangler ingen ting.", ref: "Salme 23:1" },
  { text: "Stol på Herren av hele ditt hjerte, og støtt deg ikke til din egen forstand.", ref: "Ordspråkene 3:5" },
  { text: "Vær modig og sterk! Frykt ikke og mist ikke motet, for Herren din Gud er med deg hvor du enn går.", ref: "Josva 1:9" },
  { text: "Og vi vet at alle ting virker sammen til gode for dem som elsker Gud, dem som etter hans råd er kalt.", ref: "Romerne 8:28" },
  { text: "Vær ikke bekymret for noe, men legg i alle ting deres bønneemner fram for Gud i bønn og påkallelse med takk.", ref: "Filipperne 4:6" },
  { text: "Åndens frukt er kjærlighet, glede, fred, overbærenhet, vennlighet, godhet, trofasthet, ydmykhet og selvbeherskelse.", ref: "Galaterne 5:22-23" },
  { text: "Herren er mitt lys og min frelse. Hvem skulle jeg frykte?", ref: "Salme 27:1" },
  { text: "Kast all deres bekymring på ham, for han har omsorg for dere.", ref: "1 Peter 5:7" },
  { text: "Dette har jeg talt til dere for at dere skal ha fred i meg. I verden har dere trengsler. Men vær frimodige, jeg har seiret over verden.", ref: "Johannes 16:33" },
];

const NATURE_IMAGES = [
  "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?auto=format&fit=crop&w=1000&q=80", // Mountains
  "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1000&q=80", // Forest
  "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1000&q=80", // Foggy Forest
  "https://images.unsplash.com/photo-1501854140884-074bf6b243e7?auto=format&fit=crop&w=1000&q=80", // Ocean
  "https://images.unsplash.com/photo-1532274402911-5a369e4c4bb5?auto=format&fit=crop&w=1000&q=80", // Landscape
  "https://images.unsplash.com/photo-1465146344425-f00d5f5c8f07?auto=format&fit=crop&w=1000&q=80", // Dark Forest
  "https://images.unsplash.com/photo-1426604966848-d7adac402bff?auto=format&fit=crop&w=1000&q=80", // Hills
];

const THEMES_EN = [
  "Roman Architecture", "Medieval Castle", "Cyberpunk City", "Cozy Farm", 
  "Space Station", "Underwater Base", "Floating Islands", "Steampunk Factory",
  "Elven Forest", "Dwarven Mine", "Desert Oasis", "Arctic Outpost"
];

const THEMES_NB = [
  "Romersk arkitektur", "Middelalderslott", "Cyberpunk-by", "Koselig gård",
  "Romstasjon", "Undervannsbase", "Svevende øyer", "Steampunk-fabrikk",
  "Alveskog", "Dverggruve", "Ørkenoase", "Arktisk utpost"
];

const getDefaultDashboardIndex = (length: number) => {
  if (typeof window === 'undefined') return 0;
  const dayOfYear = Math.floor((new Date().getTime() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 1000 / 60 / 60 / 24);
  return dayOfYear % length;
};

export default function Home() {
  const dialogs = useAppDialogs();
  const { language, text } = useAppTranslation();
  const { plugins } = usePluginStore();
  const themeGeneratorEnabled = plugins.some((p) => p.id === 'minecraft-theme' && p.installed && p.enabled);
  const { themes, addTheme } = useThemeStore();
  const { ideas } = useIdeaStore();
  const { nodes } = useStore();
  const { documents, loadDocuments } = useMindmapStore();
  const { user } = useAuthStore();
  const { todos, toggleTodo, addTodo } = useTodoStore();
  const { events } = useCalendarStore();
  const { channels, fetchChannels, loadingChannels } = useChatStore();
  const { friends, fetchFriends } = useFriendStore();
  const navigate = useNavigate();

  const [calendarMonth, setCalendarMonth] = useState(new Date());

  useEffect(() => { loadDocuments(); }, [loadDocuments]);
  useEffect(() => { if (user) fetchChannels(); }, [user]);
  useEffect(() => { if (user) fetchFriends(); }, [user]);

  const [quickTask, setQuickTask] = useState('');
  const [quickPriority, setQuickPriority] = useState<TodoPriority>('medium');

  const todayTodos = todos.filter((t) => t.scheduledDate === todayString());
  const pendingToday = todayTodos.filter((t) => t.status !== 'done');
  const doneToday = todayTodos.filter((t) => t.status === 'done');

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTask.trim()) return;
    addTodo(quickTask.trim(), 'default', quickPriority);
    setQuickTask('');
  };
  
  const verses = language === 'nb' ? VERSES_NB : VERSES_EN;
  const themeSuggestions = language === 'nb' ? THEMES_NB : THEMES_EN;
  const [verseIndex, setVerseIndex] = useState(() => getDefaultDashboardIndex(VERSES_EN.length));
  const [generatedThemeIndex, setGeneratedThemeIndex] = useState<number | null>(null);
  const verse = verses[verseIndex % verses.length];
  const bgImage = NATURE_IMAGES[verseIndex % NATURE_IMAGES.length];
  const generatedTheme = generatedThemeIndex === null ? '' : themeSuggestions[generatedThemeIndex % themeSuggestions.length];

  // Inspiration reactions & comments
  const { entries: inspEntries, toggleReaction, addComment, deleteComment } = useInspirationStore();
  const { isUserBanned } = useCommentModerationStore();
  const [showComments, setShowComments] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentError, setCommentError] = useState('');
  const todayDateStr = new Date().toISOString().slice(0, 10);
  const _raw = inspEntries[verse.ref] ?? { verseRef: verse.ref, love: 0, fire: 0, userLove: false, userFire: false, comments: [] };
  // Love resets daily — treat as inactive if it was set on a different day
  const inspEntry = {
    ..._raw,
    userLove: _raw.userLove && (_raw as any).userLoveDate === todayDateStr,
  };

  useEffect(() => {
    // Ensure file system structure is correct on load
    ensureUserDirectories().catch(console.error);
  }, []);

  const generateTheme = () => {
    setGeneratedThemeIndex(Math.floor(Math.random() * themeSuggestions.length));
  };

  const refreshInspiration = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering parent clicks if any
    setVerseIndex(Math.floor(Math.random() * verses.length));
    setShowComments(false);
    setCommentDraft('');
  };

  const saveTheme = () => {
    if (!generatedTheme) return;
    addTheme({
      id: Date.now().toString(),
      title: generatedTheme,
      description: text('Generated from Dashboard'),
      color: "blue",
      createdAt: new Date().toISOString()
    });
    void dialogs.alert({ title: text('Theme saved'), message: text('The generated theme was saved to Brainstorming → Themes.') });
  };

  // Stats
  const recentDocs = documents.slice(0, 3);
  const mindMapGroups = nodes.filter((n: any) => n.type === 'groupNode').length;
  const mindMapNodes = nodes.filter((n: any) => n.type !== 'groupNode').length;
  const monthYearLabel = new Intl.DateTimeFormat(language, { month: 'long', year: 'numeric' }).format(calendarMonth);
  const dayHeaders = Array.from({ length: 7 }, (_, index) => {
    const referenceDay = new Date(2024, 0, 7 + index);
    return new Intl.DateTimeFormat(language, { weekday: 'narrow' }).format(referenceDay);
  });
  const formatDateTime = (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(language, options).format(typeof value === 'string' || typeof value === 'number' ? new Date(value) : value);
  const commentToggleLabel = inspEntry.comments.length > 0
    ? `${inspEntry.comments.length} ${text(inspEntry.comments.length === 1 ? 'comment' : 'comments')}`
    : text('Comment');
  const roleLabel = user?.role === 'admin' ? text('Admin') : user?.role ? text('User') : '';

  return (
    <div className="p-8 max-w-7xl mx-auto h-full overflow-y-auto">
      <header className="mb-8 flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-gray-800 dark:text-white">
            {text('Welcome back')}{user?.username ? `, ${user.username}` : user?.email ? `, ${user.email.split('@')[0]}` : ''}!
          </h2>
          {user?.role && (
            <div className="mt-2">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                user.role === 'admin' 
                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' 
                  : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
              }`}>
                {roleLabel}
              </span>
            </div>
          )}
          <p className="text-gray-500 dark:text-gray-400 mt-2">{text('"For I know the plans I have for you," declares the LORD.')}</p>
        </div>
        <div className="flex items-center gap-4">
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Main Content */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Inspiration Widget */}
          <div className="relative rounded-2xl p-8 text-white shadow-lg overflow-hidden group">
            <div 
                className="absolute inset-0 transition-transform duration-[20s] ease-linear group-hover:scale-110" 
                style={{ 
                    backgroundImage: `url(${bgImage})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundColor: '#1a202c' 
                }} 
            />
            <div className="absolute inset-0 bg-black/50" />
            


            <div className="relative z-10 flex flex-col">
                <div className="flex items-center gap-3 mb-3">
                    <div className="bg-white/20 p-2 rounded-lg backdrop-blur-sm">
                        <Lightbulb size={20} className="text-yellow-300" />
                    </div>
                    <h3 className="text-xl font-bold text-white">{text('Daily Inspiration')}</h3>
                </div>
                
                <div className="pl-1 mb-5">
                    <p className="text-white leading-relaxed italic text-lg drop-shadow-md">
                    "{verse.text}"
                    </p>
                    <p className="mt-2 text-sm text-gray-200 font-medium">- {verse.ref}</p>
                </div>

                {/* Reaction bar */}
                <div className="flex items-center gap-3 flex-wrap">
                    <button
                        onClick={() => toggleReaction(verse.ref, 'love')}
                      title={text('Love this verse (resets tomorrow)')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium backdrop-blur-sm transition-all ${
                            inspEntry.userLove
                                ? 'bg-red-500/80 text-white'
                                : 'bg-black/25 text-white/80 hover:bg-red-500/60 hover:text-white'
                        }`}
                    >
                        <Heart size={14} className={inspEntry.userLove ? 'fill-current' : ''} />
                      {text('Love')}
                        {_raw.love > 0 && <span className="ml-0.5 text-xs opacity-80">{_raw.love}</span>}
                    </button>

                    <button
                        onClick={() => toggleReaction(verse.ref, 'fire')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium backdrop-blur-sm transition-all ${
                            inspEntry.userFire
                                ? 'bg-orange-500/80 text-white'
                                : 'bg-black/25 text-white/80 hover:bg-orange-500/60 hover:text-white'
                        }`}
                    >
                        <Flame size={14} className={inspEntry.userFire ? 'fill-current' : ''} />
                      {text('Fire')}
                        {_raw.fire > 0 && <span className="ml-0.5 text-xs opacity-80">{_raw.fire}</span>}
                    </button>

                    <button
                        onClick={() => setShowComments(!showComments)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium backdrop-blur-sm transition-all ml-auto ${
                            showComments
                                ? 'bg-blue-500/80 text-white'
                                : 'bg-black/25 text-white/80 hover:bg-blue-500/60 hover:text-white'
                        }`}
                    >
                        <MessageCircle size={14} />
                      {commentToggleLabel}
                    </button>
                </div>

                {/* Comment panel */}
                {showComments && (
                    <div className="mt-4 bg-black/30 backdrop-blur-sm rounded-xl p-4 space-y-3">
                        {/* Input form */}
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                if (!commentDraft.trim()) return;
                                if (isUserBanned(user?.id ?? '')) {
                                  setCommentError(text('You have been suspended from commenting by an admin.'));
                                    return;
                                }
                                const check = screenComment(commentDraft);
                                if (!check.ok) { setCommentError(check.reason); return; }
                                setCommentError('');
                                addComment(
                                    verse.ref,
                                    commentDraft,
                                    user?.id,
                                    user?.username || user?.email?.split('@')[0]
                                );
                                setCommentDraft('');
                            }}
                            className="flex items-center gap-2"
                        >
                            <input
                                value={commentDraft}
                                onChange={(e) => setCommentDraft(e.target.value)}
                                placeholder={text('Add a reflection...')}
                                className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/50 outline-none focus:border-white/40 transition-colors"
                            />
                            <button
                                type="submit"
                                disabled={!commentDraft.trim()}
                                className="p-2 bg-blue-500/80 hover:bg-blue-500 disabled:opacity-40 rounded-lg text-white transition-colors"
                            >
                                <Send size={14} />
                            </button>
                        </form>
                        {commentError && <p className="text-red-300 text-xs mt-1">{commentError}</p>}

                        {/* Comments list */}
                        {inspEntry.comments.length === 0 ? (
                            <p className="text-center text-white/50 text-xs py-2">{text('No reflections yet. Share your thoughts!')}</p>
                        ) : (
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                {[...inspEntry.comments].reverse().map((c) => (
                                    <div key={c.id} className="flex items-start gap-2 group/c">
                                        <div className="flex-1 bg-white/10 rounded-lg px-3 py-2">
                                            {c.userName && (
                                                <p className="text-yellow-300/90 text-[10px] font-semibold mb-0.5">{c.userName}</p>
                                            )}
                                            <p className="text-white text-sm">{c.text}</p>
                                            <p className="text-white/40 text-[10px] mt-1">
                                                {formatDateTime(c.createdAt, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>
                                        {(c.userId === user?.id || user?.role === 'admin') && (
                                        <button
                                            onClick={() => deleteComment(verse.ref, c.id)}
                                            className="mt-1 p-1 text-white/30 hover:text-red-400 opacity-0 group-hover/c:opacity-100 transition-all"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
          </div>

          {/* Overview Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {/* Mindstorming Stats */}
             <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="flex justify-between items-start mb-4">
                    <div className="bg-red-100 dark:bg-red-900/30 p-2 rounded-lg text-red-600 dark:text-red-400">
                        <Heart size={20} />
                    </div>
                    <span className="text-2xl font-bold text-gray-800 dark:text-white">{themes.length}</span>
                </div>
                <h3 className="font-bold text-gray-700 dark:text-gray-200">{text('Brainstorming Themes')}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{text('Active themes for your project')}</p>
                <Link to="/brainstorming" className="text-sm text-blue-600 dark:text-blue-400 mt-4 inline-block hover:underline">{text('Manage Themes')} &rarr;</Link>
             </div>

             {/* Ideas Stats */}
             <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="flex justify-between items-start mb-4">
                    <div className="bg-yellow-100 dark:bg-yellow-900/30 p-2 rounded-lg text-yellow-600 dark:text-yellow-400">
                        <Lightbulb size={20} />
                    </div>
                    <span className="text-2xl font-bold text-gray-800 dark:text-white">{ideas.length}</span>
                </div>
                <h3 className="font-bold text-gray-700 dark:text-gray-200">{text('Captured Ideas')}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{text('Brainstorming snippets')}</p>
                <Link to="/brainstorming?tab=ideas" className="text-sm text-blue-600 dark:text-blue-400 mt-4 inline-block hover:underline">{text('View Ideas')} &rarr;</Link>
             </div>

             {/* Mindmap Documents — full-width card */}
             <Link to="/mindmap" className="md:col-span-2 group block bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:border-yellow-400 dark:hover:border-yellow-500 hover:shadow-md transition-all p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="bg-yellow-100 dark:bg-yellow-900/30 p-3 rounded-xl text-yellow-600 dark:text-yellow-400 shrink-0">
                            <Lightbulb size={28} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-gray-800 dark:text-white group-hover:text-yellow-600 dark:group-hover:text-yellow-400 transition-colors">{text('Mindmap Documents')}</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{text('Your ideas, concepts and visual maps')}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-8 shrink-0">
                        <div className="text-center">
                            <span className="text-3xl font-bold text-gray-800 dark:text-white block">{documents.length}</span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">{text('Documents')}</span>
                        </div>
                        <div className="text-center">
                            <span className="text-3xl font-bold text-gray-800 dark:text-white block">{mindMapNodes}</span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">{text('Nodes')}</span>
                        </div>
                        <div className="text-center">
                            <span className="text-3xl font-bold text-gray-800 dark:text-white block">{mindMapGroups}</span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">{text('Groups')}</span>
                        </div>
                        <div className="hidden sm:flex items-center gap-1 text-yellow-600 dark:text-yellow-400 font-medium text-sm">
                            {text('Open')} <ArrowRight size={16} />
                        </div>
                    </div>
                </div>
             </Link>
          </div>

          {/* Recent Documents List */}
          <section>
            <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
              <Clock size={20} className="text-gray-400" />
              {text('Recent Documents')}
            </h3>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
              {recentDocs.length > 0 ? (
                  recentDocs.map(doc => (
                    <Link key={doc.id} to={(doc as any).type === 'moodboard' ? `/mindmap/moodboard?id=${doc.id}` : `/mindmap/editor?id=${doc.id}`}>
                        <div className="p-4 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer flex items-center gap-4">
                            {(doc as any).type === 'moodboard'
                              ? <div className="bg-purple-100 dark:bg-purple-900/30 p-2 rounded-lg text-purple-600 dark:text-purple-400"><Palette size={18} /></div>
                              : <div className="bg-yellow-100 dark:bg-yellow-900/30 p-2 rounded-lg text-yellow-600 dark:text-yellow-400"><Lightbulb size={18} /></div>
                            }
                            <div className="flex-1">
                            <h4 className="font-medium text-gray-900 dark:text-white">{doc.title}</h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{text('Last edited:')} {formatDateTime(doc.lastModified, { dateStyle: 'medium' })}</p>
                            </div>
                            <ArrowRight size={16} className="text-gray-400" />
                        </div>
                    </Link>
                  ))
              ) : (
                  <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                      {text('No mindmaps yet. Create one to get started!')}
                  </div>
              )}
            </div>
          </section>

        </div>

        {/* Right Column: Sidebar Widgets */}
        <div className="space-y-8">
          
          {/* Theme Generator Widget — only shown when the Theme Generator app is installed */}
          {themeGeneratorEnabled && (
            <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
               <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                    <RefreshCw size={18} className="text-primary" />
                    {text('Generator')}
                  </h3>
               </div>
               
               <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-6 text-center mb-4 border border-dashed border-gray-300 dark:border-gray-700">
                  {generatedTheme ? (
                    <div className="animate-in fade-in zoom-in duration-300">
                      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-widest font-semibold mb-2">{text('Suggestion')}</p>
                      <p className="text-xl font-bold text-gray-900 dark:text-white">{generatedTheme}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 dark:text-gray-500">{text('Need inspiration?')}</p>
                  )}
               </div>

               <div className="flex flex-col gap-2">
                   <button 
                    onClick={generateTheme}
                    className="w-full text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-3 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
                  >
                    <RefreshCw size={14} />
                    {text('Randomize')}
                  </button>
                   {generatedTheme && (
                       <button 
                         onClick={saveTheme}
                         className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors text-sm"
                       >
                         <Plus size={16} /> {text('Save Theme')}
                       </button>
                   )}
               </div>
            </section>
          )}

          {/* Mini Calendar Widget */}
          <section>
            <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-3 flex items-center gap-2">
              <Calendar size={18} className="text-blue-500" />
              {text('Calendar')}
            </h3>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
              {/* Month navigation */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <button
                  onClick={() => setCalendarMonth((m) => subMonths(m, 1))}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  {monthYearLabel}
                </span>
                <button
                  onClick={() => setCalendarMonth((m) => addMonths(m, 1))}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
                >
                  <ChevronRight size={14} />
                </button>
              </div>

              {/* Day-of-week headers */}
              <div className="grid grid-cols-7 px-2 pt-2">
                {dayHeaders.map((dayHeader, i) => (
                  <div key={i} className="text-center text-[10px] font-semibold text-gray-400 dark:text-gray-500 pb-1">{dayHeader}</div>
                ))}
              </div>

              {/* Day grid */}
              <div className="grid grid-cols-7 px-2 pb-3">
                {/* Padding for first day */}
                {Array(startOfMonth(calendarMonth).getDay()).fill(null).map((_, i) => (
                  <div key={`p-${i}`} />
                ))}
                {eachDayOfInterval({ start: startOfMonth(calendarMonth), end: endOfMonth(calendarMonth) }).map((day) => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const dayEvents = events.filter((e) => e.date === dateStr);
                  const dayTodos  = todos.filter((t) => t.scheduledDate === dateStr && t.status !== 'done');
                  const hasItems  = dayEvents.length > 0 || dayTodos.length > 0;
                  const todayDay  = isToday(day);
                  return (
                    <button
                      key={dateStr}
                      onClick={() => navigate('/calendar')}
                      className={`flex flex-col items-center py-1 rounded-lg transition-colors text-[11px] font-medium hover:bg-gray-50 dark:hover:bg-gray-700/40 ${
                        todayDay
                          ? 'text-white'
                          : 'text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      <span className={`w-6 h-6 flex items-center justify-center rounded-full ${todayDay ? 'bg-blue-600 text-white' : ''}`}>
                        {format(day, 'd')}
                      </span>
                      {hasItems && (
                        <span className="flex gap-0.5 mt-0.5">
                          {dayTodos.length > 0  && <span className="w-1 h-1 rounded-full bg-teal-400" />}
                          {dayEvents.length > 0 && <span className="w-1 h-1 rounded-full bg-blue-400" />}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Legend + link */}
              <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <span className="flex items-center gap-2 text-[10px] text-gray-400">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-teal-400 inline-block" /> {text('tasks')}</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> {text('events')}</span>
                </span>
                <Link to="/calendar" className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                  {text('Full view')} <ArrowRight size={11} />
                </Link>
              </div>
            </div>
          </section>

          {/* Chat Widget */}
          {user && (
            <section>
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-3 flex items-center gap-2">
                <MessageCircle size={18} className="text-blue-500" />
                {text('Messages')}
                {channels.filter((ch) => ch.last_message).length > 0 && (
                  <span className="ml-auto text-xs font-normal bg-blue-600 text-white px-1.5 py-0.5 rounded-full">
                    {channels.filter((ch) => ch.last_message).length}
                  </span>
                )}
              </h3>
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                {loadingChannels ? (
                  <div className="py-6 text-center text-sm text-gray-400">{text('Loading...')}</div>
                ) : channels.length === 0 ? (
                  <div className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
                    {text('No messages yet')}
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {channels.slice(0, 5).map((ch) => (
                      <button
                        key={ch.id}
                        onClick={() => navigate(`/chat?channel=${ch.id}`)}
                        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors text-left"
                      >
                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 text-xs font-bold">
                          {ch.type === 'dm' ? (ch.other_username?.[0] ?? '?').toUpperCase() : ch.type === 'project' ? '📁' : '#'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-800 dark:text-white truncate">
                            {ch.type === 'dm' ? ch.other_username : ch.channel_label}
                          </p>
                          {ch.last_message ? (
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                              <span className="font-medium">{ch.last_message.sender_username}:</span> {ch.last_message.content}
                            </p>
                          ) : (
                            <p className="text-[11px] text-gray-400">{text('No messages yet')}</p>
                          )}
                        </div>
                        {ch.last_message && (
                          <span className="text-[10px] text-gray-400 shrink-0 mt-0.5">
                            {formatDateTime(ch.last_message.sent_at, { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700">
                  <Link to="/chat" className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                    {text('Open chat')} <ArrowRight size={11} />
                  </Link>
                </div>
              </div>
            </section>
          )}

          {/* Friends Widget */}
          {user && (
            <section>
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-3 flex items-center gap-2">
                <Users size={18} className="text-green-500" />
                {text('Friends')}
                {friends.length > 0 && (
                  <span className="ml-auto text-xs font-normal bg-green-600 text-white px-1.5 py-0.5 rounded-full">
                    {friends.length}
                  </span>
                )}
              </h3>
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                {friends.length === 0 ? (
                  <div className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
                    {text('No friends yet')}
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {friends.slice(0, 6).map((f) => (
                      <button
                        key={f.friend_id}
                        onClick={() => navigate('/chat')}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors text-left"
                      >
                        <div className="relative shrink-0">
                          <div className="w-7 h-7 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 flex items-center justify-center text-xs font-bold">
                            {(f.friend_username?.[0] ?? '?').toUpperCase()}
                          </div>
                          <StatusDot status={f.friend_presence} sizeClass="w-2 h-2" className="absolute -bottom-0.5 -right-0.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-800 dark:text-white truncate">
                            {f.friend_username}
                            <span className="text-gray-400 font-normal">#{f.friend_discriminator || '0000'}</span>
                          </p>
                          <p className="text-[10px] text-gray-400 capitalize">{text(f.friend_presence ?? 'offline')}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700">
                  <Link to="/chat" className="text-xs text-green-600 dark:text-green-400 hover:underline flex items-center gap-1">
                    {text('Open chat')} <ArrowRight size={11} />
                  </Link>
                </div>
              </div>
            </section>
          )}

          {/* Today's Tasks Widget */}
          <section>
            <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-3 flex items-center gap-2">
              <CheckSquare size={18} className="text-blue-500" />
              {text("Today's Tasks")}
              <span className="ml-auto text-sm font-normal text-gray-400">
                {doneToday.length}/{todayTodos.length}
              </span>
            </h3>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
              {/* Date bar */}
              <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                  {formatDateTime(new Date(), { weekday: 'long', month: 'long', day: 'numeric' })}
                </span>
                {todayTodos.length > 0 && (
                  <div className="h-1.5 w-24 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-400 rounded-full transition-all"
                      style={{ width: `${Math.round((doneToday.length / todayTodos.length) * 100)}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Quick-add form */}
              <form onSubmit={handleQuickAdd} className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-700">
                <Plus size={13} className="text-gray-400 shrink-0" />
                <input
                  value={quickTask}
                  onChange={(e) => setQuickTask(e.target.value)}
                  placeholder={text('Add task…')}
                  className="flex-1 text-xs bg-transparent text-gray-800 dark:text-gray-100 placeholder-gray-400 outline-none min-w-0"
                />
                <select
                  value={quickPriority}
                  onChange={(e) => setQuickPriority(e.target.value as TodoPriority)}
                  className="text-[10px] border border-gray-200 dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-700 text-gray-500 outline-none cursor-pointer shrink-0"
                >
                  <option value="low">{text('Low')}</option>
                  <option value="medium">{text('Medium')}</option>
                  <option value="high">{text('High')}</option>
                </select>
                <button type="submit" disabled={!quickTask.trim()} className="text-blue-500 hover:text-blue-600 disabled:opacity-30 shrink-0">
                  <Plus size={14} />
                </button>
              </form>

              {/* Tasks list */}
              <div className="max-h-64 overflow-y-auto">
                {todayTodos.length === 0 ? (
                  <div className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                    {text("No tasks today - you're free!")}
                  </div>
                ) : (
                  <>
                    {/* Pending first */}
                    {pendingToday.map((todo) => (
                      <div
                        key={todo.id}
                        className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group border-b border-gray-50 dark:border-gray-700/30 last:border-0"
                      >
                        <button onClick={() => toggleTodo(todo.id)} className="shrink-0 hover:scale-110 transition-transform">
                          <Circle size={15} className="text-gray-300 dark:text-gray-500 group-hover:text-gray-400" />
                        </button>
                        <span className="flex-1 text-xs text-gray-800 dark:text-gray-100 truncate">{todo.title}</span>
                        {todo.rolledOver && (
                          <span title={text('Rolled over from previous day')}>
                            <RotateCcw size={10} className="text-amber-400 shrink-0" />
                          </span>
                        )}
                        <Flag size={10} className={`shrink-0 ${
                          todo.priority === 'high' ? 'text-red-500' :
                          todo.priority === 'medium' ? 'text-yellow-400' : 'text-gray-300'
                        }`} />
                      </div>
                    ))}
                    {/* Done todos (collapsed visually) */}
                    {doneToday.map((todo) => (
                      <div
                        key={todo.id}
                        className="flex items-center gap-2.5 px-3 py-2 opacity-45 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group border-b border-gray-50 dark:border-gray-700/30 last:border-0"
                      >
                        <button onClick={() => toggleTodo(todo.id)} className="shrink-0 hover:scale-110 transition-transform">
                          <CheckCircle2 size={15} className="text-green-500" />
                        </button>
                        <span className="flex-1 text-xs text-gray-400 line-through truncate">{todo.title}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>

              {/* Footer link */}
              <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700">
                <Link to="/todo" className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                  {text('View all tasks')} <ArrowRight size={11} />
                </Link>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
