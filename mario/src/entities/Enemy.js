import Phaser from '../../lib/phaser.esm.min.js';
import { PHYSICS } from '../config.js';
import { ENEMY } from '../frames.js';

/**
 * Walkers: the Galoomba and the Koopa Troopa.
 *
 * Both patrol until they hit a wall and turn round. Neither walks off ledges --
 * that is checked by probing the tile just past each front foot rather than by
 * placing invisible blockers in the level, so the level data stays clean.
 */
class Walker extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y, frame, anim) {
        super(scene, x, y, 'atlas', frame);
        scene.add.existing(this);
        scene.physics.add.existing(this);
        this.setOrigin(0.5, 1);
        this.anim = anim;
        this.dir = -1;                 // start walking left, toward the player
        this.dying = false;
        this.stopsAtLedges = false;
        this.play(anim);
    }

    /**
     * Turn at walls, and optionally at ledges.
     *
     * Ledge-stopping is off by default on purpose. An enemy that refuses to
     * walk off a ledge ends up parked on the rim of every pit, which is exactly
     * where the player lands after jumping it -- an unavoidable hit. Letting
     * them walk off is both fairer and what the originals do.
     */
    patrol(layer) {
        if (this.dying || !this.body) return;

        if (this.body.blocked.left) this.dir = 1;
        else if (this.body.blocked.right) this.dir = -1;
        else if (this.stopsAtLedges && layer
                 && (this.body.blocked.down || this.body.touching.down)) {
            const probeX = this.dir < 0 ? this.body.left - 2 : this.body.right + 2;
            const ahead = layer.getTileAtWorldXY(probeX, this.body.bottom + 4);
            if (!ahead) this.dir *= -1;
        }

        this.body.setVelocityX(this.speed * this.dir);
        this.setFlipX(this.dir > 0);
    }

    /** Fall off the bottom of the screen after being flipped or kicked. */
    tumble(direction) {
        this.dying = true;
        this.body.checkCollision.none = true;
        this.body.setVelocity(60 * direction, -260);
        this.setFlipY(true);
        this.scene.time.delayedCall(2200, () => this.destroy());
    }
}

export class Goomba extends Walker {
    constructor(scene, x, y) {
        super(scene, x, y, ENEMY.goombaWalk[0], 'goomba-walk');
        this.speed = PHYSICS.enemySpeed;
        this.body.setSize(this.width * 0.8, this.height * 0.72);
        this.body.setOffset(this.width * 0.1, this.height * 0.28);
    }

    /** Stomped: flatten, then vanish. Returns true if this killed it. */
    stomp() {
        if (this.dying) return false;
        this.dying = true;
        this.body.setVelocity(0, 0);
        this.body.setAllowGravity(false);
        this.body.checkCollision.none = true;
        this.anims.stop();
        this.setFrame(ENEMY.goombaFlat);
        this.scene.time.delayedCall(420, () => this.destroy());
        return true;
    }
}

export class Koopa extends Walker {
    constructor(scene, x, y) {
        super(scene, x, y, ENEMY.koopaWalk[0], 'koopa-walk');
        this.speed = PHYSICS.enemySpeed;
        this.shelled = false;
        this.sliding = false;
        this.stopsAtLedges = true;     // Koopas turn back; only shells ride off
        this.body.setSize(this.width * 0.7, this.height * 0.55);
        this.body.setOffset(this.width * 0.15, this.height * 0.45);
    }

    /**
     * First stomp knocks the Koopa into its shell; stomping the resting shell
     * kicks it. A sliding shell is stopped by another stomp.
     */
    stomp(fromX) {
        if (this.dying) return false;
        if (!this.shelled) {
            this.shelled = true;
            this.sliding = false;
            this.speed = 0;
            this.body.setVelocityX(0);
            this.play('shell-spin');
            this.anims.stop();
            this.setFrame(ENEMY.shellStill);
            // The shell is shorter than the Koopa; keep it on the ground.
            this.body.setSize(this.width * 0.85, this.height * 0.5);
            this.body.setOffset(this.width * 0.075, this.height * 0.5);
            return true;
        }
        if (this.sliding) {
            this.sliding = false;
            this.speed = 0;
            this.body.setVelocityX(0);
            this.anims.stop();
            this.setFrame(ENEMY.shellStill);
        } else {
            this.kick(fromX);
        }
        return true;
    }

    kick(fromX) {
        this.sliding = true;
        this.speed = PHYSICS.shellSpeed;
        this.dir = fromX <= this.x ? 1 : -1;
        this.play('shell-spin');
    }

    patrol(layer) {
        if (this.dying || !this.body) return;
        if (this.shelled && !this.sliding) {
            this.body.setVelocityX(0);
            return;
        }
        // A sliding shell ignores ledges and rides straight off them.
        if (this.sliding) {
            if (this.body.blocked.left) this.dir = 1;
            else if (this.body.blocked.right) this.dir = -1;
            this.body.setVelocityX(this.speed * this.dir);
            return;
        }
        super.patrol(layer);
    }
}
