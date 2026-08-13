/**
 * Semantic names for atlas frames.
 *
 * tools/build_assets.py slices every sprite it finds and names them positionally
 * (`mario_r4_c8` = row band 4, sprite 8). That keeps the pipeline mechanical and
 * means re-running it never invalidates hand-written frame rectangles. The cost
 * is that "which frame is the skid pose" has to live somewhere, and it lives
 * here.
 *
 * The two sheets mirror differently, and assuming otherwise is what made the
 * Galoomba walk backwards:
 *
 *   - The **Mario** sheet mirrors *within* a row -- the right half of a row is
 *     the left half flipped -- so only the right-facing half is listed here.
 *   - The **enemy** sheet mirrors *across* bands, and column order reverses with
 *     it (`enemy_r7_c0` is `enemy_r6_c1` flipped). Pick a whole band per
 *     direction, never a column position.
 *
 * Either way only right-facing frames are listed; the game uses setFlipX(true)
 * to face left.
 */

// Small Mario -- 28x40 in the atlas, i.e. 14x20 native, 1.25 tiles tall.
//
// Only stride poses belong in `walk`, and `mario_r0_c5` is not one: it is the
// camera-facing stand -- face centred, both boots level and side by side, the
// silhouette exactly mirror-symmetric -- so including it plants both feet
// together every other frame and the run reads as a shuffle. It is no good as
// `idle` either, for the opposite reason: flipping a symmetric frame is a
// visual no-op, so small Mario would stand facing the screen with no way to
// read which way he is about to move, while big Mario stands in profile.
// r0_c4 is the side-on stand *and* a stride, so it serves as both; r0_c7 is the
// sprint lean, and being 2px shorter it gives the cycle its dip, the same way
// big Mario's drops from 56 to 54 in the middle.
export const SMALL = {
    idle: 'mario_r0_c4',
    walk: ['mario_r0_c4', 'mario_r0_c7'],
    jump: 'mario_r1_c5',
    skid: 'mario_r1_c6',      // leaning back, arm thrown out
    duck: 'mario_r1_c7',
    pole: 'mario_r1_c9',      // arms up, for the flagpole slide
};

// Big Mario -- up to 38x62 in the atlas, ~1.75 tiles tall.
// Same rule: band 4's c5/c6/c7 are all strides, and c9 -- the plain stand -- is
// deliberately not among them. Big Mario's idle comes from band 2 instead.
export const BIG = {
    idle: 'mario_r2_c9',
    walk: ['mario_r4_c5', 'mario_r4_c6', 'mario_r4_c7'],
    jump: 'mario_r3_c5',
    skid: 'mario_r4_c8',
    duck: 'mario_r3_c7',
    pole: 'mario_r3_c9',
};

// Unlike the Mario sheet, the enemy sheet does not mirror within a row -- it
// gives each direction its own band, and the columns reverse with the mirror
// (enemy_r7_c0 is enemy_r6_c1 flipped), which is why koopaWalk lists c1 before
// c0. Listing the right-facing band for both keeps the one flip rule in
// Walker.faceDir correct for both enemies; picking bands with opposite facings
// is what made the Galoomba walk backwards.
export const ENEMY = {
    // Galoomba (the SMW goomba). r5 faces right, r4 is its mirror.
    goombaWalk: ['enemy_r5_c0', 'enemy_r5_c1'],
    goombaFlat: 'enemy_r5_c3',
    // Koopa Troopa. r7 faces right, r6 is its mirror.
    koopaWalk: ['enemy_r7_c1', 'enemy_r7_c0'],
    // Green shell, 4-frame spin.
    shell: ['enemy_r10_c0', 'enemy_r10_c1', 'enemy_r10_c2', 'enemy_r10_c3'],
    shellStill: 'enemy_r7_c2',
};

export const OBJECT = {
    coin: ['coin_1', 'coin_2', 'coin_3', 'coin_4'],
    qblock: ['qblock_1', 'qblock_2', 'qblock_3', 'qblock_4'],
    qblockUsed: 'qblock_used',
    mushroom: 'mushroom',
    mushroom1up: 'mushroom_1up',
    pipeTop: 'pipe_top',
    pipeBody: 'pipe_body',
    poleBall: 'pole_ball',
    poleShaft: 'pole_shaft',
    flag: 'flag',
    castle: 'castle',
};

/** Register every animation the game uses. Called once, from the Level scene. */
export function createAnimations(scene) {
    const a = scene.anims;
    const frames = (names) => names.map((f) => ({ key: 'atlas', frame: f }));

    if (a.exists('coin-spin')) return; // scene restart -- animations are global

    a.create({ key: 'coin-spin', frames: frames(OBJECT.coin), frameRate: 12, repeat: -1 });
    a.create({ key: 'qblock-idle', frames: frames(OBJECT.qblock), frameRate: 6, repeat: -1 });
    a.create({ key: 'goomba-walk', frames: frames(ENEMY.goombaWalk), frameRate: 6, repeat: -1 });
    a.create({ key: 'koopa-walk', frames: frames(ENEMY.koopaWalk), frameRate: 6, repeat: -1 });
    a.create({ key: 'shell-spin', frames: frames(ENEMY.shell), frameRate: 20, repeat: -1 });

    // The single-frame poses still repeat. Without it they *complete* after one
    // second, isPlaying goes false, and the `play(key, true)` guard everything
    // relies on stops ignoring anything -- harmless while they are one frame
    // long, and a silent restart-every-tick bug the moment one is not.
    for (const [size, set] of [['small', SMALL], ['big', BIG]]) {
        a.create({ key: `${size}-walk`, frames: frames(set.walk), frameRate: 10, repeat: -1 });
        a.create({ key: `${size}-idle`, frames: frames([set.idle]), frameRate: 1, repeat: -1 });
        a.create({ key: `${size}-jump`, frames: frames([set.jump]), frameRate: 1, repeat: -1 });
        a.create({ key: `${size}-skid`, frames: frames([set.skid]), frameRate: 1, repeat: -1 });
    }
}
