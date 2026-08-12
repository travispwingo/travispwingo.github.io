import Phaser from '../lib/phaser.esm.min.js';

import { VIEW_W, VIEW_H, PHYSICS } from './config.js';
import { applyStoredMute, toggleMute } from './audio.js';
import BootScene from './scenes/Boot.js';
import TitleScene from './scenes/Title.js';
import LevelScene from './scenes/Level.js';
import HudScene from './scenes/Hud.js';

const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: VIEW_W,
    height: VIEW_H,
    pixelArt: true,
    roundPixels: true,
    backgroundColor: '#6ec0f8',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: PHYSICS.gravity },
            debug: false,
        },
    },
    scene: [BootScene, TitleScene, LevelScene, HudScene],
});

/**
 * Mute is bound once, at the page level, rather than per scene.
 *
 * Scene-scoped key handlers are re-registered every time a scene restarts, and
 * the level restarts on every death -- so after one death two handlers would
 * fire per keypress and the toggle would cancel itself out. One listener for
 * the lifetime of the page cannot drift.
 */
game.events.once('ready', () => {
    applyStoredMute(game);
    window.addEventListener('keydown', (event) => {
        if (event.key !== 'm' && event.key !== 'M') return;
        game.events.emit('mute-changed', toggleMute(game));
    });
});

// Handy while iterating; harmless in production.
window.game = game;

export default game;
