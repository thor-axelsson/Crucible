// Rules tab content. Plain text so it is easy to edit each year. Generated parts come from the live format.
export function rulesSections(ev) {
  const f = ev.format, c = ev.course;
  const pct = (x) => Math.round(x * 100) + '%';
  return [
    { t: 'How the weekend works', items: [
      'Pool play: six 3-hole team matches (' + f.pool.games.map((g) => f.games[g].label).join(', ') + '). Everyone plays six matches, partnering three different people.',
      'Win a match = ' + f.points.win + ' pt, tie = ' + f.points.tie + '. Ties on points are broken by ' + (f.margin.mode === 'net' ? 'net margin (margins won minus margins lost)' : 'margins won') + '.',
      'Semis: the top ' + f.semis.upperSize + ' play for the Championship, the rest play the lower half. Nine holes of modified stableford.',
      'Finals: Championship and 3rd-place matches are 1-v-1 match play over nine holes.'
    ]},
    { t: 'Handicaps', items: [
      'Nine-hole course handicap = (Index ÷ 2) × (Slope ÷ 113) + (9-hole rating − par 36), rounded to the nearest whole number.',
      'Scramble (' + f.games.scramble.tee + ' tees): ' + pct(f.games.scramble.lowPct) + ' of the lower + ' + pct(f.games.scramble.highPct) + ' of the higher course handicap. The team with the higher number gets the difference as strokes.',
      'Alt-shot (' + f.games.altshot.tee + ' tees): ' + pct(f.games.altshot.pct) + ' of the combined course handicaps. Team difference.',
      'Best ball (' + f.games.bestball.tee + ' tees): ' + pct(f.games.bestball.pct) + ' of each course handicap; strokes come off the lowest of the four.',
      'Semis (' + f.semis.tee + ' tees): ' + pct(f.semis.pct) + ' of course handicap, full allowance by stroke index.',
      'Finals (' + f.finals.tee + ' tees): ' + pct(f.finals.pct) + '; the higher handicap gets the difference.',
      'Strokes are taken on the hardest holes first (stroke index 1 is hardest). Plus handicaps give strokes back on the easiest holes.'
    ]},
    { t: 'Match play', items: [
      'Lowest net score wins the hole. A match ends as soon as one side is up by more holes than remain (so "2&1" in a 3-hole match).',
      'Pool margin points: 1 UP = ' + f.margin.up1 + ', 2 UP = ' + f.margin.up2 + ', ended early (2&1) = ' + f.margin.closeout + '.',
      'Finals: players may only be given putts by their opponent. If a final is tied after nine, it goes to a playoff.',
      'Tournament hole numbers run 1 to 36; the course repeats its nine holes. The app shows both.'
    ]},
    { t: 'Semi stableford points (net score vs par)', items: [
      'Triple bogey or worse ' + f.semis.table['3'] + ' · Double bogey ' + f.semis.table['2'] + ' · Bogey ' + f.semis.table['1'] + ' · Par ' + f.semis.table['0'] + ' · Birdie ' + f.semis.table['-1'] + ' · Eagle ' + f.semis.table['-2'] + ' · Albatross ' + f.semis.table['-3'],
      'Ties: countback of the last 3 holes, then the last 6, then net birdies, then a chip-off.'
    ]},
    { t: 'On the course', items: [
      'Play the ball as it lies, play the course as you find it, and do what is fair. If in doubt, play two balls and ask afterwards.',
      'Keep up with the group in front. Be ready to play when it is your turn, and mark scores before leaving the green.',
      'Any player may enter any hole score. If a score is wrong, just enter it again; the latest entry wins.'
    ]},
    { t: 'Course', items: ['Par ' + c.par.reduce((a, b) => a + b, 0) + ' · ' + Object.keys(c.tees).map((t) => t + ' ' + c.tees[t].rating + '/' + c.tees[t].slope).join(' · ') + ' (9-hole rating / slope).'] }
  ];
}
