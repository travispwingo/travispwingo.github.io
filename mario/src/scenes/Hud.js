import Phaser from '../../lib/phaser.esm.min.js';
import { VIEW_W } from '../config.js';

/**
 * Score / coins / time, in the SMW status-bar font.
 *
 * Runs as its own scene layered over the level so it never moves with the
 * camera and never needs a scroll factor.
 */
export default class HudScene extends Phaser.Scene {
    constructor() {
        super({ key: 'hud', active: false });
    }

    create() {
        const y = 10;
        this.scoreText = this.add.bitmapText(16, y, 'smw', '', 16);
        this.coinText = this.add.bitmapText(VIEW_W * 0.45, y, 'smw', '', 16);
        this.timeText = this.add.bitmapText(VIEW_W - 16, y, 'smw', '', 16).setOrigin(1, 0);
        this.message = this.add.bitmapText(VIEW_W / 2, y + 26, 'smw', '', 12)
            .setOrigin(0.5, 0).setAlpha(0);

        for (const t of [this.scoreText, this.coinText, this.timeText]) {
            t.setDropShadow?.(2, 2, 0x000000, 0.8);
        }
    }

    /** Called by the Level scene once it is up. */
    bind(level) {
        this.level = level;
    }

    flashMessage(text) {
        if (!this.message) return;
        this.message.setText(text).setAlpha(1);
        this.tweens.killTweensOf(this.message);
        this.tweens.add({ targets: this.message, alpha: 0, delay: 900, duration: 400 });
    }

    update() {
        const s = this.level?.state;
        if (!s) return;
        this.scoreText.setText(`MARIO ${String(s.score).padStart(6, '0')}`);
        this.coinText.setText(`x${String(s.coins).padStart(2, '0')}`);
        this.timeText.setText(`TIME ${String(s.time).padStart(3, '0')}`);
        this.timeText.setTint(s.time <= 60 ? 0xff6b6b : 0xffffff);
    }
}
