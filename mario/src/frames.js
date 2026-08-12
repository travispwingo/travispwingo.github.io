/**
 * Semantic names for atlas frames.
 *
 * tools/build_assets.py slices every sprite it finds and names them positionally
 * (`mario_r4_c8` = row band 4, sprite 8). That keeps the pipeline mechanical and
 * means re-running it never invalidates hand-written frame rectangles. The cost
 * is that "which frame is the skid pose" has to live somewhere, and it lives
 * here.
 *
 * A useful property of the SMW sheets: every row is mirror-symmetric, so the
 * right half of a row is the left half flipped. Only right-facing frames are
 * listed; the game uses setFlipX(true) to face left.
 */

// Small Mario -- 28x40 in the atlas, i.e. 14x20 native, 1.25 tiles tall.
export const SMALL = {
    idle: 'mario_r0_c4',
    walk: ['mario_r0_c7', 'mario_r1_c6'],
    jump: 'mario_r1_c5',
    skid: 'mario_r0_c5',
    duck: 'mario_r1_c7',
    pole: 'mario_r1_c9',      // arms up, for the flagpole slide
};

// Big Mario -- up to 38x62 in the atlas, ~1.75 tiles tall.
export const BIG = {
    idle: 'mario_r2_c9',
    walk: ['mario_r4_c5', 'mario_r4_c6', 'mario_r4_c7'],
    jump: 'mario_r3_c5',
    skid: 'mario_r4_c8',
    duck: 'mario_r3_c7',
    pole: 'mario_r3_c9',
};

export const ENEMY = {
    // Galoomba (the SMW goomba). r5 faces right, r4 is its mirror.
    goombaWalk: ['enemy_r5_c0', 'enemy_r5_c1'],
    goombaFlat: 'enemy_r5_c3',
    // Koopa Troopa.
    koopaWalk: ['enemy_r6_c0', 'enemy_r6_c1'],
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

    for (const [size, set] of [['small', SMALL], ['big', BIG]]) {
        a.create({ key: `${size}-walk`, frames: frames(set.walk), frameRate: 10, repeat: -1 });
        a.create({ key: `${size}-idle`, frames: frames([set.idle]), frameRate: 1 });
        a.create({ key: `${size}-jump`, frames: frames([set.jump]), frameRate: 1 });
        a.create({ key: `${size}-skid`, frames: frames([set.skid]), frameRate: 1 });
    }
}
