// --- FILE SETUP & INITIALIZATION ---

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game physics and constants
const GAME_WIDTH = canvas.width;
const GAME_HEIGHT = canvas.height;
const GRAVITY = 0.6;
const MAX_FALL_SPEED = 12;
const JUMP_VELOCITY = -14;
const PLAYER_SPEED = 4;
const ENEMY_SPEED = 1.5;

// Game state variables
let gameState = 'START'; // START, PLAYING, PAUSED, GAMEOVER, COMPLETE
let lastTime = 0;
let cameraX = 0;
let levelWidth = 0;
let game;

// Global Firebase variables (Required setup for collaborative environment, though not used for simple local storage)
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
// Note: Authentication setup is omitted as the game doesn't require cloud storage, 
// focusing on the core gameplay logic as requested.

// --- GAME OBJECTS AND CLASSES ---

// 1. Player Class (The Graduate Student)
class Player {
    constructor(x, y) {
        this.w = 20;
        this.h = 32;
        this.x = x;
        this.y = y;
        this.velocityX = 0;
        this.velocityY = 0;
        this.isJumping = false;
        this.isGrounded = false;
        this.health = 3;
        this.score = 0;
        this.invincibleTimer = 0; // For temporary invincibility after taking damage
        this.powerUpTimer = 0; // For Coffee power-up duration
        this.isSpeedBoosted = false;
        this.controls = { left: false, right: false, jump: false };
    }

    // Main update logic for physics and movement
    update() {
        // --- 1. Horizontal Movement ---
        let actualSpeed = this.isSpeedBoosted ? PLAYER_SPEED * 1.5 : PLAYER_SPEED;

        if (this.controls.left) {
            this.velocityX = -actualSpeed;
        } else if (this.controls.right) {
            this.velocityX = actualSpeed;
        } else {
            // Apply deceleration when no key is pressed
            this.velocityX *= 0.8;
            if (Math.abs(this.velocityX) < 0.5) this.velocityX = 0;
        }

        this.x += this.velocityX;

        // --- 2. Vertical Movement & Gravity ---
        if (!this.isGrounded) {
            this.velocityY += GRAVITY;
            this.velocityY = Math.min(this.velocityY, MAX_FALL_SPEED); // Cap fall speed
        } else {
            this.velocityY = 0;
        }

        if (this.controls.jump && this.isGrounded) {
            this.velocityY = JUMP_VELOCITY;
            this.isJumping = true;
            this.isGrounded = false;
        }

        this.y += this.velocityY;

        // --- 3. Timers ---
        if (this.invincibleTimer > 0) {
            this.invincibleTimer--;
        }

        if (this.powerUpTimer > 0) {
            this.powerUpTimer--;
            if (this.powerUpTimer === 0) {
                this.isSpeedBoosted = false; // Power-up wears off
            }
        }
    }

    // Draw the player on the canvas
    draw() {
        if (this.invincibleTimer % 10 < 5 && this.invincibleTimer > 0) {
            // Blink when invincible (retro flicker effect)
            return; 
        }

        ctx.fillStyle = '#4a2542'; // Dark color for the student (retro purple/brown)
        
        // Draw body (Simple shape: body + head)
        ctx.fillRect(this.x - cameraX, this.y, this.w, this.h); 
        ctx.fillStyle = '#fce303'; // Yellow for backpack/laptop (simple detail)
        ctx.fillRect(this.x - cameraX + 2, this.y + 5, 5, 15);

        // Draw Health/Lives (moved to HUD, but keeping drawing logic simple here)
    }

    // Apply damage and invincibility
    takeDamage() {
        if (this.invincibleTimer === 0) {
            this.health--;
            this.invincibleTimer = 60; // 1 second of invincibility (60 frames)
            if (this.health <= 0) {
                game.gameOver();
            }
        }
    }

    // Apply power-up effect
    applyPowerUp(type) {
        if (type === 'coffee') {
            this.isSpeedBoosted = true;
            this.powerUpTimer = 300; // 5 seconds (300 frames)
        } else if (type === 'cap') {
            this.score += 500; // Large score boost
            this.health = Math.min(3, this.health + 1); // Add a life, max 3
            this.invincibleTimer = 180; // Longer invincibility for a powerful item
        } else if (type === 'textbook') {
            this.score += 50; // Standard score increase
        } else if (type === 'scroll') {
            this.score += 200; // Big score increase
        }
    }
}

// 2. Platform Class
class Platform {
    constructor(x, y, w, h, color = '#3c6e71') {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.color = color;
    }

    draw() {
        ctx.fillStyle = this.color; // Retro teal/grey
        ctx.fillRect(this.x - cameraX, this.y, this.w, this.h);
    }
}

// 3. Collectible Class (Textbooks, Coffee, Caps, Scrolls)
class Collectible {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.w = 16;
        this.h = 16;
        this.type = type; // 'textbook', 'coffee', 'cap', 'scroll'
        this.collected = false;
        this.initialY = y; // For simple floating animation
        this.floatOffset = 0;
    }

    update() {
        // Simple floating animation
        this.floatOffset = Math.sin(Date.now() / 200) * 1.5;
        this.y = this.initialY + this.floatOffset;
    }

    draw() {
        if (this.collected) return;

        let color, text;
        switch (this.type) {
            case 'textbook':
                color = '#e36414'; // Orange/Red
                text = '📚';
                break;
            case 'coffee':
                color = '#6d4c41'; // Brown
                text = '☕';
                break;
            case 'cap':
                color = '#0077b6'; // Blue
                text = '🎓';
                break;
            case 'scroll':
                color = '#f1c40f'; // Yellow/Gold
                text = '📜';
                break;
        }

        ctx.fillStyle = color;
        // Drawing as simple shapes for the retro look
        ctx.fillRect(this.x - cameraX, this.y, this.w, this.h);
        
        // Fallback to text/emoji if simple shapes are not expressive enough
        ctx.font = '14px monospace';
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'center';
        ctx.fillText(text, this.x - cameraX + this.w / 2, this.y + this.h - 2);
    }
}

// 4. Enemy Class (Stress Cloud)
class Enemy {
    constructor(x, y, type = 'stress', patrolStart = x, patrolEnd = x + 100) {
        this.x = x;
        this.y = y;
        this.w = 30;
        this.h = 30;
        this.type = type;
        this.velocityX = ENEMY_SPEED;
        this.patrolStart = patrolStart;
        this.patrolEnd = patrolEnd;
        this.isAlive = true;
    }

    update() {
        if (!this.isAlive) return;

        this.x += this.velocityX;

        // Simple patrolling behavior: reverse direction when reaching bounds
        if (this.x < this.patrolStart) {
            this.velocityX = ENEMY_SPEED;
        } else if (this.x + this.w > this.patrolEnd) {
            this.velocityX = -ENEMY_SPEED;
        }
    }

    draw() {
        if (!this.isAlive) return;

        // Stress Cloud (Simple grey cloud shape)
        ctx.fillStyle = '#6c7a89'; // Grey/Blue
        ctx.beginPath();
        ctx.arc(this.x - cameraX + 15, this.y + 15, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3c4753'; // Darker grey for eyes
        ctx.fillRect(this.x - cameraX + 8, this.y + 10, 4, 4);
        ctx.fillRect(this.x - cameraX + 18, this.y + 10, 4, 4);
        
        ctx.font = '10px monospace';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText('STRESS', this.x - cameraX + this.w / 2, this.y + this.h + 8);
    }
}

// 5. Game Manager Class
class Game {
    constructor() {
        this.player = null;
        this.platforms = [];
        this.collectibles = [];
        this.enemies = [];
        this.goal = null;
        this.startLevel();
    }

    // Define and load the level structure
    startLevel() {
        // Reset player state and load level elements
        this.player = new Player(50, GAME_HEIGHT - 32 - 40); // Start position
        this.platforms = [];
        this.collectibles = [];
        this.enemies = [];

        // Define Level Layout: A journey through campus
        const PLATFORM_COLOR = '#3c6e71';
        
        // 1. Initial Ground and Library Platform
        this.platforms.push(new Platform(0, GAME_HEIGHT - 40, 2000, 40, '#2d3e50')); // Long ground
        this.platforms.push(new Platform(300, GAME_HEIGHT - 120, 150, 20, PLATFORM_COLOR)); // Lecture Hall
        this.platforms.push(new Platform(500, GAME_HEIGHT - 200, 100, 20, PLATFORM_COLOR)); // Shelf 1
        this.platforms.push(new Platform(750, GAME_HEIGHT - 150, 100, 20, PLATFORM_COLOR)); // Shelf 2
        this.platforms.push(new Platform(1000, GAME_HEIGHT - 250, 150, 20, PLATFORM_COLOR)); // High Research Desk

        // 2. Cafe and Study Area
        this.platforms.push(new Platform(1300, GAME_HEIGHT - 80, 200, 40, '#a56c4d')); // Coffee Counter
        this.platforms.push(new Platform(1600, GAME_HEIGHT - 160, 100, 20, PLATFORM_COLOR)); // Checkpoint Platform

        // 3. Final Ascent / Graduation Zone
        this.platforms.push(new Platform(1900, GAME_HEIGHT - 250, 50, 20, PLATFORM_COLOR));
        this.platforms.push(new Platform(2000, GAME_HEIGHT - 350, 50, 20, PLATFORM_COLOR));
        this.platforms.push(new Platform(2100, GAME_HEIGHT - 400, 100, 20, PLATFORM_COLOR));

        // Define Collectibles
        this.collectibles.push(new Collectible(350, GAME_HEIGHT - 160, 'textbook'));
        this.collectibles.push(new Collectible(550, GAME_HEIGHT - 240, 'coffee'));
        this.collectibles.push(new Collectible(800, GAME_HEIGHT - 190, 'textbook'));
        this.collectibles.push(new Collectible(1050, GAME_HEIGHT - 290, 'scroll'));
        this.collectibles.push(new Collectible(1400, GAME_HEIGHT - 120, 'textbook'));
        this.collectibles.push(new Collectible(2150, GAME_HEIGHT - 440, 'cap')); // Graduation Cap at the end

        // Define Enemies
        // Stress Cloud patrolling on the initial ground
        this.enemies.push(new Enemy(400, GAME_HEIGHT - 70, 'stress', 400, 600)); 
        // Stress Cloud hovering in the middle area
        this.enemies.push(new Enemy(1450, GAME_HEIGHT - 110, 'stress', 1450, 1600)); 
        // Static Stress Cloud hazard near the top
        this.enemies.push(new Enemy(1800, GAME_HEIGHT - 280, 'stress', 1800, 1800)); 

        // Define Goal (The Graduation Podium)
        this.goal = { 
            x: 2150, 
            y: GAME_HEIGHT - 400 - 60, 
            w: 50, 
            h: 60, 
            color: '#ffd700' 
        };

        levelWidth = this.platforms.reduce((max, p) => Math.max(max, p.x + p.w), 0);
        
        // Filter out any collectibles that start below the lowest platform
        this.collectibles = this.collectibles.filter(c => c.y < GAME_HEIGHT - 40);
        
        gameState = 'PLAYING';
    }

    // Handle game over state
    gameOver() {
        gameState = 'GAMEOVER';
    }
    
    // Handle level completion
    levelComplete() {
        gameState = 'COMPLETE';
    }

    // Main update function (called every frame)
    update() {
        if (gameState !== 'PLAYING') return;

        this.player.update();
        this.collectibles.forEach(c => c.update());
        this.enemies.forEach(e => e.update());

        this.handleCollisions();
        this.updateCamera();
        this.checkGoal();
    }

    // --- COLLISION DETECTION ---
    
    // Simple AABB (Axis-Aligned Bounding Box) collision check
    checkCollision(rect1, rect2) {
        return rect1.x < rect2.x + rect2.w &&
               rect1.x + rect1.w > rect2.x &&
               rect1.y < rect2.y + rect2.h &&
               rect1.y + rect1.h > rect2.y;
    }

    // Handle all collisions (platform, collectible, enemy)
    handleCollisions() {
        const player = this.player;
        let wasGroundedBefore = player.isGrounded;
        player.isGrounded = false; // Assume not grounded until a collision proves otherwise

        // 1. Platform Collision
        this.platforms.forEach(p => {
            if (this.checkCollision(player, p)) {
                // Determine collision side based on previous position
                const prevBottom = player.y - player.velocityY + player.h;
                const prevTop = player.y - player.velocityY;

                // Collision from above (landing on a platform)
                if (prevBottom <= p.y) {
                    player.y = p.y - player.h; // Place player exactly on top
                    player.velocityY = 0;
                    player.isGrounded = true;
                    player.isJumping = false;
                } 
                // Collision from below (hitting head on a platform)
                else if (prevTop >= p.y + p.h) {
                    player.y = p.y + p.h;
                    player.velocityY = 0; // Reverse direction of fall
                }
                // Collision from side (prevents player from walking through it)
                else {
                    const prevRight = player.x - player.velocityX + player.w;
                    const prevLeft = player.x - player.velocityX;
                    
                    if (prevRight <= p.x) { // Hitting right side of player on left side of platform
                        player.x = p.x - player.w;
                        player.velocityX = 0;
                    } else if (prevLeft >= p.x + p.w) { // Hitting left side of player on right side of platform
                        player.x = p.x + p.w;
                        player.velocityX = 0;
                    }
                }
            }
        });
        
        // If the player was grounded but now isn't, they are falling
        if (wasGroundedBefore && !player.isGrounded && !player.isJumping) {
            // Initiate a small fall if they walk off a platform
            player.isJumping = true; 
        }

        // 2. Collectible Collision
        this.collectibles.forEach(c => {
            if (!c.collected && this.checkCollision(player, c)) {
                player.applyPowerUp(c.type);
                c.collected = true; // Mark as collected for removal
            }
        });
        // Remove collected items
        this.collectibles = this.collectibles.filter(c => !c.collected);

        // 3. Enemy Collision
        this.enemies.forEach(e => {
            if (e.isAlive && this.checkCollision(player, e)) {
                // Check for stomp collision (player falling onto the enemy)
                if (player.velocityY > 0 && player.y + player.h <= e.y + 10) { 
                    e.isAlive = false; // Defeated!
                    player.velocityY = JUMP_VELOCITY * 0.5; // Small bounce up
                    player.score += 100;
                } else {
                    // Standard collision/hazard
                    player.takeDamage();
                }
            }
        });
        // Remove defeated enemies
        this.enemies = this.enemies.filter(e => e.isAlive);
    }
    
    // Check if player reached the goal
    checkGoal() {
        if (this.checkCollision(this.player, this.goal)) {
            this.levelComplete();
        }
    }

    // Update the camera position to follow the player
    updateCamera() {
        // Center the camera on the player
        cameraX = this.player.x - GAME_WIDTH / 2 + this.player.w / 2;

        // Clamp the camera bounds
        // Left boundary: cameraX cannot go below 0
        cameraX = Math.max(0, cameraX); 
        // Right boundary: cameraX cannot expose the right edge of the level
        cameraX = Math.min(cameraX, levelWidth - GAME_WIDTH);

        // Ensures the camera doesn't move past the start of the level
        if (levelWidth < GAME_WIDTH) {
            cameraX = 0;
        }
    }

    // --- RENDERING (Drawing everything on the screen) ---
    draw() {
        // Clear canvas
        ctx.fillStyle = '#c7f0d8'; // Game Boy background color
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

        // Draw level elements (platforms, goal)
        this.platforms.forEach(p => p.draw());

        // Draw goal (Graduation Podium)
        ctx.fillStyle = this.goal.color;
        ctx.fillRect(this.goal.x - cameraX, this.goal.y, this.goal.w, this.goal.h);
        ctx.fillStyle = '#000000';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('GOAL', this.goal.x - cameraX + this.goal.w / 2, this.goal.y + 15);

        // Draw collectibles and enemies
        this.collectibles.forEach(c => c.draw());
        this.enemies.forEach(e => e.draw());

        // Draw player
        this.player.draw();

        // Draw HUD (Score and Health)
        this.drawHUD();
        
        // Draw Overlay Screens (Start, Pause, Game Over, Complete)
        switch (gameState) {
            case 'START':
                this.drawStartScreen();
                break;
            case 'PAUSED':
                this.drawPauseScreen();
                break;
            case 'GAMEOVER':
                this.drawGameOverScreen();
                break;
            case 'COMPLETE':
                this.drawLevelCompleteScreen();
                break;
        }
    }

    drawHUD() {
        ctx.font = '16px monospace';
        ctx.fillStyle = '#1e3d59'; // Dark text color

        // 1. Score
        ctx.textAlign = 'left';
        ctx.fillText(`Score: ${this.player.score}`, 10, 30);

        // 2. Health/Lives (3 hearts visual)
        ctx.textAlign = 'right';
        ctx.fillText('Health: ', GAME_WIDTH - 80, 30);
        for (let i = 0; i < 3; i++) {
            // Draw a heart outline or filled heart
            ctx.fillStyle = (i < this.player.health) ? '#ff0000' : '#888888';
            ctx.fillText('♥', GAME_WIDTH - 60 + i * 20, 30);
        }

        // 3. Power-up status
        if (this.player.powerUpTimer > 0) {
            const time = (this.player.powerUpTimer / 60).toFixed(1);
            ctx.textAlign = 'center';
            ctx.fillStyle = '#0077b6';
            ctx.fillText(`COFFEE BOOST: ${time}s`, GAME_WIDTH / 2, 30);
        }
        
        // 4. Invincibility status
        if (this.player.invincibleTimer > 0 && gameState === 'PLAYING') {
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ff9800';
            ctx.fillText('INVINCIBLE', GAME_WIDTH / 2, 50);
        }
    }

    drawStartScreen() {
        this.drawOverlay('Academic Ascent: Campus Quest', 'Press SPACE to Start');
    }

    drawPauseScreen() {
        this.drawOverlay('Game Paused', 'Press P to Resume');
    }

    drawGameOverScreen() {
        this.drawOverlay('Game Over', `Final Score: ${this.player.score} | Press SPACE to Restart`);
    }

    drawLevelCompleteScreen() {
        this.drawOverlay('You Graduated!', 
                         `Final Score: ${this.player.score} | You made it to graduation with a 4.0 GPA in Platforming!`,
                         'Press SPACE to Play Again');
    }

    // Helper for drawing translucent screen overlays
    drawOverlay(title, subtitle, actionText = '') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        
        ctx.font = '40px monospace';
        ctx.fillText(title, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 50);
        
        ctx.font = '20px monospace';
        ctx.fillText(subtitle, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 10);
        
        ctx.font = '16px monospace';
        ctx.fillText(actionText, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 50);
    }
}

// --- INPUT HANDLING ---

const keyMap = {
    'ArrowLeft': 'left',
    'ArrowRight': 'right',
    'Space': 'jump',
    'p': 'pause',
    'P': 'pause',
};

document.addEventListener('keydown', (e) => {
    const keyAction = keyMap[e.key];

    if (keyAction === 'pause') {
        if (gameState === 'PLAYING') {
            gameState = 'PAUSED';
        } else if (gameState === 'PAUSED') {
            gameState = 'PLAYING';
            // Resume the loop immediately
            requestAnimationFrame(gameLoop); 
        }
        e.preventDefault();
        return;
    }
    
    // Handle state transitions (Start, Game Over, Complete)
    if (e.key === ' ' && (gameState === 'START' || gameState === 'GAMEOVER' || gameState === 'COMPLETE')) {
        game = new Game(); // Re-initialize the game
        gameState = 'PLAYING';
        e.preventDefault();
        requestAnimationFrame(gameLoop); // Start the loop
        return;
    }

    // Set player control state
    if (game && game.player && keyAction) {
        if (keyAction === 'jump') {
            game.player.controls.jump = true;
        } else {
            game.player.controls[keyAction] = true;
        }
    }
});

document.addEventListener('keyup', (e) => {
    const keyAction = keyMap[e.key];
    
    // Clear player control state
    if (game && game.player && keyAction) {
        if (keyAction === 'jump') {
            game.player.controls.jump = false;
        } else {
            game.player.controls[keyAction] = false;
        }
    }
});

// --- GAME LOOP ---

function gameLoop(currentTime) {
    if (gameState === 'PAUSED') return; // Stop the loop if paused
    if (gameState === 'GAMEOVER' || gameState === 'COMPLETE') {
        game.draw(); // Draw final state and screen
        return; // Stop the loop if game is over/complete
    }

    const deltaTime = currentTime - lastTime;
    lastTime = currentTime;

    // 1. Update (Physics, Movement, Game Logic)
    game.update(deltaTime);

    // 2. Render (Drawing to canvas)
    game.draw();

    // Request the next frame
    requestAnimationFrame(gameLoop);
}

// --- START GAME ---

// Initialize the game manager and set initial state
window.onload = function() {
    game = new Game();
    gameState = 'START';
    requestAnimationFrame(gameLoop);
};
