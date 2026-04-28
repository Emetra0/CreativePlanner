# Translation Resource Format

This document proposes a translation file format for Creative Planner that follows the same broad model used by serious localization systems:

- English is the source language.
- Full messages are translated, not individual words inside sentences.
- A glossary exists for terminology consistency.
- Context and placeholder metadata are stored with the strings.
- Norwegian Bokmål (`nb`) is the first maintained non-English language.

## Why this format

Word-by-word dictionary translation is not reliable for UI localization.
It breaks on:

- grammar
- plural rules
- word order
- gender and articles
- context-specific meanings

The dictionary should exist, but as a glossary/termbase, not as the thing that builds UI sentences.

## Recommended structure

Use source-controlled locale files as the main source of truth.

```text
src/locales/
  en/
    app.json
    glossary.json
  nb/
    app.json
    glossary.json
```

This structure is now the recommended built-in localization model for the app.

Source-controlled locale files are the primary authoring format. The current app runtime loads built-in resources from these files and falls back to English where coverage is still incomplete.

## File 1: app.json

This file contains real translatable UI messages.

```json
{
  "meta": {
    "language": "en",
    "label": "English",
    "version": 1,
    "fallback": []
  },
  "messages": {
    "settings.language.label": {
      "value": "Language"
    },
    "settings.language.help": {
      "value": "Choose the language used across the app."
    },
    "share.invite.title": {
      "value": "Invite collaborator"
    },
    "share.invite.description": {
      "value": "Only the owner or page admins with share rights can invite collaborators.",
      "context": "Shown below the invite collaborator heading in the share modal."
    },
    "share.search.placeholder": {
      "value": "Search users on the platform...",
      "context": "Placeholder text inside the collaborator search field."
    },
    "team.summary.active": {
      "value": "{{active}} of {{total}} members active",
      "placeholders": {
        "active": "Number of currently active members",
        "total": "Total number of members in the project"
      }
    },
    "notes.status.words": {
      "value": "{{count}} words",
      "placeholders": {
        "count": "Word count shown in the notes footer"
      }
    },
    "notes.table.starterGrid": {
      "value": "{{columns}} x {{rows}} starter grid",
      "placeholders": {
        "columns": "Selected table column count",
        "rows": "Selected table row count"
      }
    }
  }
}
```

### Rules for app.json

- Keys must be stable IDs, not English text.
- Values should usually be full sentences or full UI labels.
- Do not build sentences from glossary words.
- Use named placeholders like `{{count}}`, not positional ones.
- Add `context` when a string is short or ambiguous.
- Add `placeholders` metadata whenever variables appear.

## File 2: glossary.json

This file is the dictionary system, but only for approved terminology.

```json
{
  "meta": {
    "language": "en",
    "label": "English",
    "version": 1
  },
  "terms": {
    "planner": {
      "term": "Planner",
      "partOfSpeech": "noun",
      "notes": "Main product area name. Keep consistent across navigation and headings."
    },
    "mindmap": {
      "term": "Mindmap",
      "partOfSpeech": "noun",
      "notes": "Product feature name. Treat as one word in this app."
    },
    "storytelling": {
      "term": "Storytelling",
      "partOfSpeech": "noun",
      "notes": "Navigation label and page title."
    },
    "share_project": {
      "term": "Share project",
      "partOfSpeech": "verb phrase",
      "notes": "Action label related to collaboration permissions."
    },
    "read_only": {
      "term": "Read only",
      "partOfSpeech": "adjective",
      "notes": "Permission state. Do not rewrite as a verb."
    }
  }
}
```

### Rules for glossary.json

- Use it to standardize words and short phrases.
- Do not use it to auto-compose larger UI strings.
- Keep notes short and practical.
- Add part-of-speech or usage notes where English is ambiguous.

## Norwegian example

Example `src/locales/nb/app.json`:

```json
{
  "meta": {
    "language": "nb",
    "label": "Norsk Bokmål",
    "version": 1,
    "fallback": ["en"]
  },
  "messages": {
    "settings.language.label": {
      "value": "Språk"
    },
    "settings.language.help": {
      "value": "Velg språket som skal brukes i hele appen."
    },
    "share.invite.title": {
      "value": "Inviter samarbeidspartner"
    },
    "share.invite.description": {
      "value": "Bare eieren eller sideadministratorer med delingsrettigheter kan invitere samarbeidspartnere.",
      "context": "Shown below the invite collaborator heading in the share modal."
    },
    "share.search.placeholder": {
      "value": "Søk etter brukere på plattformen..."
    },
    "team.summary.active": {
      "value": "{{active}} av {{total}} medlemmer er aktive"
    },
    "notes.status.words": {
      "value": "{{count}} ord"
    },
    "notes.table.starterGrid": {
      "value": "{{columns}} x {{rows}} startrutenett"
    }
  }
}
```

Example `src/locales/nb/glossary.json`:

```json
{
  "meta": {
    "language": "nb",
    "label": "Norsk Bokmål",
    "version": 1
  },
  "terms": {
    "planner": {
      "term": "Planlegger",
      "partOfSpeech": "noun"
    },
    "mindmap": {
      "term": "Tankekart",
      "partOfSpeech": "noun"
    },
    "storytelling": {
      "term": "Historiefortelling",
      "partOfSpeech": "noun"
    },
    "share_project": {
      "term": "Del prosjekt",
      "partOfSpeech": "verb phrase"
    },
    "read_only": {
      "term": "Skrivebeskyttet",
      "partOfSpeech": "adjective"
    }
  }
}
```

## How this maps to the current app

Current system pieces already in the repo:

- keyed messages in `src/lib/appTranslations.ts`
- exact-text fallback in `src/lib/appStaticUiTranslations.ts`
- built-in language resolver shim in `src/lib/appLanguagePacks.ts`

Recommended direction:

1. Move the main authoring source to `src/locales/<language>/app.json`.
2. Add `src/locales/<language>/glossary.json` for approved terms.
3. Load built-in runtime resources from those files.
4. Keep exact-text fallback only as a temporary safety net while source-level coverage is being completed.

## Authoring rules

- Write English source strings clearly before translation.
- Never concatenate sentence fragments to build UI messages.
- Do not reuse the same key for different contexts just because the English text matches.
- Prefer one key per UI meaning.
- Use locale-aware formatting for dates, numbers, percentages, and currency.
- Keep English as the ultimate fallback.
- Use `nb` for Bokmål and keep UTF-8 Norwegian characters in the real files.

## Minimal runtime API target

This is the shape the app should consume after loading a locale.

```ts
type AppLocaleResource = {
  meta: {
    language: string;
    label: string;
    version: number;
    fallback?: string[];
  };
  messages: Record<string, {
    value: string;
    context?: string;
    placeholders?: Record<string, string>;
  }>;
  terms: Record<string, {
    term: string;
    partOfSpeech?: string;
    notes?: string;
  }>;
};
```

## What not to do

Avoid this style:

```json
{
  "words": {
    "share": "del",
    "project": "prosjekt",
    "invite": "inviter",
    "member": "medlem"
  }
}
```

That looks efficient, but it does not solve actual localization. It only gives you a small terminology table.

## Practical recommendation

If you want the cleanest next step, keep the current runtime system but change the authoring model to:

- `app.json` for real strings
- `glossary.json` for dictionary terms

That gives you a structure close to Ubuntu and Microsoft practice while still fitting this React app.