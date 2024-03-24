document.addEventListener("DOMContentLoaded", function() {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth > 800 ? 800 : window.innerWidth;
    canvas.height = window.innerHeight > 400 ? 400 : window.innerHeight * 0.75;

    let score = 0;
    let gameRunning = false;
    let player = {
        x: 50,
        y: canvas.height - 70,
        width: 50,
        height: 50,
        jumping: false,
        color: '#00A' // Player color
    };
    let gravity = 0.5;
    let velocity = 0;
    let hurdles = [];
    let gameSpeed = 5;
    let interval = 4000;
    let lastTime = 0;

    function drawPlayer() {
        ctx.fillStyle = player.color;
        ctx.fillRect(player.x, player.y, player.width, player.height);
        ctx.strokeStyle = '#000';
        ctx.strokeRect(player.x, player.y, player.width, player.height);
    }

    // Existing variables and setup...

function jump() {
    if (!player.jumping && gameRunning) {
        player.jumping = true;
        velocity = -10; // Adjust the value as needed for desired jump strength
    }
}

// Update and render functions...

canvas.addEventListener('click', function(event) {
    // Assuming the start game logic is handled here...
    // If the game is running and the click isn't on the start button, make the player jump.
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Check if click is within start button bounds and game is not running
    if (x >= canvas.width / 2 - 50 && x <= canvas.width / 2 + 50 &&
        y >= canvas.height / 2 - 25 && y <= canvas.height / 2 + 25) {
        if (!gameRunning) {
            // Start game logic here...
        }
    } else {
        // If the game is running and the click is outside the start button area, the player should jump.
        jump();
    }
});

// The game loop and other necessary parts of your game logic...


    function updatePlayer() {
        if (player.jumping) {
            player.y += velocity;
            velocity += gravity;
        }

        if (player.y >= canvas.height - player.height) {
            player.jumping = false;
            player.y = canvas.height - player.height;
            velocity = 0;
        }
    }

    function createHurdle() {
        let size = Math.random() * (70 - 30) + 30;
        let hurdle = {
            x: canvas.width + size,
            y: canvas.height - size,
            width: size,
            height: size,
            color: '#A00'
        };
        hurdles.push(hurdle);
    }

    function updateHurdles() {
        hurdles.forEach((hurdle, index) => {
            hurdle.x -= gameSpeed;
            ctx.fillStyle = hurdle.color;
            ctx.fillRect(hurdle.x, hurdle.y, hurdle.width, hurdle.height);
            ctx.strokeStyle = '#000';
            ctx.strokeRect(hurdle.x, hurdle.y, hurdle.width, hurdle.height);

            // Check for collision
            if (player.x < hurdle.x + hurdle.width &&
                player.x + player.width > hurdle.x &&
                player.y < hurdle.y + hurdle.height &&
                player.height + player.y > hurdle.y) {
                gameRunning = false; // Stop the game
                displayStartButton(); // Show start button again
            }

            // Remove hurdle if it's off screen
            if (hurdle.x + hurdle.width < 0) {
                hurdles.splice(index, 1);
            }
        });
    }

    function drawScore() {
        ctx.font = '20px Arial';
        ctx.fillStyle = '#000';
        ctx.fillText(`Score: ${score}`, canvas.width - 140, 30);
    }

    function gameLoop(timestamp) {
        if (!gameRunning) return;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawPlayer();
        updatePlayer();
        updateHurdles();
        drawScore();
        
        score++;
        
        if (timestamp - lastTime > interval) {
            createHurdle();
            lastTime = timestamp;
        }
        
        requestAnimationFrame(gameLoop);
    }

    function displayStartButton() {
        ctx.fillStyle = '#0A0';
        ctx.fillRect(canvas.width / 2 - 50, canvas.height / 2 - 25, 100, 50);
        ctx.fillStyle = '#FFF';
        ctx.font = '20px Arial';
        ctx.fillText('Start', canvas.width / 2 - 28, canvas.height / 2 + 10);
    }

    canvas.addEventListener('click', function(event) {
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        // Check if click is within start button bounds
        if (x >= canvas.width / 2 - 50 && x <= canvas.width / 2 + 50 &&
            y >= canvas.height / 2 - 25 && y <= canvas.height / 2 + 25) {
            if (!gameRunning) {
                score = 0;
                hurdles = [];
                lastTime = 0;
                gameRunning = true;
                requestAnimationFrame(gameLoop);
            }
        }
    });

    // Draw start button initially
    displayStartButton();

    function resetGame() {
        // Reset game state
        gameRunning = false;
        player.jumping = false;
        velocity = 0;
        score = 0;
        hurdles = [];
        gameSpeed = 3;
        lastTime = performance.now();
        // Display the start button
        displayStartButton();
    }
});
// Add a flag to control the game loop
let gameRunning = true;

function resetGame() {
    score = 0;
    player.y = canvas.height - 70;
    player.jumping = false;
    hurdles = [];
    gameSpeed = 3;
    lastTime = 0;
    gameRunning = true;
    requestAnimationFrame(gameLoop); // Restart the game loop
}

function updateHurdles() {
    for (let i = 0; i < hurdles.length; i++) {
        hurdles[i].x -= gameSpeed;
        ctx.fillStyle = hurdles[i].color;
        ctx.fillRect(hurdles[i].x, hurdles[i].y, hurdles[i].width, hurdles[i].height);
        ctx.strokeStyle = '#000'; // Black border
        ctx.strokeRect(hurdles[i].x, hurdles[i].y, hurdles[i].width, hurdles[i].height);

        if (player.x < hurdles[i].x + hurdles[i].width &&
            player.x + player.width > hurdles[i].x &&
            player.y < hurdles[i].y + hurdles[i].height &&
            player.height + player.y > hurdles[i].y) {
            // Collision detected, game over
            alert(`Game Over! Score: ${score}`);
            gameRunning = false; // Stop the game loop
            resetGame(); // Reset the game
            return; // Exit the function to stop further execution
        }

        if (hurdles[i].x + hurdles[i].width < 0) {
            hurdles.splice(i, 1);
        }
    }
}

function gameLoop(timestamp) {
    if (!gameRunning) return; // Stop the game loop if the game is not running

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawPlayer();
    updatePlayer();
    updateHurdles();
    drawScore();
    
    // Increment score
    score++;

    if (timestamp - lastTime > interval) {
        createHurdle();
        lastTime = timestamp;
    }

    requestAnimationFrame(gameLoop);
}
