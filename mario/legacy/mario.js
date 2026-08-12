var game = new Phaser.Game(800, 600, Phaser.AUTO, '', { preload: preload, create: create, update: update });

function preload () {
	game.load.image('background', 'assets/bg_1.png');
	game.load.atlas('atlas', 'assets/mario-objects.png', 'texturemap.json');
}

function create () {
	game.physics.startSystem(Phaser.Physics.ARCADE);

	background = game.add.tileSprite(0, -100, 800, 600, 'background');

	coin_box = game.add.sprite(20, 20, 'atlas');
	coin_box.frameName = 'coin_block_1.png';
	coin_box.animations.add('scroll', [0,1,2,3], 5, true);
}

function update () {
	// background.tilePosition.x -= 1;
	coin_box.animations.play('scroll');
}