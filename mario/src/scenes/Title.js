import Phaser from '../../lib/phaser.esm.min.js';
import { VIEW_W, VIEW_H } from '../config.js';
import { startMusic, playSfx, isMuted } from '../audio.js';

/**
 * Title screen.
 *
 * It exists for a practical reason as much as a cosmetic one: browsers will not
 * let a page produce sound until the user has interacted with it, so the music
 * has to be kicked off from a real keypress. "PRESS ENTER" is that keypress.
 */
export default class TitleScene extends Phaser.Scene {
    constructor() {
        super('title');
    }

    create() {
        this.add.image(0, 0, 'bg-clouds').setOrigin(0).setScrollFactor(0)
            .setDisplaySize(VIEW_W, VIEW_H);
        this.add.image(0, VIEW_H, 'bg-hills').setOrigin(0, 1).setScrollFactor(0)
            .setDisplaySize(VIEW_W, VIEW_H * 0.75);

        const logo = this.add.image(VIEW_W / 2, VIEW_H * 0.32, 'atlas', 'title_logo');
        logo.setScale(Math.min(1, (VIEW_W - 48) / logo.width));

        this.tweens.add({
            targets: logo,
            y: logo.y - 6,
            duration: 1600,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.inOut',
        });

        const prompt = this.add.bitmapText(
            VIEW_W / 2, VIEW_H * 0.62, 'smw', 'PRESS ENTER', 24).setOrigin(0.5);
        this.tweens.add({
            targets: prompt, alpha: 0.15, duration: 620, yoyo: true, repeat: -1,
        });

        this.add.bitmapText(VIEW_W / 2, VIEW_H * 0.75, 'smw',
            'ARROWS MOVE   Z JUMP   X RUN', 12).setOrigin(0.5).setAlpha(0.85);
        this.muteLabel = this.add.bitmapText(VIEW_W / 2, VIEW_H * 0.82, 'smw', '', 12)
            .setOrigin(0.5).setAlpha(0.85);
        this.refreshMuteLabel();

        // The M key itself is bound once in main.js.
        const onMute = () => this.refreshMuteLabel();
        this.game.events.on('mute-changed', onMute);
        this.events.once('shutdown', () => this.game.events.off('mute-changed', onMute));

        const start = () => {
            // First real user gesture: safe to unlock and start audio here.
            startMusic(this);
            playSfx(this, 'pause');
            this.scene.start('level');
        };
        this.input.keyboard.once('keydown-ENTER', start);
        this.input.keyboard.once('keydown-SPACE', start);
        this.input.once('pointerdown', start);
    }

    refreshMuteLabel() {
        this.muteLabel.setText(`M ${isMuted() ? 'UNMUTE' : 'MUTE'}`);
    }
}
