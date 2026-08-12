/**
 * Level 1-1, authored as ASCII so it can be edited by hand.
 *
 * The map is built from fixed-height segments that are concatenated
 * left-to-right. Every segment must be exactly ROWS lines tall and every line
 * within a segment the same width -- buildLevel() throws otherwise, which turns
 * a typo into an immediate error instead of a mysteriously shifted level.
 *
 *   .  empty            #  grass-topped ground      =  dirt fill
 *   S  stone platform   B  brown block
 *   ?  ? block (coin)   M  ? block (mushroom)       o  coin
 *   g  Galoomba         k  Koopa Troopa
 *   p  pipe (2 wide, anchored at this cell)
 *   F  flagpole base    C  castle (anchored bottom-left)
 *   @  player spawn
 *
 * Solid tiles ('#', '=', 'S', 'B') become tilemap tiles. Everything else is
 * spawned as a sprite by Level.js and the character is left empty in the grid.
 */

export const ROWS = 14;

export const TILES = { '#': 1, '=': 2, S: 3, B: 4 };

const SEGMENTS = [
// ---- opening: flat ground, room to learn the controls ---------------------
[
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '...@....................',
    '........................',
    '........................',
    '########################',
    '========================',
],
// ---- first ? block and the first Galoomba ---------------------------------
[
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '.......o....o...o.......',
    '.....?.....BMB..........',
    '........................',
    '........................',
    '..................g.....',
    '########################',
    '========================',
],
// ---- a pipe, then the first gap -------------------------------------------
[
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '..............oo........',
    '.........BBB............',
    '........................',
    '....p...................',
    '....................g...',
    // First gap is 3 tiles: clearable at walking speed (~3.8), so it teaches
    // the jump without demanding the run button. Later gaps are 4 and need it.
    '#############...########',
    '=============...========',
],
// ---- stone steps and a Koopa ----------------------------------------------
// The steps climb one reachable hop at a time: row 11 -> 9 -> 7, two tiles
// apart vertically, well inside the ~3.7-tile jump.
[
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '.................o.o....',
    '.................SS.....',
    '..........k.............',
    '.............SS.........',
    '..........o.............',
    '.........SS.............',
    '########################',
    '========================',
],
// ---- stepping stones over a pit -------------------------------------------
// The pit is 11 tiles, far past a running jump (~6), so it has to be crossed
// on the platforms. They sit at row 9 -- 3 tiles above the ground, which a
// full jump clears -- not at row 6, which would be unreachable from below.
[
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '.......oo......oo.......',
    '........................',
    '......SSSS....SSSS......',
    '........................',
    '...................g....',
    '#####...........########',
    '=====...........========',
],
// ---- brick corridor with a hidden mushroom --------------------------------
[
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '....o.o.o.o.............',
    '...BB?BB?BB....BMB......',
    '........................',
    '........................',
    '..............g......k..',
    '........................',
    '########################',
    '========================',
],
// ---- two pipes and a 4-tile gap -------------------------------------------
// The gap needs a running jump (~6.7 tiles) rather than a walking one (~3.8),
// and the pipes are kept well clear of its edges so there is room to build up
// speed. A stepping stone sits at row 10 for anyone who mistimes it.
[
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '.......oo...............',
    '........................',
    '........................',
    '..p.......S.......p.....',
    '..............g.........',
    '#######....#############',
    '=======....=============',
],
// ---- the climb up to the flagpole -----------------------------------------
[
    '............................',
    '............................',
    '............................',
    '............................',
    '............................',
    '............................',
    '....................o.......',
    '....................S.......',
    '..................SS........',
    '..............o.SSS.........',
    '..............SSSS..........',
    '..........o.SSSSS...........',
    '############################',
    '============================',
],
// ---- flagpole and castle ---------------------------------------------------
[
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '.....................C..............',
    '....................................',
    '....................................',
    '....F...............................',
    '####################################',
    '====================================',
],
];

/**
 * Flatten the segments into a tile-index grid plus a list of things to spawn.
 * @returns {{grid:number[][], spawns:Array<{ch:string,x:number,y:number}>, width:number}}
 */
export function buildLevel() {
    const rows = [];
    for (let r = 0; r < ROWS; r++) rows.push('');

    SEGMENTS.forEach((seg, i) => {
        if (seg.length !== ROWS) {
            throw new Error(`level segment ${i} has ${seg.length} rows, expected ${ROWS}`);
        }
        const w = seg[0].length;
        seg.forEach((line, r) => {
            if (line.length !== w) {
                throw new Error(
                    `level segment ${i} row ${r} is ${line.length} wide, expected ${w}`);
            }
            rows[r] += line;
        });
    });

    const width = rows[0].length;
    const grid = [];
    const spawns = [];
    for (let y = 0; y < ROWS; y++) {
        const row = new Array(width).fill(-1);
        for (let x = 0; x < width; x++) {
            const ch = rows[y][x];
            if (ch === '.') continue;
            if (TILES[ch] !== undefined) row[x] = TILES[ch];
            else spawns.push({ ch, x, y });
        }
        grid.push(row);
    }
    return { grid, spawns, width };
}
