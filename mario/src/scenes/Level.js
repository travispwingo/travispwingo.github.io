import Phaser from '../../lib/phaser.esm.min.js';
import { TILE, VIEW_W, VIEW_H, RULES, PHYSICS } from '../config.js';
import { buildLevel, ROWS } from '../level1.js';
import { createAnimations, SMALL, BIG } from '../frames.js';
import { playSfx, startMusic, stopMusic } from '../audio.js';
import Player from '../entities/Player.js';
import { Goomba, Koopa } from '../entities/Enemy.js';
import { Coin, QBlock, Mushroom, Flagpole, makePipe } from '../entities/Props.js';

const POSE = { small: SMALL, big: BIG };

export default class LevelScene extends Phaser.Scene {
    constructor() {
        super('level');
    }

    /**
     * Carry progress across a death.
     *
     * Respawning is a scene.restart(), which re-runs create() -- so anything
     * that should survive dying has to come in through here rather than being
     * initialised below, or every death would silently reset the run (and hand
     * the player infinite lives).
     */
    init(data) {
        this.carried = {
            lives: data?.lives ?? 3,
            score: data?.score ?? 0,
            coins: data?.coins ?? 0,
        };
    }

    create() {
        createAnimations(this);

        this.state = {
            coins: this.carried.coins,
            score: this.carried.score,
            time: RULES.startTime,
            lives: this.carried.lives,
            finished: false,
        };
        this.finishing = false;
        this.dying = false;

        const { grid, spawns, width } = buildLevel();
        this.levelWidth = width * TILE;
        this.levelHeight = ROWS * TILE;

        this.createBackground();
        this.createTerrain(grid);
        this.createEntities(spawns);
        this.createCamera();
        this.createInput();
        this.createColliders();

        this.scene.launch('hud');
        this.hud = this.scene.get('hud');
        this.hud.bind(this);

        startMusic(this);

        this.timeEvent = this.time.addEvent({
            delay: RULES.timeScale * 1000,
            loop: true,
            callback: () => {
                if (this.state.finished || this.player.dead) return;
                this.state.time = Math.max(0, this.state.time - 1);
                if (this.state.time === 0) this.killPlayer();
            },
        });

        this.events.once('shutdown', () => {
            this.timeEvent?.remove();
            this.game.events.off('mute-changed', this.onMuteChanged);
            this.scene.stop('hud');
        });
    }

    // -- construction --------------------------------------------------------

    createBackground() {
        // Two parallax layers. tileSprite repeats horizontally, and a scroll
        // factor below 1 makes them drift slower than the camera.
        this.bgClouds = this.add.tileSprite(0, 0, VIEW_W, VIEW_H, 'bg-clouds')
            .setOrigin(0).setScrollFactor(0).setDepth(-20);

        // 01.png is 1024x864 and mostly sky, with the hills along its bottom
        // edge, so scroll the source up to show the interesting part.
        const hillsH = 300;
        this.bgHills = this.add.tileSprite(0, VIEW_H - hillsH, VIEW_W, hillsH, 'bg-hills')
            .setOrigin(0).setScrollFactor(0).setDepth(-10);
        this.bgHills.tilePositionY = this.textures.get('bg-hills').getSourceImage().height - hillsH;
    }

    createTerrain(grid) {
        // A hand-authored 2D array of tile indexes, no Tiled involved.
        const map = this.make.tilemap({
            data: grid,
            tileWidth: TILE,
            tileHeight: TILE,
        });
        // margin/spacing match the 1px extrusion written by build_assets.py.
        // The trailing 1 is firstgid: level1.js numbers tiles from 1 so that 0
        // and -1 can both mean "nothing here".
        const tiles = map.addTilesetImage('tiles', 'tileset', TILE, TILE, 1, 2, 1);
        this.layer = map.createLayer(0, tiles, 0, 0);
        this.layer.setCollisionByExclusion([-1]);
        this.map = map;
    }

    createEntities(spawns) {
        this.enemies = this.add.group({ runChildUpdate: false });
        this.coins = this.physics.add.group({ allowGravity: false, immovable: true });
        this.blocks = this.physics.add.staticGroup();
        this.powerups = this.physics.add.group();
        this.solids = this.physics.add.staticGroup();

        let spawnPoint = { x: TILE * 3, y: TILE * 11 };

        for (const { ch, x, y } of spawns) {
            const wx = x * TILE + TILE / 2;
            const wy = y * TILE + TILE;      // bottom edge of the cell

            switch (ch) {
                case '@':
                    spawnPoint = { x: wx, y: wy };
                    break;
                case 'o':
                    this.coins.add(new Coin(this, wx, wy - TILE / 2));
                    break;
                case '?':
                    this.blocks.add(new QBlock(this, wx, wy - TILE / 2, 'coin'));
                    break;
                case 'M':
                    this.blocks.add(new QBlock(this, wx, wy - TILE / 2, 'mushroom'));
                    break;
                case 'g':
                    this.enemies.add(new Goomba(this, wx, wy));
                    break;
                case 'k':
                    this.enemies.add(new Koopa(this, wx, wy));
                    break;
                case 'p':
                    makePipe(this, this.solids, wx + TILE / 2, this.groundYAt(x), 2);
                    break;
                case 'F':
                    this.flagpole = new Flagpole(this, wx, this.groundYAt(x), 9);
                    break;
                case 'C':
                    this.castle = this.add.image(wx, this.groundYAt(x), 'atlas', 'castle')
                        .setOrigin(0.5, 1).setDepth(-1);
                    break;
                default:
                    console.warn(`level: unknown spawn character '${ch}' at ${x},${y}`);
            }
        }

        this.blocks.refresh();
        this.player = new Player(this, spawnPoint.x, spawnPoint.y);
        this.spawnPoint = spawnPoint;
    }

    /** World Y of the top of the ground column under a tile x. */
    groundYAt(tileX) {
        for (let y = 0; y < ROWS; y++) {
            const tile = this.layer.getTileAt(tileX, y);
            if (tile && tile.index !== -1) return y * TILE;
        }
        return ROWS * TILE;
    }

    createCamera() {
        this.physics.world.setBounds(0, 0, this.levelWidth, this.levelHeight + TILE * 6);
        this.cameras.main.setBounds(0, 0, this.levelWidth, this.levelHeight);
        this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
        // Keep Mario left of centre so there is room to see what is coming.
        this.cameras.main.setFollowOffset(-VIEW_W * 0.12, 0);
    }

    createInput() {
        const K = Phaser.Input.Keyboard.KeyCodes;
        this.keys = this.input.keyboard.addKeys({
            left: K.LEFT, right: K.RIGHT, up: K.UP, down: K.DOWN,
            jump: K.Z, run: K.X,
        });
        // WASD and space as aliases, so nobody has to guess the layout.
        const alt = this.input.keyboard.addKeys({
            left: K.A, right: K.D, jump: K.SPACE, run: K.SHIFT,
        });
        this.altKeys = alt;

        // Mute itself is bound once in main.js; this only mirrors it in the HUD.
        this.onMuteChanged = (muted) =>
            this.hud?.flashMessage(muted ? 'SOUND OFF' : 'SOUND ON');
        this.game.events.on('mute-changed', this.onMuteChanged);

        this.input.keyboard.on('keydown-R', () => this.scene.restart());
    }

    createColliders() {
        // ORDER MATTERS, and only for this one line.
        //
        // Arcade runs colliders in registration order within a step, and most
        // of the ? blocks sit flush between solid tiles in the same row. If the
        // tilemap is checked first it separates Mario to exactly the tile's
        // bottom edge -- which is exactly the block's bottom edge too -- and
        // Arcade's AABB test treats touching edges as not intersecting, so the
        // block collider that runs next never fires and the block silently
        // eats the hit. Blocks first; the tilemap pass then finds nothing to do.
        // The same trap is waiting for `solids` if a pipe ever abuts a block.
        this.physics.add.collider(this.player, this.blocks,
            (player, block) => this.onBlockHit(player, block));

        this.physics.add.collider(this.player, this.layer);
        this.physics.add.collider(this.player, this.solids);
        this.physics.add.collider(this.enemies, this.layer);
        this.physics.add.collider(this.enemies, this.solids);
        this.physics.add.collider(this.powerups, this.layer);
        this.physics.add.collider(this.powerups, this.solids);
        this.physics.add.collider(this.enemies, this.blocks);
        this.physics.add.collider(this.powerups, this.blocks);

        this.physics.add.overlap(this.player, this.coins,
            (player, coin) => this.onCoin(coin));
        this.physics.add.overlap(this.player, this.powerups,
            (player, item) => this.onPowerup(item));
        this.physics.add.overlap(this.player, this.enemies,
            (player, enemy) => this.onEnemyTouch(enemy));
        // A sliding shell clears out anything it runs into.
        this.physics.add.overlap(this.enemies, this.enemies,
            (a, b) => this.onEnemyPair(a, b));

        if (this.flagpole) {
            this.physics.add.overlap(this.player, this.flagpole.zone,
                () => this.finishLevel());
        }
    }

    // -- interactions --------------------------------------------------------

    onBlockHit(player, block) {
        // Only a hit from underneath counts.
        if (!player.body.blocked.up && !player.body.touching.up) return;
        if (block.spent) {
            playSfx(this, 'bump', { volume: 0.4 });
            return;
        }
        const item = block.bump(player);
        if (item instanceof Mushroom) {
            this.powerups.add(item);
        } else {
            this.state.coins += 1;
            this.addScore(RULES.coinScore, block.x, block.y);
        }
    }

    onCoin(coin) {
        if (!coin.body || !coin.body.enable) return;
        coin.collect();
        this.state.coins += 1;
        playSfx(this, 'coin');
        this.addScore(RULES.coinScore, coin.x, coin.y);
    }

    onPowerup(item) {
        if (!item.body || item.emerging) return;
        item.destroy();
        playSfx(this, 'powerup');
        this.player.grow();
        this.addScore(RULES.powerScore, this.player.x, this.player.y - TILE);
    }

    onEnemyTouch(enemy) {
        if (this.player.dead || enemy.dying || this.state.finished) return;

        const vx = this.player.body.velocity.x;
        const falling = this.player.body.velocity.y > 40;
        // Generous, deliberately: at maxFall Mario covers 12.7px in a step, so a
        // tight window lets a hard landing skip the stomp and take the hit instead.
        const above = this.player.body.bottom <= enemy.body.top + 20;
        // Read before stomp() mutates it -- stomping a *resting* shell kicks it.
        const resting = enemy instanceof Koopa && enemy.shelled && !enemy.sliding;

        // Coming down on it always counts, grace window or not: landing on a
        // shell you are chasing is how you stop it, and gating that too made
        // an overlapping shell unstoppable as well as harmless.
        if (falling && above) {
            if (enemy.stomp(this.player.x, vx)) {
                playSfx(this, resting ? 'kick' : 'stomp');
                this.player.bounce(this.keys.jump.isDown || this.altKeys.jump.isDown);
                this.addScore(RULES.stompScore, enemy.x, enemy.y - TILE);
            }
            return;
        }

        // Overlaps re-fire every step the bodies intersect, so an enemy that was
        // just stomped or kicked is still inside Mario on the following frames.
        // Without this window the kick's own follow-up frame kills him.
        //
        // It gates the harmful half only. The window is extended for as long as
        // they stay overlapping, which makes the rule "a shell you just hit
        // cannot hurt you until you are clear of it" rather than "for N
        // milliseconds" -- a fixed window is a coin flip when a shell slides
        // away at barely more than running speed.
        if (this.time.now < enemy.contactGraceUntil) {
            enemy.holdContact();
            return;
        }

        // A resting shell gets kicked rather than hurting you.
        if (resting) {
            enemy.kick(this.player.x, vx);
            playSfx(this, 'kick');
            return;
        }

        if (this.player.takeHit() === 'death') this.killPlayer();
    }

    onEnemyPair(a, b) {
        for (const [shell, other] of [[a, b], [b, a]]) {
            if (shell instanceof Koopa && shell.sliding && !other.dying && other !== shell) {
                other.tumble(Math.sign(shell.body.velocity.x) || 1);
                playSfx(this, 'kick');
                this.addScore(RULES.stompScore, other.x, other.y - TILE);
            }
        }
    }

    addScore(points, x, y) {
        this.state.score += points;
        if (x === undefined) return;
        const label = this.add.bitmapText(x, y, 'smw', String(points), 12).setOrigin(0.5, 1);
        this.tweens.add({
            targets: label,
            y: y - 34,
            alpha: 0,
            duration: 720,
            onComplete: () => label.destroy(),
        });
    }

    // -- life cycle ----------------------------------------------------------

    /**
     * Lose a life and schedule the respawn.
     *
     * The guard is a scene flag, not `player.dead`: taking a fatal hit already
     * runs Player.die() inside takeHit(), so guarding on the player's own flag
     * made this return immediately -- lives never decremented, no respawn was
     * ever scheduled, and dying to an enemy soft-locked the game.
     */
    killPlayer() {
        if (this.dying) return;
        this.dying = true;
        this.player.die();
        stopMusic(this);
        playSfx(this, 'death');
        this.state.lives -= 1;

        this.time.delayedCall(RULES.respawnDelayMs, () => {
            if (this.state.lives > 0) {
                this.scene.restart({
                    lives: this.state.lives,
                    score: this.state.score,
                    coins: this.state.coins,
                });
            } else {
                playSfx(this, 'gameover');
                this.showEndCard('GAME OVER', () => this.scene.start('title'));
            }
        });
    }

    finishLevel() {
        if (this.finishing) return;
        this.finishing = true;
        this.state.finished = true;

        const pole = this.flagpole;
        const ratio = pole.grabRatio(this.player.body.bottom);
        const bonus = Math.round(RULES.flagScoreMax * (0.2 + 0.8 * ratio) / 100) * 100;

        stopMusic(this);
        playSfx(this, 'flagpole');

        this.player.frozen = true;
        this.player.body.setVelocity(0, 0);
        // Hand the transform over to the tweens below. A live Arcade body
        // rewrites x/y every step and would cancel them out.
        this.player.body.enable = false;
        this.player.setFlipX(false);
        this.player.x = pole.x + 10;
        this.player.anims.stop();
        // `frozen` stops Player.update before updateAnimation, which is the only
        // thing that ever resets this -- and play() carries timeScale across. Without
        // the reset, walkToCastle replays the walk at whatever sprint multiplier
        // Mario was carrying when he grabbed the pole (up to 1.85x).
        this.player.anims.timeScale = 1;
        this.player.setFrame(POSE[this.player.size].pole);

        // Slide down the pole, flag descending alongside.
        this.tweens.add({
            targets: this.player,
            y: pole.baseY,
            duration: 900 * Math.max(0.35, ratio),
            ease: 'Quad.in',
            onStart: () => pole.lowerFlag(),
            onComplete: () => this.walkToCastle(bonus),
        });
    }

    walkToCastle(bonus) {
        const targetX = this.castle ? this.castle.x - 6 : this.player.x + TILE * 6;
        this.player.setFlipX(false);
        this.player.play(`${this.player.size}-walk`, true);
        // Body stays disabled through the walk -- the tween owns x/y until the
        // level is over.

        playSfx(this, 'stage-clear');

        this.tweens.add({
            targets: this.player,
            x: targetX,
            duration: Math.max(600, Math.abs(targetX - this.player.x) * 9),
            ease: 'Linear',
            onComplete: () => {
                this.tweens.add({
                    targets: this.player, alpha: 0, duration: 420,
                    onComplete: () => {
                        this.addScore(bonus);
                        const timeBonus = this.state.time * 50;
                        this.addScore(timeBonus);
                        this.showEndCard(
                            `COURSE CLEAR\n\nFLAG ${bonus}\nTIME ${timeBonus}\n` +
                            `SCORE ${this.state.score}`,
                            () => this.scene.start('title'));
                    },
                });
            },
        });
    }

    showEndCard(text, onDismiss) {
        const cam = this.cameras.main;
        const cx = cam.scrollX + VIEW_W / 2;
        const cy = cam.scrollY + VIEW_H / 2;

        this.add.rectangle(cx, cy, VIEW_W, VIEW_H, 0x000000, 0.72).setDepth(50);
        this.add.bitmapText(cx, cy - 20, 'smw', text, 20)
            .setOrigin(0.5).setCenterAlign().setDepth(51);
        const hint = this.add.bitmapText(cx, cy + VIEW_H * 0.3, 'smw', 'PRESS ENTER', 12)
            .setOrigin(0.5).setDepth(51);
        this.tweens.add({ targets: hint, alpha: 0.2, duration: 600, yoyo: true, repeat: -1 });

        this.input.keyboard.once('keydown-ENTER', onDismiss);
        this.input.keyboard.once('keydown-SPACE', onDismiss);
    }

    // -- frame loop ----------------------------------------------------------

    update(time) {
        const keys = this.mergedKeys();
        this.player.update(time, keys);

        for (const enemy of this.enemies.getChildren()) enemy.patrol(this.layer);
        for (const item of this.powerups.getChildren()) item.patrol?.();

        // Parallax: tie the layers to the camera at a fraction of its speed.
        const sx = this.cameras.main.scrollX;
        this.bgClouds.tilePositionX = sx * 0.12;
        this.bgHills.tilePositionX = sx * 0.35;

        if (!this.player.dead && this.player.y > this.levelHeight + TILE * 3) {
            this.killPlayer();
        }
    }

    /** Treat arrow keys and WASD/space as the same controls. */
    mergedKeys() {
        const a = this.keys;
        const b = this.altKeys;
        const or = (x, y) => ({ isDown: x.isDown || y.isDown });
        return {
            left: or(a.left, b.left),
            right: or(a.right, b.right),
            up: a.up,
            down: a.down,
            // JustDown needs the real Key object, so pick whichever is pressed.
            jump: b.jump.isDown && !a.jump.isDown ? b.jump : a.jump,
            run: or(a.run, b.run),
        };
    }
}
