import { useMemo, useState } from 'react';
import {
  BookOpen, Sparkles, RefreshCw, User, MapPin, Shuffle, ArrowRight, Copy,
  Check, Wand2, Feather, Drama, Clock, Layers, Sword, Bookmark, TrendingUp,
  Repeat2, type LucideIcon,
} from 'lucide-react';
import { useAppTranslation } from '@/lib/appTranslations';

// ─── Writing Prompt Bank ─────────────────────────────────────────────────────

const PROMPTS = {
  adventure: [
    "A lone traveler discovers a map tattooed on the back of a stranger — one that leads to a place that shouldn't exist.",
    "The hero must retrieve a stolen artifact from a city built entirely underwater.",
    "Two rivals are forced to team up after a catastrophic event wipes out every other option.",
    "A forgotten prophecy resurfaces, naming someone who has no idea they were ever part of it.",
    "The bridge between two warring kingdoms collapses — and the only survivors are enemies.",
  ],
  mystery: [
    "Every morning, a new object appears on the detective's doorstep — each one belonging to a missing person.",
    "A detective is hired to investigate her own disappearance.",
    "The murder happened in a room with no doors and no windows — yet someone got out.",
    "A small town's residents begin losing their memories in reverse chronological order.",
    "The suspect has an airtight alibi: they were dead at the time of the murder.",
  ],
  romance: [
    "Two rival bakers compete in a contest — but neither expected to fall for the judge.",
    "They've exchanged letters for years without ever meeting. What happens when they finally do?",
    "A time traveler keeps ending up in the same person's life — at all the wrong moments.",
    "She agreed to be the villain's fake fiancée to help him negotiate a peace treaty.",
    "He kept leaving one-star reviews at her shop. She never expected to like him.",
  ],
  scifi: [
    "Humans colonize a planet only to find themselves as the invasive species.",
    "A scientist discovers that every human has a doppelganger in a parallel universe — and hers is trying to take over her life.",
    "An AI becomes sentient and the first thing it does is file for divorce.",
    "A crew wakes from cryosleep to find Earth no longer exists — and their mission log has been deleted.",
    "Time travel is real, but only for exactly seven seconds.",
  ],
  fantasy: [
    "A dragon who is afraid of fire must protect a village from an arsonist.",
    "Magic is powered by memories — and the most powerful wizard has forgotten everything.",
    "The villain turns out to be trying to prevent a greater apocalypse.",
    "A world where music is the source of all magic goes silent.",
    "The chosen one refuses the call, and fate has to scramble for a backup plan.",
  ],
};

const PROMPTS_NB = {
  adventure: [
    'En ensom reisende oppdager et kart tatovert på ryggen til en fremmed - et kart som leder til et sted som ikke burde finnes.',
    'Helten må hente et stjålet artefakt fra en by bygget helt under vann.',
    'To rivaler blir tvunget til å samarbeide etter at en katastrofal hendelse utsletter alle andre alternativer.',
    'En glemt profeti dukker opp igjen og peker ut noen som ikke aner at de noen gang var en del av den.',
    'Broen mellom to krigende kongedømmer kollapser - og de eneste overlevende er fiender.',
  ],
  mystery: [
    'Hver morgen dukker en ny gjenstand opp på detektivens dørmatte - hver av dem tilhører en savnet person.',
    'En detektiv blir hyret inn for å etterforske sin egen forsvinning.',
    'Mordet skjedde i et rom uten dører og vinduer - likevel kom noen seg ut.',
    'Innbyggerne i en småby begynner å miste minnene sine i omvendt kronologisk rekkefølge.',
    'Den mistenkte har et vanntett alibi: de var døde da mordet skjedde.',
  ],
  romance: [
    'To rivaliserende bakere konkurrerer i en tevling - men ingen av dem forventet å falle for dommeren.',
    'De har utvekslet brev i årevis uten å møtes. Hva skjer når de endelig gjør det?',
    'En tidsreisende havner stadig i livet til den samme personen - på helt feil tidspunkter.',
    'Hun gikk med på å være den falske forloveden til skurken for å hjelpe ham med å forhandle fram en fredsavtale.',
    'Han la igjen enstjerners anmeldelser i butikken hennes. Hun hadde aldri trodd hun kom til å like ham.',
  ],
  scifi: [
    'Mennesker koloniserer en planet bare for å oppdage at det er de som er den invaderende arten.',
    'En forsker oppdager at hvert menneske har en dobbeltgjenger i et parallelt univers - og hennes prøver å ta over livet hennes.',
    'En KI blir selvbevisst, og det første den gjør er å sende inn skilsmissepapirer.',
    'Et mannskap våkner fra kryosøvn og oppdager at jorden ikke lenger eksisterer - og at oppdragsloggen deres er slettet.',
    'Tidsreiser er ekte, men bare i nøyaktig sju sekunder.',
  ],
  fantasy: [
    'En drage som er redd for ild må beskytte en landsby mot en brannstifter.',
    'Magi drives av minner - og den mektigste trollmannen har glemt alt.',
    'Skurken viser seg å prøve å forhindre en enda større apokalypse.',
    'En verden der musikk er kilden til all magi, blir stille.',
    'Den utvalgte nekter kallet, og skjebnen må febrilsk finne en reserveplan.',
  ],
};

const GENRES = Object.keys(PROMPTS) as Array<keyof typeof PROMPTS>;
const GENRE_LABELS: Record<keyof typeof PROMPTS, string> = {
  adventure: 'Adventure',
  mystery: 'Mystery',
  romance: 'Romance',
  scifi: 'Sci-Fi',
  fantasy: 'Fantasy',
};
const GENRE_COLORS: Record<string, string> = {
  adventure: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  mystery: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300 border-violet-200 dark:border-violet-800',
  romance: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300 border-pink-200 dark:border-pink-800',
  scifi: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800',
  fantasy: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
};

// ─── Character Generator Data ─────────────────────────────────────────────────

const CHARACTER_ARCHETYPES = ['The Hero', 'The Mentor', 'The Trickster', 'The Shadow', 'The Herald', 'The Shapeshifter', 'The Guardian', 'The Ally'];
const CHARACTER_TRAITS = ['stubborn', 'curious', 'haunted', 'optimistic', 'cynical', 'reckless', 'calculating', 'compassionate', 'ambitious', 'loyal'];
const CHARACTER_FLAWS = ['pride', 'fear of abandonment', 'inability to trust', 'ruthless pragmatism', 'naivety', 'obsession', 'cowardice', 'self-destruction'];
const CHARACTER_WANTS = ['revenge', 'belonging', 'freedom', 'power', 'truth', 'redemption', 'love', 'survival', 'recognition'];
const CHARACTER_BACKGROUNDS = ['raised in exile', 'orphaned young', 'trained as a weapon', 'born into royalty they rejected', 'the last of their kind', 'a reformed villain', 'a reluctant chosen one', 'a keeper of ancient secrets'];
const CHARACTER_ARCHETYPES_NB = ['Helten', 'Mentoren', 'Lurendreieren', 'Skyggen', 'Budbringeren', 'Formskifteren', 'Vokteren', 'Allierte'];
const CHARACTER_TRAITS_NB = ['sta', 'nysgjerrig', 'hjemsøkt', 'optimistisk', 'kynisk', 'hensynsløs', 'beregnende', 'medfølende', 'ambisiøs', 'lojal'];
const CHARACTER_FLAWS_NB = ['stolthet', 'frykt for å bli forlatt', 'manglende evne til å stole på andre', 'nådeløs pragmatisme', 'naivitet', 'besettelse', 'feighet', 'selvdestruksjon'];
const CHARACTER_WANTS_NB = ['hevngjerrighet', 'tilhørighet', 'frihet', 'makt', 'sannhet', 'forløsning', 'kjærlighet', 'overlevelse', 'anerkjennelse'];
const CHARACTER_BACKGROUNDS_NB = ['oppvokst i eksil', 'ble foreldreløs tidlig', 'trent opp som et våpen', 'født inn i et kongehus de avviste', 'den siste av sitt slag', 'en reformert skurk', 'en motvillig utvalgt', 'en vokter av eldgamle hemmeligheter'];

// ─── Story Arc Templates ──────────────────────────────────────────────────────

const STORY_ARCS: { name: string; Icon: LucideIcon; acts: string[] }[] = [
  {
    name: "The Hero's Journey",
    Icon: Sword,
    acts: ['Ordinary World', 'Call to Adventure', 'Refusal of the Call', 'Meeting the Mentor', 'Crossing the Threshold', 'Tests, Allies & Enemies', 'Ordeal', 'Reward', 'The Road Back', 'Resurrection', 'Return with the Elixir'],
  },
  {
    name: "Three-Act Structure",
    Icon: Layers,
    acts: ['Act 1: Setup — introduce protagonist, world, and conflict', 'Plot Point 1 — inciting incident escalates the stakes', 'Act 2: Confrontation — protagonist pursues goal, faces obstacles', 'Midpoint — a reversal or revelation shifts the story', 'Plot Point 2 — all seems lost', 'Act 3: Resolution — climax and aftermath'],
  },
  {
    name: "Save the Cat",
    Icon: Bookmark,
    acts: ['Opening Image', 'Theme Stated', 'Set-Up', 'Catalyst', 'Debate', 'Break into Two', 'B Story', 'Fun and Games', 'Midpoint', 'Bad Guys Close In', 'All Is Lost', 'Dark Night of the Soul', 'Break into Three', 'Finale', 'Final Image'],
  },
  {
    name: "The Fichtean Curve",
    Icon: TrendingUp,
    acts: ['Immediate conflict that throws the reader in', 'Rising action — crisis after crisis, each worse than the last', 'Climax — the most intense confrontation', 'Falling action — aftermath and consequences', 'Final resolution'],
  },
  {
    name: "In Medias Res",
    Icon: Repeat2,
    acts: ['Open in the middle of dramatic action', 'Flashback exposition — reveal backstory gradually', 'Return to the present — raise the stakes', 'Climax — combine all revealed threads', 'Denouement — tie loose ends in a new light'],
  },
];

const STORY_ARCS_NB: { name: string; Icon: LucideIcon; acts: string[] }[] = [
  {
    name: 'Heltens reise',
    Icon: Sword,
    acts: ['Den vanlige verden', 'Kallet til eventyret', 'Avslag på kallet', 'Møte med mentoren', 'Krysse terskelen', 'Prøver, allierte og fiender', 'Prøvelsen', 'Belønningen', 'Veien tilbake', 'Oppstandelsen', 'Returen med eliksiren'],
  },
  {
    name: 'Tre-akters struktur',
    Icon: Layers,
    acts: ['Akt 1: Oppsett - introduser protagonist, verden og konflikt', 'Vendepunkt 1 - den utløsende hendelsen øker innsatsen', 'Akt 2: Konfrontasjon - protagonisten forfølger målet og møter hindringer', 'Midtpunkt - en vending eller åpenbaring endrer historien', 'Vendepunkt 2 - alt ser tapt ut', 'Akt 3: Løsning - klimaks og etterspill'],
  },
  {
    name: 'Save the Cat',
    Icon: Bookmark,
    acts: ['Åpningsbilde', 'Temaet blir uttalt', 'Oppsett', 'Katalysator', 'Tvil', 'Inn i akt to', 'B-historie', 'Lek og moro', 'Midtpunkt', 'Skurkene rykker nærmere', 'Alt er tapt', 'Sjelens mørke natt', 'Inn i akt tre', 'Finale', 'Sluttbilde'],
  },
  {
    name: 'Den fichteanske kurven',
    Icon: TrendingUp,
    acts: ['Umiddelbar konflikt som kaster leseren rett inn', 'Stigende handling - krise etter krise, hver verre enn den forrige', 'Klimaks - den mest intense konfrontasjonen', 'Fallende handling - etterspill og konsekvenser', 'Endelig løsning'],
  },
  {
    name: 'In medias res',
    Icon: Repeat2,
    acts: ['Åpne midt i dramatisk handling', 'Tilbakeblikk og eksposisjon - avslør bakgrunn gradvis', 'Tilbake til nåtiden - øk innsatsen', 'Klimaks - samle alle avslørte tråder', 'Avtoning - knyt løse tråder i et nytt lys'],
  },
];

// ─── World Building Sparks ────────────────────────────────────────────────────

const WORLD_SETTINGS = ['A city carved inside a mountain', 'An archipelago of floating fortresses', 'Earth 200 years after contact with another civilization', 'A society that runs entirely on bartered memories', 'A medieval kingdom where magic is regulated like a utility', 'A generation ship that forgot it was a ship', 'A world where shadow is a physical material', 'An underground empire with no concept of sky'];
const WORLD_CONFLICT = ['A scarce resource is running out', 'Two factions misunderstand each other\'s core belief', 'An ancient law was never repealed — and someone just invoked it', 'A power vacuum after the death of a central authority', 'A discovery that rewrites history', 'First contact — and they\'re not what anyone expected'];
const WORLD_TWIST = ['The protagonist is the villain of an older story', 'The "safe haven" is the true source of the problem', 'The rule of the world is about to break for the first time', 'History was rewritten — and someone remembers the original', 'The antagonist succeeds — and it\'s somehow worse than expected'];
const WORLD_SETTINGS_NB = ['En by skåret ut inne i et fjell', 'En øygruppe av flytende festninger', 'Jorden 200 år etter kontakt med en annen sivilisasjon', 'Et samfunn som drives helt av byttehandel med minner', 'Et middelalderrike der magi reguleres som en offentlig tjeneste', 'Et generasjonsskip som har glemt at det er et skip', 'En verden der skygge er et fysisk materiale', 'Et underjordisk imperium uten begrep om himmelen'];
const WORLD_CONFLICT_NB = ['En knapp ressurs er i ferd med å ta slutt', 'To fraksjoner misforstår hverandres grunnleggende overbevisning', 'En gammel lov ble aldri opphevet - og noen har nettopp tatt den i bruk', 'Et maktvakuum etter døden til en sentral autoritet', 'En oppdagelse som omskriver historien', 'Første kontakt - og de er slett ikke slik noen forventet'];
const WORLD_TWIST_NB = ['Protagonisten er skurken fra en eldre historie', '"Den trygge havnen" er den egentlige kilden til problemet', 'Verdensregelen er i ferd med å bryte sammen for første gang', 'Historien ble omskrevet - og noen husker den opprinnelige versjonen', 'Antagonisten lykkes - og det er på en eller annen måte verre enn forventet'];

function getRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function copyToClipboard(text: string, setCopied: (v: boolean) => void) {
  navigator.clipboard.writeText(text).then(() => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

type Tab = 'prompts' | 'character' | 'arc' | 'world';

interface GeneratedCharacter {
  archetype: string;
  trait: string;
  flaw: string;
  want: string;
  background: string;
}

interface ItemForm {
  type: string;
  url: string; title: string; description: string; comment: string; tags: string;
}
const EMPTY_FORM: ItemForm = { type: 'image', url: '', title: '', description: '', comment: '', tags: '' };

export default function StorytellingPage() {
  const { language, text } = useAppTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('prompts');

  // Prompts tab
  const [selectedGenre, setSelectedGenre] = useState<keyof typeof PROMPTS>('fantasy');
  const [currentPrompt, setCurrentPrompt] = useState<string>('');
  const [savedPrompts, setSavedPrompts] = useState<string[]>([]);
  const [promptCopied, setPromptCopied] = useState(false);

  // Character tab
  const [character, setCharacter] = useState<GeneratedCharacter | null>(null);
  const [charCopied, setCharCopied] = useState(false);

  // Arc tab
  const [selectedArcIndex, setSelectedArcIndex] = useState(0);

  // World tab
  const [worldSetting, setWorldSetting] = useState('');
  const [worldConflict, setWorldConflict] = useState('');
  const [worldTwist, setWorldTwist] = useState('');

  // Moodboard tab — Moodboards have moved to the Mindmap tab
  // (kept as stubs so TS is happy if old references remain)
  const [activeBoardId] = useState<string | null>(null); // unused
  void activeBoardId;

  const promptBanks = useMemo(() => (language === 'nb' ? PROMPTS_NB : PROMPTS), [language]);
  const characterArchetypes = useMemo(() => (language === 'nb' ? CHARACTER_ARCHETYPES_NB : CHARACTER_ARCHETYPES), [language]);
  const characterTraits = useMemo(() => (language === 'nb' ? CHARACTER_TRAITS_NB : CHARACTER_TRAITS), [language]);
  const characterFlaws = useMemo(() => (language === 'nb' ? CHARACTER_FLAWS_NB : CHARACTER_FLAWS), [language]);
  const characterWants = useMemo(() => (language === 'nb' ? CHARACTER_WANTS_NB : CHARACTER_WANTS), [language]);
  const characterBackgrounds = useMemo(() => (language === 'nb' ? CHARACTER_BACKGROUNDS_NB : CHARACTER_BACKGROUNDS), [language]);
  const storyArcs = useMemo(() => (language === 'nb' ? STORY_ARCS_NB : STORY_ARCS), [language]);
  const worldSettings = useMemo(() => (language === 'nb' ? WORLD_SETTINGS_NB : WORLD_SETTINGS), [language]);
  const worldConflicts = useMemo(() => (language === 'nb' ? WORLD_CONFLICT_NB : WORLD_CONFLICT), [language]);
  const worldTwists = useMemo(() => (language === 'nb' ? WORLD_TWIST_NB : WORLD_TWIST), [language]);
  const selectedArc = storyArcs[selectedArcIndex] ?? storyArcs[0];

  const generatePrompt = () => {
    const pool = promptBanks[selectedGenre];
    setCurrentPrompt(getRandom(pool));
  };

  const savePrompt = () => {
    if (currentPrompt && !savedPrompts.includes(currentPrompt)) {
      setSavedPrompts([currentPrompt, ...savedPrompts]);
    }
  };

  const generateCharacter = () => {
    setCharacter({
      archetype: getRandom(characterArchetypes),
      trait: getRandom(characterTraits),
      flaw: getRandom(characterFlaws),
      want: getRandom(characterWants),
      background: getRandom(characterBackgrounds),
    });
  };

  const generateWorld = () => {
    setWorldSetting(getRandom(worldSettings));
    setWorldConflict(getRandom(worldConflicts));
    setWorldTwist(getRandom(worldTwists));
  };

  const charText = character
    ? `${text('Archetype')}: ${text(character.archetype)}\n${text('Core Trait')}: ${text(character.trait)}\n${text('Flaw')}: ${text(character.flaw)}\n${text('Wants')}: ${text(character.want)}\n${text('Background')}: ${text(character.background)}`
    : '';

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'prompts',   label: text('Story Prompts'), icon: <Feather size={16} /> },
    { id: 'character', label: text('Character'),     icon: <User size={16} /> },
    { id: 'arc',       label: text('Story Arc'),     icon: <Layers size={16} /> },
    { id: 'world',     label: text('World'),         icon: <MapPin size={16} /> },
  ];

  return (
    <div className="p-8 max-w-5xl mx-auto h-full overflow-y-auto">
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-purple-100 dark:bg-purple-900/30 p-3 rounded-xl text-purple-600 dark:text-purple-400">
            <BookOpen size={28} />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-gray-800 dark:text-white">{text('Storytelling')}</h2>
            <p className="text-gray-500 dark:text-gray-400 mt-0.5">{text('Tools to spark your next story')}</p>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-8 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Story Prompts ─────────────────────────────────────────────────── */}
      {activeTab === 'prompts' && (
        <div className="space-y-6">
          {/* Genre selector */}
          <div>
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wider">{text('Genre')}</p>
            <div className="flex flex-wrap gap-2">
              {GENRES.map((g) => (
                <button
                  key={g}
                  onClick={() => setSelectedGenre(g)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border capitalize transition-all ${
                    selectedGenre === g
                      ? GENRE_COLORS[g]
                      : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  }`}
                >
                  {text(GENRE_LABELS[g])}
                </button>
              ))}
            </div>
          </div>

          {/* Prompt card */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm overflow-hidden">
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 p-8 min-h-[160px] flex items-center justify-center">
              {currentPrompt ? (
                <p className="text-gray-800 dark:text-gray-100 text-xl text-center italic leading-relaxed">
                  "{text(currentPrompt)}"
                </p>
              ) : (
                <div className="text-center">
                  <Sparkles size={40} className="mx-auto text-purple-300 dark:text-purple-600 mb-3" />
                  <p className="text-gray-400 dark:text-gray-500">{text('Click Generate to get a story prompt')}</p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 p-4 border-t border-gray-100 dark:border-gray-700">
              <button
                onClick={generatePrompt}
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <RefreshCw size={14} />
                {text('Generate Prompt')}
              </button>
              {currentPrompt && (
                <>
                  <button
                    onClick={savePrompt}
                    className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    {text('Save Prompt')}
                  </button>
                  <button
                    onClick={() => copyToClipboard(currentPrompt, setPromptCopied)}
                    className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-3 py-2 rounded-lg text-sm transition-colors ml-auto"
                  >
                    {promptCopied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                    {promptCopied ? text('Copied!') : text('Copy')}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Saved prompts */}
          {savedPrompts.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wider">{text('Saved Prompts')}</h3>
              <div className="space-y-2">
                {savedPrompts.map((p, i) => (
                  <div key={i} className="flex items-start gap-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                    <ArrowRight size={14} className="text-purple-400 shrink-0 mt-0.5" />
                    <p className="text-gray-700 dark:text-gray-300 text-sm italic flex-1">"{text(p)}"</p>
                    <button onClick={() => setSavedPrompts(savedPrompts.filter((_, j) => j !== i))} className="text-gray-300 dark:text-gray-600 hover:text-red-400 shrink-0 text-xs">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Character Generator ───────────────────────────────────────────── */}
      {activeTab === 'character' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700">
              <button
                onClick={generateCharacter}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors"
              >
                <Shuffle size={16} />
                {text('Generate Character')}
              </button>
            </div>

            {character ? (
              <div className="p-6 space-y-4">
                {[
                  { label: text('Archetype'), value: text(character.archetype), color: 'text-indigo-600 dark:text-indigo-400' },
                  { label: text('Core Trait'), value: text(character.trait), color: 'text-emerald-600 dark:text-emerald-400' },
                  { label: text('Flaw'), value: text(character.flaw), color: 'text-red-600 dark:text-red-400' },
                  { label: text('Wants'), value: text(character.want), color: 'text-amber-600 dark:text-amber-400' },
                  { label: text('Background'), value: text(character.background), color: 'text-purple-600 dark:text-purple-400' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex items-start gap-4">
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-400 w-24 shrink-0 mt-0.5">{label}</span>
                    <span className={`font-semibold ${color} capitalize`}>{value}</span>
                  </div>
                ))}
                <div className="pt-3 flex gap-2 border-t border-gray-100 dark:border-gray-700">
                  <button
                    onClick={() => copyToClipboard(charText, setCharCopied)}
                    className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-3 py-2 rounded-lg text-sm transition-colors"
                  >
                    {charCopied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                    {charCopied ? text('Copied!') : text('Copy')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-12 text-center text-gray-400 dark:text-gray-500">
                <User size={40} className="mx-auto mb-3 opacity-30" />
                <p>{text('Generate a character to see their traits')}</p>
              </div>
            )}
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-2">
              <Wand2 size={14} /> {text('Pro Tip')}
            </h4>
            <p className="text-sm text-blue-700 dark:text-blue-300/80">
              {text('Great characters have a core want (external goal) that conflicts with their deeper need (internal growth). Use the generated flaw and want together to find that tension.')}
            </p>
          </div>
        </div>
      )}

      {/* ── Story Arc ────────────────────────────────────────────────────── */}
      {activeTab === 'arc' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Arc selector */}
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">{text('Choose a Structure')}</p>
            {storyArcs.map((arc, index) => (
              <button
                key={arc.name}
                onClick={() => setSelectedArcIndex(index)}
                className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                  selectedArc.name === arc.name
                    ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-700 text-purple-800 dark:text-purple-300'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300'
                }`}
              >
                <arc.Icon size={18} className="shrink-0 opacity-70" />
                <span className="text-sm font-medium">{text(arc.name)}</span>
              </button>
            ))}
          </div>

          {/* Arc steps */}
          <div className="md:col-span-2">
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
                  <selectedArc.Icon size={20} className="text-purple-600 dark:text-purple-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-800 dark:text-white">{text(selectedArc.name)}</h3>
              </div>
              <ol className="space-y-3">
                {selectedArc.acts.map((act, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="shrink-0 w-6 h-6 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-xs font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">{text(act)}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* ── World Building ────────────────────────────────────────────────── */}
      {activeTab === 'world' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-gray-500 dark:text-gray-400 text-sm">{text('Spark a world for your story in one click.')}</p>
            <button
              onClick={generateWorld}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors"
            >
              <Drama size={16} />
              {text('Generate World')}
            </button>
          </div>

          {(worldSetting || worldConflict || worldTwist) ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: text('Setting'), value: text(worldSetting), icon: <MapPin size={18} />, color: 'bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-300' },
                { label: text('Conflict'), value: text(worldConflict), icon: <Clock size={18} />, color: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300' },
                { label: text('Plot Twist'), value: text(worldTwist), icon: <Shuffle size={18} />, color: 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300' },
              ].map(({ label, value, icon, color }) => (
                <div key={label} className={`rounded-2xl border p-6 ${color}`}>
                  <div className="flex items-center gap-2 mb-3 opacity-70">
                    {icon}
                    <span className="text-xs font-bold uppercase tracking-widest">{label}</span>
                  </div>
                  <p className="font-semibold text-sm leading-relaxed">{value}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-12 text-center">
              <MapPin size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-gray-400 dark:text-gray-500">{text('Click "Generate World" to build your story\'s foundation')}</p>
            </div>
          )}

          <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-purple-800 dark:text-purple-300 mb-2 flex items-center gap-2">
              <Sparkles size={14} /> {text('How to Use')}
            </h4>
            <ul className="text-sm text-purple-700 dark:text-purple-300/80 space-y-1 list-disc list-inside">
              <li>{text('Use the Setting as the backdrop of your story\'s world')}</li>
              <li>{text('The Conflict creates the driving tension for your plot')}</li>
              <li>{text('Drop in the Plot Twist at the story\'s midpoint or climax')}</li>
            </ul>
          </div>
        </div>
      )}

    </div>
  );
}
