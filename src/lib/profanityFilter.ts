/**
 * Profanity + harmful-link filter for all user-facing comment inputs.
 * Extend BAD_WORDS or HARMFUL_DOMAINS as needed without changing any call sites.
 */

// --------------------------------------------------------------------------
// Word list – uses flexible regex patterns to catch l33t-speak variations
// --------------------------------------------------------------------------
const BAD_WORDS: RegExp[] = [
  /\bf+[u*]+c+k+/i,
  /\bs+h+[i1]+t+/i,
  /\ba+s+s+h+[o0]+l+e+/i,
  /\bb+[i1]+t+c+h+/i,
  /\bc+u+n+t+/i,
  /\bw+h+[o0]+r+e+/i,
  /\bn+[i1]+g+g+/i,
  /\bf+a+g+/i,
  /\bs+l+u+t+/i,
  /\bd+[i1]+c+k+/i,
  /\bp+u+s+s+y+/i,
  /\bb+a+s+t+a+r+d+/i,
  /\bm+[o0]+t+h+e+r+f+/i,
  /\bs+u+c+k+s+/i,
  /\bd+[u]+m+b+a+s+s+/i,
  /\bj+e+r+k+o+f+f+/i,
  /\bj+e+r+k+ ?o+f+f+/i,
  /\ba+s+s+w+[i1]+p+e+/i,
  /\ba+s+s+c+l+o+w+n+/i,
  /\bs+t+u+p+[i1]+d+ *b+[i1]+t+c+h+/i,
  /\bg+o+ +k+[i1]+l+l+ +y+o+u+r+s+e+l+f+/i,
  /\bk+[i1]+l+l+ +y+o+u+r+s+e+l+f+/i,
  /\bk+[i1]+l+l+ *y+[o0]+u+r+s+e+l+f+/i,
  /\bi+ *h+a+t+e+ *y+o+u+/i,
  /\by+o+u+ *a+r+e+ *(s+t+u+p+[i1]+d|d+u+m+b|[i1]+d+[i1]+[o0]+t)+/i,
];

// --------------------------------------------------------------------------
// Harmful domain keywords – matched inside URLs found in text
// --------------------------------------------------------------------------
const HARMFUL_DOMAIN_PATTERNS: RegExp[] = [
  /porn/i,
  /xxx/i,
  /\badult\./i,
  /\bsex\./i,
  /nude/i,
  /naked/i,
  /onlyfan/i,
  /escort/i,
  /camgirl/i,
  /\bstrip\b/i,
  /hentai/i,
  /erotic/i,
  /\bpornhub/i,
  /xvideos/i,
  /xhamster/i,
  /redtube/i,
  /youporn/i,
  /brazzers/i,
];

// URL detector
const URL_PATTERN = /https?:\/\/[^\s]+|www\.[^\s]+/gi;

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

export function containsProfanity(text: string): boolean {
  return BAD_WORDS.some((re) => re.test(text));
}

export function containsHarmfulLink(text: string): boolean {
  const urls = text.match(URL_PATTERN) ?? [];
  return urls.some((url) =>
    HARMFUL_DOMAIN_PATTERNS.some((re) => re.test(url))
  );
}

export type ScreenResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Run all checks on a comment string and return pass/fail with a
 * human-readable reason the user can see inline.
 */
export function screenComment(text: string): ScreenResult {
  if (containsProfanity(text)) {
    return {
      ok: false,
      reason:
        'Your comment contains inappropriate language. Please keep things respectful and kind — this is a safe space for everyone.',
    };
  }
  if (containsHarmfulLink(text)) {
    return {
      ok: false,
      reason:
        'Links to harmful or adult-content websites are not allowed in comments.',
    };
  }
  return { ok: true };
}
