// The voice rules (Edwin, 2026-10-15), applied to every word the app shows
// (voice.test.ts) and to the reads (reads/gate.ts): never measure you against
// other people, guess at most once a sentence or line, no tag questions, and
// UK English without "ok" or "okay". The question bank is held to the same rules by backend/voice.go;
// keep the patterns here in step with it. (JavaScript has lookaround, so the
// two exceptions Go handles in code, "a few people" and "are we all right?",
// are written into the patterns here.)

export const COMPARISON = new RegExp(
  [
    String.raw`\bthan (for |to |with |off |in )?(most|many|anyone|anybody|everyone|everybody|others|other people|people|friends|someone|somebody|those|the people|average)\b`,
    String.raw`\bthan (they|it|we) (do|does|did|would) for\b`,
    String.raw`\bthan (\w+ )?(colleagues|classmates|peers|siblings|neighbours|strangers)\b`,
    String.raw`\bthan we (fear|think|expect|plan|imagine|realise)\b`,
    String.raw`\bthan [^.,;!?]*\b(anyone|anybody|everyone|everybody) else\b`,
    String.raw`\bthan (it|they|he|she) \w+ (the people|other people|others|most people)\b`,
    String.raw`\bthan \w+er (people|folk)\b`,
    String.raw`\b(most|many|some|plenty of|lots of) (people|partners|couples|adults|grown-ups|players|guests)\b`,
    String.raw`(?<!\ba )\bfew people\b`,
    String.raw`\b(most|many|some|few|all|none) of us\b`,
    String.raw`\bwe all\b(?! right\b)`,
    String.raw`\bwe (tend|compare)\b`,
    String.raw`\b(nearly|almost) (everyone|everybody)\b`,
    String.raw`\bnot (everyone|everybody)\b`,
    String.raw`\b(people|folk|\w+ers) like (you|us)\b`,
    String.raw`\b(people|anyone|those) who [^.!?;,]*\b(like this|like you|this way|for this)\b`,
    String.raw`\bunlike (most|many|others|other people|everyone|anyone|people)\b`,
    String.raw`\b(everyone|everybody) else\b`,
    String.raw`\bthe rest of us\b`,
    String.raw`\bbefore (anyone|anybody|everyone|everybody) else('s\b|\s+(does|do|is|has|thinks|notices|sees|and)\b|\s*[.,;!?]|\s*$)`,
    String.raw`\b(while|whilst|when|where|before) (others|other people|most people)\b`,
    String.raw`\b(others|other people) (still |often |usually |just |all |simply )?(miss|missed|overlook|overlooked|skip|drop|dread|swallow|shrug off|rush past|walk past|give up|forget|forgot|forgotten|would|call|stopped|only|drift|grab|panic|stall|scramble|talk themselves|feel too)\b`,
    String.raw`\bdoes for (others|other people|most people|everyone else)\b`,
    String.raw`\b(nobody|no one) else (would|could|will|can|does|did|sees|saw|notices|noticed|spots|thinks|thought)\b`,
    String.raw`\bone of the (most|least|best|worst|first|last|few|\w+est)\b`,
    String.raw`\bthe (most|least) \w+ (person|one|people)\b`,
    String.raw`\b(first|last) (one )?to (notice|see|spot|sense|show up|be asked|be heard|speak up|help|offer|arrive|step in)\b`,
    String.raw`(?<!\b(ask|invite|asking|inviting) )\bthe (most \w+|least \w+|\w+est) (\w+ )?in (the|any|every) (room|team|group|office|class|family)\b`,
    String.raw`\brarer than\b`,
    String.raw`\brarest\b`,
    String.raw`\b(is|that's|it's|that is|it is) (\w+ )?rare\b`,
    String.raw`\b(a|an) (rare|unusual|uncommon) (skill|gift|quality|trait|talent|knack|ability|strength|kind|patience|calm|ease)\b`,
    String.raw`\bsomething rare\b`,
  ].join('|'),
  'i',
)

export const HEDGE =
  /\b(probably|likely|tends? to|tended to|may|might|perhaps|maybe|chances are|odds are|there's a good chance|it wouldn't be surprising)\b/gi
const GUESS_OPENER = /\b(chances|odds) are\b|(^|[.!?:;]\s+)no doubt\b/i
const TAG_QUESTION =
  /,\s*((isn't|aren't|wasn't|weren't|doesn't|don't|didn't|hasn't|haven't|hadn't|won't|wouldn't|can't|couldn't|shouldn't|is|are|was|were|does|do|did|has|have|had|will|would|can|could|should)\s+(it|you|they|we|he|she|there|that|i)|right|eh)\s*\?/i
const OKAY = /\b(ok|okay)\b/i
const US_SPELLING = new RegExp(
  String.raw`\b(` +
    [
      'colors?|colored|colorful|favors?|favored|favoring|favorites?|flavors?|flavored|honors?|honored|humor|humored|labors?|labored',
      'neighbors?|neighborhoods?|neighborly|rumors?|behaviors?|behavioral|harbors?|savor|savored|endeavors?|odors?|armor|parlor|vapor',
      'centers?|centered|theaters?|fibers?|liters?|somber|meager',
      'traveled|traveling|travelers?|canceled|canceling|labeled|labeling|modeled|modeling|fueled|fueling|jeweler|marvelous|signaled|dialed|dialing|leveled|quarreled|woolen',
      String.raw`\w+yz(e|es|ed|ing)`,
      'defense|offense|pretense|catalog|gray|moms?|math|toward|afterward|pajamas|cozy|aluminum|skeptic(al|ism)?|jewelry|plow|mold|moldy|mustache',
      'practicing|practiced|fulfill|fulfillment|enroll|enrollment|installment|skillful|willful|judgment|acknowledgment|aging|gotten',
    ].join('|') +
    String.raw`)\b`,
  'i',
)
const US_IZE = /\b[a-z]+iz(e|es|ed|ing|ation|ations)\b/gi
const NOT_IZE = new Set(
  'size sizes sized sizing resize resized downsize downsized downsizing oversize oversized outsize outsized prize prizes prized seize seizes seized seizing capsize capsized capsizing'.split(
    ' ',
  ),
)

// voiceProblems lists every rule s breaks, as short notes for a failure message.
export function voiceProblems(s: string): string[] {
  const out: string[] = []
  const comparison = s.match(COMPARISON)
  if (comparison) out.push(`compares you with other people ("${comparison[0]}")`)
  const hedges = s.match(HEDGE) ?? []
  if (hedges.length > 1) out.push(`hedges ${hedges.length} times (${hedges.join(', ')})`)
  const guess = s.match(GUESS_OPENER)
  if (guess) out.push(`guesses with "${guess[0].trim()}"`)
  const tag = s.match(TAG_QUESTION)
  if (tag) out.push(`ends on a tag question ("${tag[0]}")`)
  const okay = s.match(OKAY)
  if (okay) out.push(`says "${okay[0]}"`)
  const us = s.match(US_SPELLING)?.[0] ?? (s.match(US_IZE) ?? []).find((w) => !NOT_IZE.has(w.toLowerCase()))
  if (us) out.push(`uses the US spelling "${us}"`)
  return out
}
