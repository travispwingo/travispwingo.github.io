import Phaser from '../../lib/phaser.esm.min.js';
import { PHYSICS } from '../config.js';
import { SMALL, BIG } from '../frames.js';
import { playSfx } from '../audio.js';

/**
 * Mario.
 *
 * Two things here are less obvious than they look:
 *
 * 1. The hitbox is authored from the art, not assumed to be a tile. In these
 *    rips small Mario is 1.25 tiles tall and big Mario 1.75 -- neither is a
 *    round number -- and an Arcade body does not follow a frame size change,
 *    so growing or shrinking has to resize and re-anchor the body explicitly or
 *    Mario ends up standing inside the floor.
 *
 * 2. Jump height is variable. The initial impulse is deliberately short of a
 *    full jump; holding the button keeps applying lift for jumpHoldMs. That is
 *    what makes the difference between a tap-hop and a full leap.
 */

const BODY = {
    // width/height of the collision box, and how far its top sits below the
    // top of the sprite frame (the art has empty space above the cap).
    small: { w: 20, h: 36, offY: 4 },
    big: { w: 22, h: 52, offY: 4 },
};

export default class Player extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y) {
        super(scene, x, y, 'atlas', SMALL.idle);
        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.setOrigin(0.5, 1);            // feet-anchored: growing keeps them planted
        this.setCollideWorldBounds(true);
        this.body.setMaxVelocity(PHYSICS.runSpeed * 1.05, PHYSICS.maxFall);

        this.size = 'small';
        this.invulnUntil = 0;
        this.jumpHeldUntil = 0;
        this.lastGroundedAt = -Infinity;
        this.jumpBufferedAt = -Infinity;
        this.dead = false;
        this.frozen = false;               // true during the end-of-level cutscene
        this.applySize('small');
    }

    get isBig() {
        return this.size === 'big';
    }

    applySize(size) {
        this.size = size;
        const b = BODY[size];
        this.setFrame(size === 'big' ? BIG.idle : SMALL.idle);
        this.body.setSize(b.w, b.h);
        this.syncBody();
    }

    /**
     * Keep the collision box centred on Mario's feet.
     *
     * Frames are tight-cropped, so they differ in size -- big Mario's jump is
     * 62px tall against 56 for his idle. An Arcade body does not follow a frame
     * change, so a fixed offset would leave him hovering on some frames and
     * sunk into the floor on others. Recomputing from the current frame keeps
     * the body's bottom edge exactly at the sprite origin (0.5, 1), which is
     * frame-independent.
     *
     * WHEN this runs is as load-bearing as the maths. The offset is derived
     * from `this.height`, so it has to be recomputed in the same pass that
     * changed the frame -- see preUpdate.
     */
    syncBody() {
        const b = BODY[this.size];
        this.body.setOffset((this.width - b.w) / 2, this.height - b.h);
    }

    /**
     * Advance the animation, then immediately re-derive the body offset.
     *
     * Doing this from Scene.update() instead leaves the offset one frame stale,
     * because the scene's update runs after the physics step rather than
     * between the frame change and the body reading the transform. On any step
     * where the frame grew, the stale (smaller) offset lifts the body clear of
     * the floor for exactly one frame: `blocked.down` drops, the animation
     * switches to the jump pose, and the next frame restarts the walk cycle at
     * frame 0. That is the "Mario flickers instead of running" bug, and it also
     * produced the phantom `blocked.down` flicker the jump code was written
     * around.
     */
    preUpdate(time, delta) {
        super.preUpdate(time, delta);
        this.syncBody();
    }

    grow() {
        if (this.isBig) return false;
        this.applySize('big');
        this.invulnUntil = this.scene.time.now + 800;
        return true;
    }

    /** @returns {'shrink'|'death'|'ignored'} what the hit did. */
    takeHit() {
        if (this.dead || this.scene.time.now < this.invulnUntil) return 'ignored';
        if (this.isBig) {
            this.applySize('small');
            this.invulnUntil = this.scene.time.now + 1500;
            playSfx(this.scene, 'bump');
            return 'shrink';
        }
        this.die();
        return 'death';
    }

    die() {
        if (this.dead) return;
        this.dead = true;
        this.body.setVelocity(0, -520);
        this.body.setAllowGravity(true);
        this.body.checkCollision.none = true;
        // Let the death hop carry him off the bottom of the screen instead of
        // parking him on the world floor.
        this.body.setCollideWorldBounds(false);
        this.setTint(0xffffff);
        this.anims.stop();
        this.setFrame(this.isBig ? BIG.jump : SMALL.jump);
    }

    bounce(held) {
        this.body.setVelocityY(held ? PHYSICS.stompBounceHeld : PHYSICS.stompBounce);
        // Same reason the jump does it: the animation reads the coyote window,
        // so leaving lastGroundedAt alone would keep the walk cycle running for
        // up to coyoteMs while Mario is launched off an enemy's head.
        this.lastGroundedAt = -Infinity;
    }

    update(time, keys) {
        if (this.dead) return;

        if (this.frozen) {
            // Hands off during the end-of-level cutscene -- the tweens there own
            // both the transform and the alpha, and writing alpha below would
            // undo the fade into the castle.
            if (this.body.enable) {
                this.body.setAccelerationX(0);
                this.body.setVelocityX(0);
            }
            return;
        }

        // Flash while invulnerable so the state is visible.
        this.setAlpha(time < this.invulnUntil && Math.floor(time / 60) % 2 ? 0.35 : 1);

        const onGround = this.body.blocked.down || this.body.touching.down;
        const running = keys.run.isDown;
        const maxSpeed = running ? PHYSICS.runSpeed : PHYSICS.walkSpeed;
        const accel = PHYSICS.accel * (onGround ? 1 : PHYSICS.airAccelScale);

        let dir = 0;
        if (keys.left.isDown) dir -= 1;
        if (keys.right.isDown) dir += 1;

        const vx = this.body.velocity.x;
        // Skidding: pressing against your own momentum on the ground.
        const skidding = onGround && dir !== 0 && Math.sign(vx) === -dir && Math.abs(vx) > 40;

        if (dir !== 0) {
            this.body.setAccelerationX(accel * dir);
            this.body.setDragX(skidding ? PHYSICS.skidDrag : 0);
            this.setFlipX(dir < 0);
        } else {
            this.body.setAccelerationX(0);
            this.body.setDragX(PHYSICS.drag);
        }
        // Walking has a lower cap than running, but never yank a running player
        // backwards -- just stop accelerating past the cap.
        if (Math.abs(vx) > maxSpeed && Math.sign(vx) === dir) {
            this.body.setAccelerationX(0);
            if (!running) this.body.setVelocityX(Phaser.Math.Linear(vx, maxSpeed * dir, 0.2));
        }

        // Record the two windows, then jump if they overlap. Reading JustDown
        // unconditionally matters: it self-clears, so testing it together with
        // `onGround` would throw the press away on any frame the ground flag
        // happened to be false.
        if (onGround) this.lastGroundedAt = time;
        if (Phaser.Input.Keyboard.JustDown(keys.jump)) this.jumpBufferedAt = time;

        const grounded = time - this.lastGroundedAt <= PHYSICS.coyoteMs;
        const wantsJump = time - this.jumpBufferedAt <= PHYSICS.jumpBufferMs;
        if (grounded && wantsJump && this.body.velocity.y > -10) {
            this.jumpBufferedAt = -Infinity;   // consume, so it cannot double-jump
            this.lastGroundedAt = -Infinity;
            this.body.setVelocityY(PHYSICS.jumpVelocity);
            this.jumpHeldUntil = time + PHYSICS.jumpHoldMs;
            playSfx(this.scene, 'jump', { volume: 0.45 });
        }
        if (keys.jump.isDown && time < this.jumpHeldUntil && this.body.velocity.y < 0) {
            this.body.setAccelerationY(PHYSICS.jumpHoldForce);
        } else {
            this.body.setAccelerationY(0);
            this.jumpHeldUntil = 0;
        }

        // Animate off the coyote window rather than the raw contact flag: a
        // single lost frame of ground contact should not flash the jump pose.
        // Re-read it, because taking the jump above clears lastGroundedAt --
        // that is what puts Mario into the jump pose on the launching frame.
        const stillGrounded = time - this.lastGroundedAt <= PHYSICS.coyoteMs;
        this.updateAnimation(stillGrounded, skidding);
    }

    updateAnimation(grounded, skidding) {
        const p = this.size;
        const speed = Math.abs(this.body.velocity.x);

        // Reset first, in one place. `anims.timeScale` is sprite-scoped and
        // survives play(), so a pose that forgets to clear it inherits the
        // sprint multiplier -- see the reset in Level.finishLevel for the path
        // that leaves this function unreachable entirely.
        this.anims.timeScale = 1;

        if (!grounded) {
            this.play(`${p}-jump`, true);
            return;
        }
        if (skidding) {
            this.play(`${p}-skid`, true);
            return;
        }
        if (speed <= 12) {
            this.play(`${p}-idle`, true);
            return;
        }

        // Neither sheet has a separate sprint pose, so running is the walk cycle
        // with the steps quickened -- which is all the originals do either.
        this.anims.timeScale = Phaser.Math.Clamp(speed / PHYSICS.walkSpeed, 0.55, 1.9);
        this.play(`${p}-walk`, true);
    }
}
