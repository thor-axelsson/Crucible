// Course data and the default tournament format. Everything the engine needs is plain data,
// so next year's format is an edit to this file (or to the admin screens), not a rewrite.

export const COURSE = {
  name: 'Inness Golf Club',
  holes: 9,
  par: [4, 4, 3, 5, 3, 4, 4, 4, 5],
  // 9-hole stroke index (the published two-loop card halved).
  si: [4, 9, 5, 2, 8, 6, 1, 7, 3],
  // rating = 9-hole rating (half of the published 18-hole rating). yards = per hole, null if unknown.
  tees: {
    Gold:   { rating: 35.7, slope: 132, yards: [392, 340, 201, 584, 177, 338, 443, 310, 576] },
    Green:  { rating: 34.2, slope: 127, yards: null },
    White:  { rating: 32.8, slope: 118, yards: null },
    Orange: { rating: 31.2, slope: 110, yards: null }
  }
};

export const FORMAT = {
  name: 'The Crucible',
  pool: {
    // Game for each of the six three-hole pool matches, in order.
    games: ['scramble', 'scramble', 'altshot', 'altshot', 'bestball', 'bestball'],
    holesPerMatch: 3,
    // Foursomes by handicap rank (1 = lowest handicap). Front nine = matches 1-3, back nine = matches 4-6.
    groups: {
      front: [[1, 4, 5, 8], [2, 3, 6, 7]],
      back: [[1, 3, 6, 8], [2, 4, 5, 7]]
    },
    // Within a foursome (ordered by rank: a,b,c,d) the three matches use these pairings of positions.
    pairingOrder: [[0, 3], [0, 1], [0, 2]]
  },
  games: {
    scramble: { label: 'Scramble', tee: 'Green', lowPct: 0.35, highPct: 0.15 },
    altshot: { label: 'Alt-shot', tee: 'Orange', pct: 0.5 },
    bestball: { label: 'Best ball', tee: 'White', pct: 0.9 }
  },
  points: { win: 1, tie: 0.5 },
  // Pool tiebreak. mode 'net' = margins won minus margins lost; 'wins' = only margins won.
  margin: { mode: 'net', up1: 1, up2: 2, closeout: 2.5 },
  semis: {
    tee: 'White',
    pct: 0.95,
    upperSize: 4,
    // net score relative to par -> points (3 means triple bogey or worse, -3 means albatross or better)
    table: { '3': -1, '2': 0, '1': 1, '0': 2, '-1': 4, '-2': 8, '-3': 12 },
    // finishing position -> where the player goes next
    advance: {
      U: ['champ', 'champ', 'third', 'out'],
      L: ['third', 'out', 'out', 'out']
    }
  },
  finals: {
    tee: 'Green',
    pct: 1.0,
    routing: [1, 4, 8, 9, 3, 2, 7, 5, 6]
  }
};

export const DEMO_PLAYERS = [
  { name: 'Thor', index: 4.2 },
  { name: 'Nate', index: 7.8 },
  { name: 'Phil', index: 10.5 },
  { name: 'Zach', index: 12.1 },
  { name: 'Jeff', index: 14.6 },
  { name: 'Walt', index: 17.3 },
  { name: 'Kurt', index: 20.4 },
  { name: 'Arkasha', index: 24.0 }
];
