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
        // Ignore player contact until this time -- set after any stomp or kick
        // so the interaction cannot be re-run while the two are still overlapping.
        this.contactGraceUntil = 0;
        // Until sizeBody() is called the body already matches the frame.
        this.bodyW = this.width;
        this.bodyH = this.height;
        this.play(anim);
        this.faceDir();
    }

    /**
     * Every frame listed in frames.js faces right, so flip when walking left.
     * Getting this backwards is invisible on a Koopa (its sheet has a
     * left-facing band that looks plausible) and glaring on a Galoomba.
     */
    faceDir() {
        this.setFlipX(this.dir < 0);
    }

    /**
     * Size the body as a fraction of the current frame, centred horizontally
     * with its bottom edge on the sprite origin (0.5, 1) -- i.e. on the feet.
     */
    sizeBody(wFrac, hFrac) {
        this.bodyW = this.width * wFrac;
        this.bodyH = this.height * hFrac;
        this.body.setSize(this.bodyW, this.bodyH);
        this.syncBody();
    }

    /**
     * Re-anchor the body after the frame changed size -- the same trap
     * Player.syncBody exists for, and enemies are not exempt. Both walk cycles
     * change height (Koopa 52/54, Goomba 32/30), so a body offset computed once
     * in the constructor drifts 2px on alternate animation frames: the Goomba
     * sinks into the floor and the Koopa lifts clear of it, dropping
     * `blocked.down` -- which is exactly what patrol()'s ledge probe is gated on.
     */
    syncBody() {
        this.body.setOffset((this.width - this.bodyW) / 2, this.height - this.bodyH);
    }

    preUpdate(time, delta) {
        super.preUpdate(time, delta);
        // Dying enemies have an inert body and a frame from a different pose, so
        // leave their offset where it was rather than re-deriving it.
        if (this.body && !this.dying) this.syncBody();
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
        this.faceDir();
    }

    /**
     * Hold off the player-contact handler for a moment.
     *
     * Player/enemy contact is an overlap, and Arcade re-runs an overlap
     * callback on every step the bodies intersect -- there is no once-per-touch
     * latch. Without this, the frame after Mario kicks a shell he is still
     * inside it, the shell is now sliding, and the same handler that just
     * kicked it kills him. Goombas never showed the bug only because being
     * stomped disables their body outright.
     *
     * Extends rather than assigns: onEnemyTouch calls this every overlapping
     * step to keep the window open, and a plain assignment would let a refresh
     * move the deadline *backwards* and cut the initial hold short.
     */
    holdContact(ms = 200) {
        this.contactGraceUntil = Math.max(this.contactGraceUntil,
                                          this.scene.time.now + ms);
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
        this.sizeBody(0.8, 0.72);
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
        this.sizeBody(0.7, 0.55);
    }

    /**
     * First stomp knocks the Koopa into its shell; stomping the resting shell
     * kicks it. A sliding shell is stopped by another stomp.
     */
    stomp(fromX, fromVx = 0) {
        if (this.dying) return false;
        if (!this.shelled) {
            this.shelled = true;
            this.restShell();
            return true;
        }
        if (this.sliding) this.restShell();
        else this.kick(fromX, fromVx);
        return true;
    }

    /** Come to rest as a still shell -- both the first stomp and stopping a slide. */
    restShell() {
        this.sliding = false;
        this.speed = 0;
        this.body.setVelocityX(0);
        this.anims.stop();
        this.setFrame(ENEMY.shellStill);
        // The shell is shorter than the Koopa; keep it on the ground.
        this.sizeBody(0.85, 0.5);
        this.holdContact();
    }

    /**
     * Send the shell away from whoever hit it. Landing dead on top of it is a
     * coin flip on sub-pixel position, so inside a small dead zone prefer the
     * direction the kicker was travelling -- but fall back to which side of the
     * shell he is standing on before giving up and picking right, or a
     * stationary kicker always punts it rightward, sometimes under himself.
     */
    kick(fromX, fromVx = 0) {
        const dx = this.x - fromX;
        this.sliding = true;
        this.speed = PHYSICS.shellSpeed;
        this.dir = Math.abs(dx) > 3
            ? Math.sign(dx)
            : (Math.sign(fromVx) || Math.sign(dx) || 1);
        this.play('shell-spin');
        this.faceDir();
        this.holdContact();
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
            // The spin frames are strongly asymmetric, so a stale flip spins the
            // shell against its own direction of travel.
            this.faceDir();
            return;
        }
        super.patrol(layer);
    }
}
