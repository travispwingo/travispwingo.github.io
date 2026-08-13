/** Tunables in one place, so the feel of the game can be adjusted without
 *  hunting through the scene code. */

export const TILE = 32;             // matches tools/build_assets.py
export const VIEW_W = 512;          // 16 tiles across
export const VIEW_H = 448;          // 14 tiles down

export const PHYSICS = {
    gravity: 2100,
    walkSpeed: 165,
    runSpeed: 290,
    accel: 1400,
    drag: 1300,
    skidDrag: 2600,
    airAccelScale: 0.65,            // less steering authority mid-air
    // A tap gets ~2 tiles, a full hold ~3.8. jumpHoldForce must stay well
    // under `gravity` -- at exactly -gravity it cancels it out and Mario
    // coasts upward at constant speed, which reads as floaty and overshoots.
    jumpVelocity: -520,
    jumpHoldMs: 190,                // how long holding jump keeps lifting
    jumpHoldForce: -1400,
    // These two windows make the control forgiving and are what stop the game
    // feeling like it ignores you. They are input design, not a workaround:
    // the blocked.down flicker they were once blamed on was Player.syncBody
    // running a pass late, and that is fixed (see CLAUDE.md items 2 and 3).
    coyoteMs: 90,                   // still jumpable just after leaving ground
    jumpBufferMs: 120,              // a jump pressed just before landing counts
    maxFall: 760,
    stompBounce: -380,
    stompBounceHeld: -520,
    enemySpeed: 42,
    shellSpeed: 320,
};

export const RULES = {
    startTime: 300,                 // level clock, in game-seconds
    timeScale: 0.4,                 // real seconds per game-second
    coinScore: 200,
    stompScore: 100,
    powerScore: 1000,
    flagScoreMax: 5000,
    deathY: VIEW_H * 2,             // fall past this and you die
    respawnDelayMs: 1600,
};

export const AUDIO = {
    musicVolume: 0.35,
    sfxVolume: 0.6,
    muteKey: 'mario.muted',
};
