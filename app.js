// --- CONFIGURATION ---
const CONTRACT_ADDRESS = "0x7eeb54adef1a77fecd8c51aba1eb6288215d90c9";
const SESSION_PRICE = "0.000002"; 
const MAX_LIVES = 5;

// REPLACE THIS WITH YOUR REAL FIREBASE KEYS
const firebaseConfig = {
  apiKey: "AIzaSyDoqP73GE3n3XBW2af4ISH3jzEUslVaqEw",
  authDomain: "far-run.firebaseapp.com",
  projectId: "far-run",
  storageBucket: "far-run.firebasestorage.app",
  messagingSenderId: "355231455654",
  appId: "1:355231455654:web:900c17feaedab170489767",
  measurementId: "G-M33XE7RF4R"
};

// --- INIT ---
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const appId = 'far-run-prod';

// --- REACT COMPONENT ---
function App() {
    const [user, setUser] = React.useState(null);
    const [username, setUsername] = React.useState("Runner");
    const [lives, setLives] = React.useState(0);
    const [showPaywall, setShowPaywall] = React.useState(false);
    const [showLeaderboard, setShowLeaderboard] = React.useState(false);
    const [leaderboardData, setLeaderboardData] = React.useState([]);
    const [payStatus, setPayStatus] = React.useState("");

    React.useEffect(() => {
        // 1. Auth
        auth.signInAnonymously();
        auth.onAuthStateChanged(u => setUser(u));

        // 2. Farcaster User Data
        if (window.miniapp && window.miniapp.sdk) {
            window.miniapp.sdk.actions.ready();
            const fcUser = window.miniapp.sdk.context?.user;
            if (fcUser) setUsername(fcUser.username || fcUser.displayName || "Runner");
        }

        // 3. Lives
        const storedLives = localStorage.getItem('far_run_lives');
        setLives(storedLives ? parseInt(storedLives) : 0);

        // 4. Init Game Engine (Vanilla JS)
        // We delay slightly to ensure the DOM elements (canvas, buttons) are rendered by React
        setTimeout(() => {
            EndlessRunner.init({
                onGameOver: handleGameOver,
                onCheckLives: checkLives,
                onSaveScore: saveScoreToFirebase
            });
        }, 100);
    }, []);

    // --- LOGIC HOOKS ---

    const checkLives = () => {
        const currentLives = parseInt(localStorage.getItem('far_run_lives') || '0');
        if (currentLives > 0) return true;
        setShowPaywall(true);
        return false;
    };

    const handleGameOver = () => {
        const current = parseInt(localStorage.getItem('far_run_lives') || '0');
        if (current > 0) {
            const newVal = current - 1;
            setLives(newVal);
            localStorage.setItem('far_run_lives', newVal);
        }
    };

    const saveScoreToFirebase = async (score) => {
        if (!user) return;
        try {
            // Personal Best
            await db.collection('artifacts').doc(appId).collection('users').doc(user.uid).collection('scores').doc('best').set({
                score: score, username: username, timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            // Public Leaderboard
            await db.collection('artifacts').doc(appId).collection('public').collection('data').doc('leaderboard').collection('scores').add({
                score: score, username: username, uid: user.uid, timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            alert("Score saved to leaderboard!");
        } catch(e) { console.error(e); }
    };

    const fetchLeaderboard = async () => {
        setShowLeaderboard(true);
        try {
            const q = db.collection('artifacts').doc(appId).collection('public').collection('data').doc('leaderboard').collection('scores')
                .orderBy('score', 'desc').limit(37);
            const snap = await q.get();
            setLeaderboardData(snap.docs.map(d => d.data()));
        } catch(e) { console.log(e); }
    };

    const handlePayment = async () => {
        if (!window.ethereum) return alert("No Wallet Found");
        setPayStatus("Processing...");
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const tx = await signer.sendTransaction({
                to: CONTRACT_ADDRESS,
                value: ethers.parseEther(SESSION_PRICE)
            });
            await tx.wait();
            setLives(MAX_LIVES);
            localStorage.setItem('far_run_lives', MAX_LIVES);
            setShowPaywall(false);
            setPayStatus("");
        } catch(e) { setPayStatus("Failed: " + e.message); }
    };

    // --- RENDER (Mirroring your original HTML) ---
    return (
        <div id="gameContainer">
            <canvas id="gameCanvas" width="300" height="500"></canvas>
            
            <div id="scoreContainer">
                Score: <span id="score">0</span>
                Best: <span id="best-score">0</span>
            </div>

            <div id="mainMenu" className="menu-screen">
                <h1>RUNNER</h1>
                
                <div className="instructions">
                    <p>Tap Screen or Press Space to Jump</p>
                    <p style={{fontSize: '12px', color: '#ccc'}}>(Avoid the obstacles!)</p>
                </div>

                <div style={{color: '#FFD700', fontSize:'12px', marginBottom:'10px'}}>
                    Lives Remaining: {lives}
                </div>

                <button id="btnStartGame">START GAME</button>
                <button id="btnSelectChar">SELECT CHARACTER</button>
                <button onClick={fetchLeaderboard} style={{background:'#444', fontSize:'12px', width:'150px', padding:'10px'}}>LEADERBOARD</button>
            </div>

            <div id="charSelectMenu" className="menu-screen hidden">
                <h2>SELECT PLAYER</h2>
                
                <div className="char-grid">
                    {/* Assuming assets/ folder. If root, remove 'assets/' */}
                    <div className="char-card">
                        <img src="assets/player.png" data-src="assets/player.png" className="char-option selected"/>
                        <div className="char-name">Shady</div>
                    </div>
                    <div className="char-card">
                        <img src="assets/player2.png" data-src="assets/player2.png" className="char-option"/>
                        <div className="char-name">Warplin</div>
                    </div>
                    <div className="char-card">
                        <img src="assets/player3.png" data-src="assets/player3.png" className="char-option"/>
                        <div className="char-name">Astro</div>
                    </div>
                    <div className="char-card">
                        <img src="assets/player4.png" data-src="assets/player4.png" className="char-option"/>
                        <div className="char-name">Nude</div>
                    </div>
                </div>

                <p id="charDescription">Put on your cloak and lock in, no warplet can do it like you</p>
                <button id="btnBackToMenu">CONFIRM</button>
            </div>

            <div id="game-over-screen" className="hidden">
                <h2>Game Over</h2>
                <p>Press 'Play Again' to restart</p>
                <button id="btnSaveScore" style={{background: '#f39c12'}}>SAVE SCORE</button>
                <button id="btnRestart">PLAY AGAIN</button>
                <button id="btnReturnMenu">MAIN MENU</button>
            </div>

            {/* PAYWALL OVERLAY (React Controlled) */}
            {showPaywall && (
                <div className="menu-screen" style={{zIndex: 100}}>
                    <h2 style={{color: '#e74c3c'}}>0 LIVES</h2>
                    <p style={{color:'white', fontSize:'12px', textAlign:'center', marginBottom:'20px'}}>
                        You have failed 5 times.<br/>Pay {SESSION_PRICE} ETH to continue.
                    </p>
                    <button onClick={handlePayment} style={{background:'#e74c3c'}}>
                        {payStatus || "INSERT COIN"}
                    </button>
                    <button onClick={() => setShowPaywall(false)} style={{background:'#333', fontSize:'12px'}}>BACK</button>
                </div>
            )}

            {/* LEADERBOARD OVERLAY (React Controlled) */}
            {showLeaderboard && (
                <div id="leaderboard-modal">
                    <div style={{display:'flex', justifyContent:'space-between'}}>
                        <h2 style={{fontSize:'20px'}}>LEADERBOARD</h2>
                        <button onClick={() => setShowLeaderboard(false)} style={{width:'auto', padding:'5px 10px', background:'red'}}>X</button>
                    </div>
                    <div style={{flex:1, overflowY:'auto'}}>
                        {leaderboardData.map((d, i) => (
                            <div key={i} className={`lb-row ${i<3?'gold':''}`}>
                                <span>#{i+1} {d.username}</span>
                                <span>{parseFloat(d.score).toFixed(0)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// --- GAME ENGINE (VANILLA JS ADAPTED) ---
var EndlessRunner = (function () {
    let canvas, ctx, scoreContainer, scoreDisplay, bestScoreDisplay, gameOverScreen, mainMenu, charSelectMenu, player;
    let _callbacks = {};
    const characterAssets = {}; 

    // UPDATE THESE PATHS IF ASSETS ARE IN ROOT OR SUBFOLDER
    const characterFiles = ['assets/player.png', 'assets/player2.png', 'assets/player3.png', 'assets/player4.png'];
    const characterInfo = {
        'assets/player.png': "Put on your cloak and lock in, no warplet can do it like you",
        'assets/player2.png': "The MAGIC happens at night, abwarpadabra!",
        'assets/player3.png': "If clanker had NASA, warplets would fly",
        'assets/player4.png': "Ever seen a naked clanker with all five senses?"
    };

    let sunImage, moonImage, boneImage; 
    let clouds = [], stars = [], bones = [], groundStones = []; 
    const gravity = 0.5, jumpStrength = -13, groundHeight = 50; 
    let groundY, nightAlpha = 0, selectedCharSource = 'assets/player.png'; 
    let obstacles = [], gameSpeed = 3, score = 0, scoreMilestone = 200; 
    let bestScore = localStorage.getItem('endlessRunnerBestScore') || 0;
    let gameOver = false, gameRunning = false, spawnTimer = 0;

    class Stone { constructor() { this.x = 300; this.y = 500 - groundHeight + Math.random() * 10; this.size = Math.random() * 2 + 2; } update() { this.x -= gameSpeed; } draw() { ctx.fillStyle = "#888888"; ctx.fillRect(this.x, this.y, this.size, this.size); } }
    class Bone { constructor() { this.x = 300; this.y = 500 - groundHeight + 15 + Math.random() * (groundHeight - 25); } update() { this.x -= gameSpeed; } draw() { if (boneImage.complete) { ctx.drawImage(boneImage, this.x, this.y, 20, 20 * (boneImage.naturalHeight/boneImage.naturalWidth)); } } }
    class Cloud { constructor() { this.x = Math.random() * 300; this.y = Math.random() * 250; this.speed = (Math.random() * 0.5 + 0.2); this.width = 60; this.height = 20; } update() { this.x -= this.speed; if (this.x + this.width < -50) { this.x = 350; this.y = Math.random() * 250; } } draw() { ctx.fillStyle = "#FFFFFF"; ctx.fillRect(this.x, this.y, this.width, this.height); ctx.fillRect(this.x + 10, this.y - 15, this.width - 20, this.height); } }
    class Player { constructor(x, y, width, height, image) { this.x = x; this.y = y; this.width = width; this.height = height; this.image = image; this.velocityY = 0; this.isJumping = false; } draw() { if (this.image && this.image.complete) { ctx.drawImage(this.image, Math.floor(this.x), Math.floor(this.y), this.width, this.height); } else { ctx.fillStyle = "#3498DB"; ctx.fillRect(this.x, this.y, this.width, this.height); } } jump() { if (!this.isJumping) { this.velocityY = jumpStrength; this.isJumping = true; } } stopJump() { if (this.velocityY < -5) { this.velocityY = -5; } } update() { this.y += this.velocityY; if (this.y < groundY) { this.velocityY += gravity; } else { this.velocityY = 0; this.isJumping = false; this.y = groundY; } } }
    class Obstacle { constructor(x, y, width, height) { this.x = x; this.y = y; this.width = width; this.height = height; } draw() { ctx.save(); if (nightAlpha > 0.5) { ctx.shadowBlur = 20; ctx.shadowColor = "#E040FB"; ctx.fillStyle = "#E040FB"; ctx.strokeStyle = "#00FFFF"; } else { ctx.shadowBlur = 0; ctx.fillStyle = "#333333"; ctx.strokeStyle = "#000000"; } ctx.fillRect(this.x, this.y, this.width, this.height); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(this.x, this.y + this.height); ctx.lineTo(this.x, this.y); ctx.lineTo(this.x + this.width, this.y); ctx.lineTo(this.x + this.width, this.y + this.height); ctx.stroke(); ctx.restore(); } update() { this.x -= gameSpeed; } }

    function drawStars() { ctx.fillStyle = "#FFFFFF"; for (const star of stars) { star.x -= star.speed; if (star.x < 0) { star.x = 300; star.y = Math.random() * 400; } ctx.fillRect(star.x, star.y, 2, 2); } }
    function drawGround() { ctx.fillStyle = "#3E2723"; ctx.fillRect(0, 500 - groundHeight + 10, 300, groundHeight - 10); ctx.fillStyle = "#000000"; ctx.fillRect(0, 500 - groundHeight, 300, 10); if (gameRunning && Math.random() < 0.15) groundStones.push(new Stone()); for (let i = groundStones.length - 1; i >= 0; i--) { groundStones[i].update(); groundStones[i].draw(); if (groundStones[i].x < -10) groundStones.splice(i, 1); } if (gameRunning && Math.random() < 0.02) bones.push(new Bone()); for (let i = bones.length - 1; i >= 0; i--) { bones[i].update(); bones[i].draw(); if (bones[i].x < -20) bones.splice(i, 1); } }
    function drawSky() { ctx.fillStyle = "#87CEEB"; ctx.fillRect(0, 0, 300, 500); if (sunImage.complete) ctx.drawImage(sunImage, 220, 20, 60, 60); for (let cloud of clouds) { cloud.update(); cloud.draw(); } if (nightAlpha > 0) { ctx.save(); ctx.globalAlpha = nightAlpha; let gradient = ctx.createLinearGradient(0, 0, 0, 500); gradient.addColorStop(0, "#4B0082"); gradient.addColorStop(1, "#2C3E50"); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 300, 500); drawStars(); if (moonImage.complete) { ctx.shadowBlur = 50; ctx.shadowColor = "rgba(255, 255, 255, 0.9)"; ctx.drawImage(moonImage, 80, -30, 240, 240); ctx.shadowBlur = 0; } ctx.restore(); } }

    const game = {
        loop: function () {
            if (gameOver) return;
            requestAnimationFrame(game.loop);
            let currentScore = Math.floor(score);
            let targetAlpha = (Math.floor(currentScore / 150) % 2 === 0) ? 0 : 1;
            nightAlpha += (targetAlpha - nightAlpha) * 0.02;
            ctx.clearRect(0, 0, canvas.width, canvas.height); drawSky(); drawGround();
            scoreContainer.style.color = nightAlpha > 0.5 ? "#FFFFFF" : "#333333";
            if (player) { player.update(); player.draw(); }
            for (let i = obstacles.length - 1; i >= 0; i--) { let obs = obstacles[i]; obs.update(); obs.draw(); if (player && game.checkCollision(player, obs)) { game.over(); return; } if (obs.x + obs.width < 0) obstacles.splice(i, 1); }
            game.spawnObstacle(); score += 0.1; scoreDisplay.textContent = Math.floor(score);
            if (currentScore >= scoreMilestone) { gameSpeed += 0.1; scoreMilestone += 200; }
        },
        run: function () {
            // Check React State for Lives
            if (_callbacks.onCheckLives && !_callbacks.onCheckLives()) return;

            mainMenu.classList.add('hidden'); gameOverScreen.classList.add('hidden');
            let runPlayerImage = characterAssets[selectedCharSource];
            let pH = 70, pW = 35; if (runPlayerImage && runPlayerImage.complete) pW = pH * (runPlayerImage.naturalWidth / runPlayerImage.naturalHeight);
            groundY = 500 - pH - groundHeight + 10; gameOver = false; gameRunning = true; gameSpeed = 3; score = 0; scoreMilestone = 200; nightAlpha = 0;
            obstacles = []; bones = []; groundStones = []; clouds = []; for(let i=0; i<5; i++) clouds.push(new Cloud());
            player = new Player(50, groundY, pW, pH, runPlayerImage); game.loop();
        },
        over: function () {
            gameOver = true; gameRunning = false; gameOverScreen.classList.remove('hidden');
            let finalScore = Math.floor(score);
            if (finalScore > bestScore) { bestScore = finalScore; bestScoreDisplay.textContent = bestScore; localStorage.setItem('endlessRunnerBestScore', bestScore); }
            // Trigger Life Deduction
            if (_callbacks.onGameOver) _callbacks.onGameOver();
        },
        spawnObstacle: function () { spawnTimer++; if (spawnTimer * gameSpeed > 350 && Math.random() < 0.5) { spawnTimer = 0; const height = Math.random() * (60 - 20) + 20; obstacles.push(new Obstacle(300, 500 - height - groundHeight, 20, height)); } },
        checkCollision: function (p, o) { return (p.x < o.x + o.width && p.x + p.width > o.x && p.y < o.y + o.height && p.y + p.height > o.y); }
    };

    function handleInput(e) {
        if (e.type === 'keydown' && gameRunning && (e.code === 'Space' || e.code === 'ArrowUp')) player && player.jump();
        if (e.type === 'keyup' && gameRunning && (e.code === 'Space' || e.code === 'ArrowUp')) player && player.stopJump();
    }

    function setup(callbacks) {
        _callbacks = callbacks || {};
        // Elements are now rendered by React, so we just grab them
        canvas = document.getElementById('gameCanvas'); ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1; canvas.width = 300 * dpr; canvas.height = 500 * dpr; canvas.style.width = "300px"; canvas.style.height = "500px"; ctx.scale(dpr, dpr); ctx.imageSmoothingEnabled = false;
        scoreContainer = document.getElementById('scoreContainer'); scoreDisplay = document.getElementById('score'); bestScoreDisplay = document.getElementById('best-score');
        gameOverScreen = document.getElementById('game-over-screen'); mainMenu = document.getElementById('mainMenu'); charSelectMenu = document.getElementById('charSelectMenu');
        bestScoreDisplay.textContent = bestScore;

        // Event Listeners (Hooking up DOM elements to Game Logic)
        document.getElementById('btnStartGame').onclick = game.run;
        document.getElementById('btnSelectChar').onclick = () => { mainMenu.classList.add('hidden'); charSelectMenu.classList.remove('hidden'); };
        document.getElementById('btnBackToMenu').onclick = () => { charSelectMenu.classList.add('hidden'); mainMenu.classList.remove('hidden'); };
        document.getElementById('btnRestart').onclick = game.run;
        document.getElementById('btnReturnMenu').onclick = () => { gameOverScreen.classList.add('hidden'); mainMenu.classList.remove('hidden'); };
        const btnSave = document.getElementById('btnSaveScore'); if(btnSave) btnSave.onclick = () => { if(_callbacks.onSaveScore) _callbacks.onSaveScore(Math.floor(score)); };

        const charOptions = document.querySelectorAll('.char-option');
        charOptions.forEach(img => {
            img.onclick = function() {
                charOptions.forEach(o => o.classList.remove('selected')); this.classList.add('selected');
                selectedCharSource = this.getAttribute('data-src');
                document.getElementById('charDescription').textContent = characterInfo[selectedCharSource];
            }
        });

        window.addEventListener('keydown', handleInput); window.addEventListener('keyup', handleInput);
        canvas.addEventListener('touchstart', (e) => { e.preventDefault(); if (gameRunning && player) player.jump(); }, {passive:false});
        canvas.addEventListener('touchend', (e) => { e.preventDefault(); if (gameRunning && player) player.stopJump(); }, {passive:false});
        canvas.addEventListener('mousedown', () => { if (gameRunning && player) player.jump(); });
        canvas.addEventListener('mouseup', () => { if (gameRunning && player) player.stopJump(); });

        characterFiles.forEach(f => { const img = new Image(); img.src = f; characterAssets[f] = img; });
        boneImage = new Image(); boneImage.src = 'assets/bone.png';
        sunImage = new Image(); sunImage.src = 'assets/sun.png';
        moonImage = new Image(); moonImage.src = 'assets/moon.png';
        for(let i=0; i<100; i++) stars.push({x:Math.random()*300, y:Math.random()*400, speed:Math.random()*0.5+0.1});
        for(let i=0; i<5; i++) clouds.push(new Cloud());
    }

    return { init: setup };
})();

// Mount
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
