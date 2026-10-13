// FSD-03E B2/B3: one case table for the Rules (tests/firestore-rules.test.mjs) and the browser check
// (tests/team-name.test.mjs). `rules` is what the Rules decide for the exact stored string; the browser
// must never accept (after trimming) a string the Rules refuse.
const EMOJI = '\u{1F6B6}';                                  // a person walking: outside the BMP (two UTF-16 units)

export const TEAM_NAME_CASES = [
  { label: 'plain Chinese', name: '步行小隊', rules: true },
  { label: 'one letter', name: 'a', rules: true },
  { label: '12 Chinese characters', name: '一二三四五六七八九十甲乙', rules: true },
  { label: 'inner space', name: 'Team A', rules: true },
  { label: 'inner ideographic space', name: '小隊　一號', rules: true },
  { label: 'symbols and digits', name: '#1 走走隊!', rules: true },
  { label: 'zero-width space alone (not blocked: FSD-03E decision)', name: '​', rules: true },
  // B3, pinned on Firestore Emulator 1.22.0 (2026-10-05): string.size() counts UTF-16 units, so an emoji is 2.
  { label: '6 emoji = 12 UTF-16 units', name: EMOJI.repeat(6), rules: true },
  { label: '7 emoji = 14 UTF-16 units', name: EMOJI.repeat(7), rules: false },
  { label: '11 letters and an emoji = 13 UTF-16 units', name: 'abcdefghijk' + EMOJI, rules: false },
  { label: '12 emoji', name: EMOJI.repeat(12), rules: false },
  { label: 'empty', name: '', rules: false },
  { label: '13 Chinese characters', name: '一二三四五六七八九十甲乙丙', rules: false },
  { label: '13 emoji', name: EMOJI.repeat(13), rules: false },
  { label: 'only spaces', name: '   ', rules: false },
  { label: 'only ideographic space', name: '　', rules: false },
  { label: 'leading space', name: ' 小隊', rules: false },
  { label: 'trailing space', name: '小隊 ', rules: false },
  { label: 'leading ideographic space', name: '　小隊', rules: false },
  { label: 'trailing ideographic space', name: '小隊　', rules: false },
  { label: 'trailing no-break space', name: '小隊 ', rules: false },
  { label: 'newline inside', name: '小\n隊', rules: false },
  { label: 'tab inside', name: '小\t隊', rules: false },
  { label: 'trailing newline', name: '小隊\n', rules: false },
];
