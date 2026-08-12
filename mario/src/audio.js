import { AUDIO } from './config.js';

/**
 * Thin wrapper over Phaser's SoundManager.
 *
 * Two things it exists for:
 *  - Mute is global and has to survive a reload, so it is mirrored into
 *    localStorage and re-applied on boot.
 *  - Browsers refuse to start audio until the page has seen a real user
 *    gesture. Phaser handles the unlock itself, but music started in create()
 *    would be silently dropped, so the Title scene starts it from a keypress.
 */

export const SFX = [
    'jump', 'coin', 'stomp', 'powerup', 'powerup-appear', '1up', 'bump',
    'kick', 'pause', 'death', 'gameover', 'flagpole', 'stage-clear',
];

export function preloadAudio(scene) {
    for (const key of SFX) scene.load.audio(key, `assets/audio/${key}.wav`);
    scene.load.audio('overworld', 'assets/audio/overworld.mp3');
}

/**
 * Mute state is tracked here rather than read back from Phaser.
 *
 * In Phaser 4 the WebAudio manager backs `sound.mute` with a gain node --
 * the getter is literally `masterMuteNode.gain.value === 0`, and the setter
 * schedules the change via setValueAtTime(). The AudioParam's value does not
 * update synchronously, so reading `sound.mute` straight after writing it
 * returns the previous state. A toggle written as `!game.sound.mute` therefore
 * reads its own stale value and misfires. This module keeps the authoritative
 * flag; Phaser and localStorage are both just followers.
 */
function readStored() {
    try {
        return localStorage.getItem(AUDIO.muteKey) === '1';
    } catch {
        return false; // private browsing, embedded contexts, etc.
    }
}

let muted = readStored();

export function isMuted() {
    return muted;
}

function persistMute(value) {
    try {
        localStorage.setItem(AUDIO.muteKey, value ? '1' : '0');
    } catch {
        /* not fatal -- mute just will not survive a reload */
    }
}

/** Apply the stored mute preference. Call once, as early as possible. */
export function applyStoredMute(game) {
    muted = readStored();
    game.sound.mute = muted;
}

/** Flip mute, persist it, and return the new state. */
export function toggleMute(game) {
    muted = !muted;
    game.sound.mute = muted;
    persistMute(muted);
    return muted;
}

export function playSfx(scene, key, config = {}) {
    scene.sound.play(key, { volume: AUDIO.sfxVolume, ...config });
}

/**
 * Start (or restart) the looping overworld theme.
 * Safe to call more than once -- it will not stack copies of the track.
 */
export function startMusic(scene) {
    const existing = scene.sound.get('overworld');
    if (existing && existing.isPlaying) return existing;
    const music = existing || scene.sound.add('overworld', {
        loop: true,
        volume: AUDIO.musicVolume,
    });
    music.play();
    return music;
}

export function stopMusic(scene) {
    const music = scene.sound.get('overworld');
    if (music) music.stop();
}
