import Phaser from '../../lib/phaser.esm.min.js';
import { TILE, PHYSICS } from '../config.js';
import { OBJECT } from '../frames.js';
import { playSfx } from '../audio.js';

/** A spinning coin you pick up by touching it. */
export class Coin extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y) {
        super(scene, x, y, 'atlas', OBJECT.coin[0]);
        scene.add.existing(this);
        scene.physics.add.existing(this);
        this.body.setAllowGravity(false);
        this.body.setImmovable(true);
        this.body.setSize(this.width * 0.6, this.height * 0.9);
        this.play('coin-spin');
    }

    collect() {
        this.disableBody(true, false);
        this.scene.tweens.add({
            targets: this,
            y: this.y - 28,
            alpha: 0,
            duration: 260,
            onComplete: () => this.destroy(),
        });
    }
}

/**
 * A ? block. Bumping it from below pops out its contents and leaves the block
 * spent. Implemented as a static body so Mario can stand on it, with the bump
 * detected from the collision direction rather than from an overlap zone.
 */
export class QBlock extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y, contents) {
        super(scene, x, y, 'atlas', OBJECT.qblock[0]);
        scene.add.existing(this);
        scene.physics.add.existing(this, true);   // static
        this.contents = contents;                  // 'coin' | 'mushroom'
        this.spent = false;
        this.play('qblock-idle');
    }

    bump(player) {
        if (this.spent) return null;
        this.spent = true;
        this.anims.stop();
        this.setFrame(OBJECT.qblockUsed);

        // Nudge the block up and back, the classic bump.
        const restY = this.y;
        this.scene.tweens.add({
            targets: this,
            y: restY - 9,
            duration: 80,
            yoyo: true,
            ease: 'Quad.out',
            onComplete: () => { this.y = restY; this.body.updateFromGameObject(); },
        });

        if (this.contents === 'mushroom') {
            playSfx(this.scene, 'powerup-appear');
            return new Mushroom(this.scene, this.x, this.y - TILE * 0.5, player);
        }
        playSfx(this.scene, 'coin');
        this.popCoin();
        return null;
    }

    /** Cosmetic coin that arcs out of the block. */
    popCoin() {
        const coin = this.scene.add.sprite(this.x, this.y - TILE * 0.5, 'atlas', OBJECT.coin[0]);
        coin.play('coin-spin');
        this.scene.tweens.add({
            targets: coin,
            y: coin.y - TILE * 2.2,
            duration: 300,
            ease: 'Quad.out',
            yoyo: true,
            hold: 40,
            onComplete: () => coin.destroy(),
        });
    }
}

/**
 * A mushroom. Rises out of its block, then walks and falls like an enemy.
 *
 * The rise is driven by velocity rather than a tween: an Arcade body writes the
 * transform back to the sprite every step, so tweening `y` on a body-bearing
 * sprite is silently undone. Anything that moves a dynamic body has to go
 * through physics.
 */
export class Mushroom extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y, player) {
        super(scene, x, y, 'atlas', OBJECT.mushroom);
        scene.add.existing(this);
        scene.physics.add.existing(this);
        this.setOrigin(0.5, 1);
        this.setDepth(-1);                       // slide out from behind the block
        this.emerging = true;
        this.emergeUntil = scene.time.now + 420;
        this.body.setAllowGravity(false);
        this.body.setVelocityY(-TILE * 0.9 / 0.42);
        this.body.setSize(this.width * 0.8, this.height * 0.8);

        // Head away from the player, the way SMW does it.
        this.dir = player && player.x > x ? -1 : 1;
    }

    patrol() {
        if (!this.body) return;
        if (this.emerging) {
            if (this.scene.time.now < this.emergeUntil) return;
            this.emerging = false;
            this.setDepth(0);
            this.body.setAllowGravity(true);
            this.body.setVelocityY(0);
        }
        if (this.body.blocked.left) this.dir = 1;
        else if (this.body.blocked.right) this.dir = -1;
        this.body.setVelocityX(90 * this.dir);
    }
}

/**
 * The end-of-level flagpole: a stack of shaft segments with a ball on top and
 * the flag riding on the side. The pole itself is not solid -- Level.js
 * overlaps against `zone` to start the ending.
 */
export class Flagpole {
    constructor(scene, x, groundY, heightTiles = 9) {
        this.scene = scene;
        this.x = x;
        this.topY = groundY - heightTiles * TILE;
        this.baseY = groundY;

        this.segments = [];
        for (let i = 0; i < heightTiles; i++) {
            this.segments.push(
                scene.add.image(x, groundY - i * TILE, 'atlas', OBJECT.poleShaft)
                    .setOrigin(0.5, 1).setDepth(1));
        }
        this.ball = scene.add.image(x, this.topY, 'atlas', OBJECT.poleBall)
            .setOrigin(0.5, 1).setDepth(2);

        this.flag = scene.add.image(x + 6, this.topY + TILE * 0.35, 'atlas', OBJECT.flag)
            .setOrigin(0, 0.5).setDepth(2);

        // Slim trigger column covering the pole's height.
        this.zone = scene.add.zone(x, (this.topY + groundY) / 2, 14, heightTiles * TILE);
        scene.physics.add.existing(this.zone, true);
    }

    /** 0 at the base, 1 at the very top -- drives the end-of-level bonus. */
    grabRatio(y) {
        return Phaser.Math.Clamp((this.baseY - y) / (this.baseY - this.topY), 0, 1);
    }

    lowerFlag(onDone) {
        this.scene.tweens.add({
            targets: this.flag,
            y: this.baseY - TILE * 1.2,
            duration: 700,
            ease: 'Quad.in',
            onComplete: onDone,
        });
    }
}

/**
 * A warp pipe: stacked sprites plus one solid body Mario can stand on.
 *
 * The body is a Zone rather than a sprite. A static body derives its size from
 * its game object, so anything created from the group's default 32x32 texture
 * would snap back to 32x32 no matter what setSize() was called with -- a Zone
 * carries the dimensions we actually want.
 */
export function makePipe(scene, solids, x, groundY, heightTiles = 2) {
    const top = scene.add.image(x, groundY - (heightTiles - 1) * TILE, 'atlas', OBJECT.pipeTop)
        .setOrigin(0.5, 1);
    for (let i = 0; i < heightTiles - 1; i++) {
        scene.add.image(x, groundY - i * TILE, 'atlas', OBJECT.pipeBody).setOrigin(0.5, 1);
    }
    const h = heightTiles * TILE;
    const zone = scene.add.zone(x, groundY - h / 2, top.width, h);
    solids.add(zone);
    return zone;
}

export { PHYSICS };
