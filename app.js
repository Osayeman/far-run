// =============================================================================
// FAR RUN - Endless Runner Mini-App for Farcaster & Base
// Clean, modular, production-ready implementation
// =============================================================================

// --- 1. CONFIGURATION ---
const CONTRACT_ADDRESS = "0x7eeb54adef1a77fecd8c51aba1eb6288215d90c9";
const SESSION_PRICE = "0.000002"; // Price in ETH to refill lives
const MAX_LIVES = 5;
const APP_ID = "far-run-prod";

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDoqP73GE3n3XBW2af4ISH3jzEUslVaqEw",
  authDomain: "far-run.firebaseapp.com",
  projectId: "far-run",
  storageBucket: "far-run.firebasestorage.app",
  messagingSenderId: "355231455654",
  appId: "1:355231455654:web:900c17feaedab170489767",
  measurementId: "G-M33XE7RF4R"
};

// Optional Firebase initialization with error resilience
let db = null;
let auth = null;
try {
  if (typeof firebase !== "undefined" && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    auth = firebase.auth();
  }
} catch (err) {
  console.warn("Firebase optional initialization warning:", err);
}

// --- 2. ASSETS & ROBUST IMAGE PRELOADER ---
const CHARACTERS = [
  {
    id: "player1",
    name: "Shady",
    src: "assets/player.png",
    fallback: "player.png",
    desc: "Put on your cloak and lock in, no warplet can do it like you"
  },
  {
    id: "player2",
    name: "Warplin",
    src: "assets/player2.png",
    fallback: "player2.png",
    desc: "The MAGIC happens at night, abwarpadabra!"
  },
  {
    id: "player3",
    name: "Astro",
    src: "assets/player3.png",
    fallback: "player3.png",
    desc: "If clanker had NASA, warplets would fly"
  },
  {
    id: "player4",
    name: "Nude",
    src: "assets/player4.png",
    fallback: "player4.png",
    desc: "Ever seen a naked clanker with all five senses?"
  }
];

function createSafeImage(primaryUrl, fallbackUrl) {
  const img = new Image();
  img.src = primaryUrl;
  img.onerror = () => {
    if (fallbackUrl && img.src !== fallbackUrl && !img.src.endsWith("/" + fallbackUrl)) {
      console.warn("Asset fallback triggered: " + primaryUrl + " -> " + fallbackUrl);
      img.src = fallbackUrl;
    }
  };
  return img;
}

const gameAssets = {
  characters: {},
  bone: createSafeImage("assets/bone.png", "bone.png"),
  sun: createSafeImage("assets/sun.png", "sun.png"),
  moon: createSafeImage("assets/moon.png", "moon.png")
};

CHARACTERS.forEach(char => {
  const img = createSafeImage(char.src, char.fallback);
  gameAssets.characters[char.src] = img;
  gameAssets.characters[char.fallback] = img;
});

// --- 3. GAME ENGINE ---
const EndlessRunner = (function () {
  let canvas = null;
  let ctx = null;
  let callbacks = {};

  const CANVAS_WIDTH = 300;
  const CANVAS_HEIGHT = 500;
  const GRAVITY = 0.5;
  const JUMP_STRENGTH = -13;
  const GROUND_HEIGHT = 50;

  let isRunning = false;
  let isGameOver = false;
  let gameSpeed = 3;
  let score = 0;
  let scoreMilestone = 200;
  let nightAlpha = 0;
  let spawnTimer = 0;
  let groundY = 0;
  let animFrameId = null;

  let player = null;
  let obstacles = [];
  let bones = [];
  let groundStones = [];
  let clouds = [];
  let stars = [];

  class Cloud {
    constructor() {
      this.reset(Math.random() * CANVAS_WIDTH);
    }
    reset(startX) {
      this.x = startX !== undefined ? startX : CANVAS_WIDTH + 50;
      this.y = Math.random() * 220;
      this.speed = Math.random() * 0.5 + 0.2;
      this.width = 60;
      this.height = 20;
    }
    update() {
      this.x -= this.speed;
      if (this.x + this.width < -50) {
        this.reset();
      }
    }
    draw() {
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.fillRect(this.x, this.y, this.width, this.height);
      ctx.fillRect(this.x + 10, this.y - 12, this.width - 20, this.height);
    }
  }

  class Stone {
    constructor() {
      this.x = CANVAS_WIDTH;
      this.y = CANVAS_HEIGHT - GROUND_HEIGHT + Math.random() * 10;
      this.size = Math.random() * 2 + 2;
    }
    update() {
      this.x -= gameSpeed;
    }
    draw() {
      ctx.fillStyle = "#888888";
      ctx.fillRect(this.x, this.y, this.size, this.size);
    }
  }

  class BoneItem {
    constructor() {
      this.x = CANVAS_WIDTH;
      this.y = CANVAS_HEIGHT - GROUND_HEIGHT + 15 + Math.random() * (GROUND_HEIGHT - 25);
    }
    update() {
      this.x -= gameSpeed;
    }
    draw() {
      const img = gameAssets.bone;
      if (img && img.complete && img.naturalWidth > 0) {
        const height = 20 * (img.naturalHeight / img.naturalWidth);
        ctx.drawImage(img, this.x, this.y, 20, height);
      } else {
        ctx.fillStyle = "#E0E0E0";
        ctx.fillRect(this.x, this.y, 16, 6);
        ctx.fillRect(this.x - 2, this.y - 2, 4, 10);
        ctx.fillRect(this.x + 14, this.y - 2, 4, 10);
      }
    }
  }

  class Obstacle {
    constructor(x, y, width, height) {
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;
    }
    update() {
      this.x -= gameSpeed;
    }
    draw() {
      ctx.save();
      if (nightAlpha > 0.5) {
        ctx.shadowBlur = 15;
        ctx.shadowColor = "#E040FB";
        ctx.fillStyle = "#E040FB";
        ctx.strokeStyle = "#00FFFF";
      } else {
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#2C3E50";
        ctx.strokeStyle = "#1A252F";
      }
      ctx.fillRect(this.x, this.y, this.width, this.height);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y + this.height);
      ctx.lineTo(this.x, this.y);
      ctx.lineTo(this.x + this.width, this.y);
      ctx.lineTo(this.x + this.width, this.y + this.height);
      ctx.stroke();
      ctx.restore();
    }
  }

  class PlayerEntity {
    constructor(x, y, width, height, image) {
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;
      this.image = image;
      this.velocityY = 0;
      this.isJumping = false;
    }
    jump() {
      if (!this.isJumping) {
        this.velocityY = JUMP_STRENGTH;
        this.isJumping = true;
      }
    }
    stopJump() {
      if (this.velocityY < -5) {
        this.velocityY = -5;
      }
    }
    update() {
      this.y += this.velocityY;
      if (this.y < groundY) {
        this.velocityY += GRAVITY;
      } else {
        this.velocityY = 0;
        this.isJumping = false;
        this.y = groundY;
      }
    }
    draw() {
      if (this.image && this.image.complete && this.image.naturalWidth > 0) {
        ctx.drawImage(this.image, Math.floor(this.x), Math.floor(this.y), this.width, this.height);
      } else {
        ctx.fillStyle = "#3498DB";
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(this.x + this.width - 10, this.y + 10, 6, 6);
        ctx.fillStyle = "#111111";
        ctx.fillRect(this.x + this.width - 7, this.y + 12, 3, 3);
      }
    }
  }

  function drawSky() {
    ctx.fillStyle = "#87CEEB";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const sun = gameAssets.sun;
    if (sun && sun.complete && sun.naturalWidth > 0) {
      ctx.drawImage(sun, 220, 20, 60, 60);
    } else {
      ctx.fillStyle = "#FFD700";
      ctx.beginPath();
      ctx.arc(250, 50, 25, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const cloud of clouds) {
      cloud.update();
      cloud.draw();
    }

    if (nightAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = nightAlpha;
      const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      gradient.addColorStop(0, "#4B0082");
      gradient.addColorStop(1, "#2C3E50");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.fillStyle = "#FFFFFF";
      for (const star of stars) {
        star.x -= star.speed;
        if (star.x < 0) {
          star.x = CANVAS_WIDTH;
          star.y = Math.random() * 400;
        }
        ctx.fillRect(star.x, star.y, 2, 2);
      }

      const moon = gameAssets.moon;
      if (moon && moon.complete && moon.naturalWidth > 0) {
        ctx.shadowBlur = 40;
        ctx.shadowColor = "rgba(255, 255, 255, 0.9)";
        ctx.drawImage(moon, 80, -30, 240, 240);
        ctx.shadowBlur = 0;
      } else {
        ctx.shadowBlur = 20;
        ctx.shadowColor = "#FFF";
        ctx.fillStyle = "#FFF9D2";
        ctx.beginPath();
        ctx.arc(200, 70, 30, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.restore();
    }
  }

  function drawGround() {
    ctx.fillStyle = "#3E2723";
    ctx.fillRect(0, CANVAS_HEIGHT - GROUND_HEIGHT + 10, CANVAS_WIDTH, GROUND_HEIGHT - 10);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, CANVAS_HEIGHT - GROUND_HEIGHT, CANVAS_WIDTH, 10);

    if (isRunning && Math.random() < 0.15) {
      groundStones.push(new Stone());
    }
    for (let i = groundStones.length - 1; i >= 0; i--) {
      groundStones[i].update();
      groundStones[i].draw();
      if (groundStones[i].x < -10) groundStones.splice(i, 1);
    }

    if (isRunning && Math.random() < 0.02) {
      bones.push(new BoneItem());
    }
    for (let i = bones.length - 1; i >= 0; i--) {
      bones[i].update();
      bones[i].draw();
      if (bones[i].x < -20) bones.splice(i, 1);
    }
  }

  function checkCollision(p, o) {
    return p.x < o.x + o.width &&
           p.x + p.width > o.x &&
           p.y < o.y + o.height &&
           p.y + p.height > o.y;
  }

  function spawnObstacle() {
    spawnTimer++;
    if (spawnTimer * gameSpeed > 350 && Math.random() < 0.5) {
      spawnTimer = 0;
      const height = Math.random() * (60 - 20) + 20;
      obstacles.push(new Obstacle(CANVAS_WIDTH, CANVAS_HEIGHT - height - GROUND_HEIGHT, 20, height));
    }
  }

  function gameLoop() {
    if (isGameOver) return;
    animFrameId = requestAnimationFrame(gameLoop);

    const currentScore = Math.floor(score);
    const targetAlpha = (Math.floor(currentScore / 150) % 2 === 0) ? 0 : 1;
    nightAlpha += (targetAlpha - nightAlpha) * 0.02;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    drawSky();
    drawGround();

    if (player) {
      player.update();
      player.draw();
    }

    for (let i = obstacles.length - 1; i >= 0; i--) {
      const obs = obstacles[i];
      obs.update();
      obs.draw();

      if (player && checkCollision(player, obs)) {
        handleGameOver();
        return;
      }
      if (obs.x + obs.width < 0) {
        obstacles.splice(i, 1);
      }
    }

    spawnObstacle();

    score += 0.1;
    if (callbacks.onScoreUpdate) {
      callbacks.onScoreUpdate(Math.floor(score), nightAlpha > 0.5);
    }

    if (currentScore >= scoreMilestone) {
      gameSpeed += 0.1;
      scoreMilestone += 200;
    }
  }

  function handleGameOver() {
    isGameOver = true;
    isRunning = false;
    if (animFrameId) cancelAnimationFrame(animFrameId);

    const finalScore = Math.floor(score);
    if (callbacks.onGameOver) {
      callbacks.onGameOver(finalScore);
    }
  }

  return {
    init: function (canvasElement, engineCallbacks) {
      canvas = canvasElement;
      ctx = canvas.getContext("2d");
      callbacks = engineCallbacks || {};

      const dpr = window.devicePixelRatio || 1;
      canvas.width = CANVAS_WIDTH * dpr;
      canvas.height = CANVAS_HEIGHT * dpr;
      canvas.style.width = CANVAS_WIDTH + "px";
      canvas.style.height = CANVAS_HEIGHT + "px";
      ctx.scale(dpr, dpr);
      ctx.imageSmoothingEnabled = false;

      stars = [];
      for (let i = 0; i < 80; i++) {
        stars.push({
          x: Math.random() * CANVAS_WIDTH,
          y: Math.random() * 400,
          speed: Math.random() * 0.5 + 0.1
        });
      }

      clouds = [];
      for (let i = 0; i < 5; i++) {
        clouds.push(new Cloud());
      }

      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      drawSky();
      drawGround();
    },

    start: function (characterSrc) {
      if (callbacks.onCheckLives && !callbacks.onCheckLives()) {
        return false;
      }

      if (animFrameId) cancelAnimationFrame(animFrameId);

      const charImg = gameAssets.characters[characterSrc] || gameAssets.characters["assets/player.png"] || gameAssets.characters["player.png"];
      const pH = 70;
      let pW = 35;
      if (charImg && charImg.complete && charImg.naturalHeight > 0) {
        pW = pH * (charImg.naturalWidth / charImg.naturalHeight);
      }

      groundY = CANVAS_HEIGHT - pH - GROUND_HEIGHT + 10;
      isGameOver = false;
      isRunning = true;
      gameSpeed = 3;
      score = 0;
      scoreMilestone = 200;
      nightAlpha = 0;
      spawnTimer = 0;
      obstacles = [];
      bones = [];
      groundStones = [];

      clouds = [];
      for (let i = 0; i < 5; i++) clouds.push(new Cloud());

      player = new PlayerEntity(50, groundY, pW, pH, charImg);
      gameLoop();
      return true;
    },

    jump: function () {
      if (isRunning && player) player.jump();
    },

    stopJump: function () {
      if (isRunning && player) player.stopJump();
    },

    stop: function () {
      isRunning = false;
      if (animFrameId) cancelAnimationFrame(animFrameId);
    }
  };
})();

// --- 4. REACT APPLICATION UI ---
function App() {
  const [user, setUser] = React.useState(null);
  const [username, setUsername] = React.useState("Runner");
  const [lives, setLives] = React.useState(MAX_LIVES);
  const [score, setScore] = React.useState(0);
  const [bestScore, setBestScore] = React.useState(0);
  const [nightMode, setNightMode] = React.useState(false);

  const [screen, setScreen] = React.useState("menu");
  const [selectedChar, setSelectedChar] = React.useState(CHARACTERS[0].src);

  const [showPaywall, setShowPaywall] = React.useState(false);
  const [showLeaderboard, setShowLeaderboard] = React.useState(false);
  const [leaderboardData, setLeaderboardData] = React.useState([]);
  const [payStatus, setPayStatus] = React.useState("");

  const canvasRef = React.useRef(null);

  React.useEffect(() => {
    // 1. Firebase Anonymous Auth
    if (auth && typeof auth.signInAnonymously === "function") {
      auth.signInAnonymously().catch(e => console.warn("Anon auth:", e));
      auth.onAuthStateChanged(u => setUser(u));
    }

    // 2. Farcaster Mini-App SDK
    const tryInitSdk = (sdk) => {
      if (sdk && sdk.actions && typeof sdk.actions.ready === "function") {
        try { sdk.actions.ready(); } catch (e) {}
        const fcUser = sdk.context && sdk.context.user;
        if (fcUser) {
          setUsername(fcUser.username || fcUser.displayName || "Runner");
        }
      }
    };

    if (window.farcaster && window.farcaster.sdk) {
      tryInitSdk(window.farcaster.sdk);
    } else if (window.miniapp && window.miniapp.sdk) {
      tryInitSdk(window.miniapp.sdk);
    }

    // 3. Lives from localStorage (Default 5)
    const storedLives = localStorage.getItem("far_run_lives");
    if (storedLives !== null) {
      setLives(parseInt(storedLives, 10));
    } else {
      setLives(MAX_LIVES);
      localStorage.setItem("far_run_lives", MAX_LIVES);
    }

    // 4. Best Score from localStorage
    const savedBest = localStorage.getItem("endlessRunnerBestScore");
    if (savedBest) {
      setBestScore(parseInt(savedBest, 10));
    }

    // 5. Initialize Canvas
    if (canvasRef.current) {
      EndlessRunner.init(canvasRef.current, {
        onScoreUpdate: (currentScore, isNight) => {
          setScore(currentScore);
          setNightMode(isNight);
        },
        onGameOver: (finalScore) => {
          setScreen("gameOver");
          const current = parseInt(localStorage.getItem("far_run_lives") || "0", 10);
          const nextLives = Math.max(0, current - 1);
          setLives(nextLives);
          localStorage.setItem("far_run_lives", nextLives);

          const currentBest = parseInt(localStorage.getItem("endlessRunnerBestScore") || "0", 10);
          if (finalScore > currentBest) {
            setBestScore(finalScore);
            localStorage.setItem("endlessRunnerBestScore", finalScore);
          }
        },
        onCheckLives: () => {
          const current = parseInt(localStorage.getItem("far_run_lives") || "0", 10);
          if (current > 0) return true;
          setShowPaywall(true);
          return false;
        }
      });
    }

    const handleKeyDown = (e) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        EndlessRunner.jump();
      }
    };
    const handleKeyUp = (e) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        EndlessRunner.stopJump();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      EndlessRunner.stop();
    };
  }, []);

  const handleStartGame = () => {
    const started = EndlessRunner.start(selectedChar);
    if (started) {
      setScreen("playing");
    }
  };

  const handleSaveScore = async () => {
    if (!user || !db) {
      alert("Score saved locally!");
      return;
    }
    try {
      await db.collection("artifacts").doc(APP_ID).collection("users").doc(user.uid).collection("scores").doc("best").set({
        score: score,
        username: username,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });

      await db.collection("artifacts").doc(APP_ID).collection("public").collection("data").doc("leaderboard").collection("scores").add({
        score: score,
        username: username,
        uid: user.uid,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });

      alert("Score saved to leaderboard!");
    } catch (e) {
      console.error("Firebase save error:", e);
      alert("Saved locally!");
    }
  };

  const handleFetchLeaderboard = async () => {
    setShowLeaderboard(true);
    if (!db) {
      setLeaderboardData([{ username: username, score: bestScore }]);
      return;
    }
    try {
      const q = db.collection("artifacts").doc(APP_ID).collection("public").collection("data").doc("leaderboard").collection("scores")
        .orderBy("score", "desc")
        .limit(37);
      const snap = await q.get();
      setLeaderboardData(snap.docs.map(d => d.data()));
    } catch (e) {
      console.warn("Leaderboard fetch error:", e);
    }
  };

  const handlePayment = async () => {
    if (!window.ethereum) {
      alert("No Web3 Wallet Found. Please open in a Web3-enabled browser or Warpcast.");
      return;
    }
    setPayStatus("Connecting wallet...");
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      setPayStatus("Sending transaction...");
      const tx = await signer.sendTransaction({
        to: CONTRACT_ADDRESS,
        value: ethers.parseEther(SESSION_PRICE)
      });
      setPayStatus("Confirming on Base...");
      await tx.wait();
      setLives(MAX_LIVES);
      localStorage.setItem("far_run_lives", MAX_LIVES);
      setShowPaywall(false);
      setPayStatus("");
      alert("Lives refilled! You have 5 lives.");
    } catch (e) {
      setPayStatus("Failed: " + (e.shortMessage || e.message));
    }
  };

  const activeCharObj = CHARACTERS.find(c => c.src === selectedChar) || CHARACTERS[0];

  return (
    <div id="gameContainer">
      <canvas
        ref={canvasRef}
        id="gameCanvas"
        onTouchStart={(e) => { e.preventDefault(); EndlessRunner.jump(); }}
        onTouchEnd={(e) => { e.preventDefault(); EndlessRunner.stopJump(); }}
        onMouseDown={() => EndlessRunner.jump()}
        onMouseUp={() => EndlessRunner.stopJump()}
      />

      <div id="scoreContainer" style={{ color: nightMode ? "#FFFFFF" : "#333333" }}>
        Score: <span id="score">{score}</span> | Best: <span id="best-score">{bestScore}</span>
      </div>

      {screen === "menu" && (
        <div id="mainMenu" className="menu-screen">
          <h1>RUNNER</h1>
          <div className="instructions">
            <p>Tap Screen or Press Space to Jump</p>
            <p style={{ fontSize: "12px", color: "#ccc" }}>(Avoid the obstacles!)</p>
          </div>

          <div style={{ color: "#FFD700", fontSize: "13px", marginBottom: "12px", fontFamily: "monospace" }}>
            Lives Remaining: <strong>{lives}</strong>
          </div>

          <button id="btnStartGame" onClick={handleStartGame}>
            START GAME
          </button>
          <button id="btnSelectChar" onClick={() => setScreen("charSelect")}>
            SELECT CHARACTER
          </button>
          <button
            onClick={handleFetchLeaderboard}
            style={{ background: "#444", fontSize: "12px", width: "160px", padding: "10px" }}
          >
            LEADERBOARD
          </button>
        </div>
      )}

      {screen === "charSelect" && (
        <div id="charSelectMenu" className="menu-screen">
          <h2>SELECT PLAYER</h2>
          <div className="char-grid">
            {CHARACTERS.map(char => (
              <div key={char.id} className="char-card" onClick={() => setSelectedChar(char.src)}>
                <img
                  src={char.src}
                  alt={char.name}
                  onError={(e) => {
                    if (!e.currentTarget.src.endsWith("/" + char.fallback)) {
                      e.currentTarget.src = char.fallback;
                    }
                  }}
                  className={"char-option " + (selectedChar === char.src ? "selected" : "")}
                />
                <div className="char-name">{char.name}</div>
              </div>
            ))}
          </div>

          <p id="charDescription">{activeCharObj.desc}</p>
          <button id="btnBackToMenu" onClick={() => setScreen("menu")}>
            CONFIRM
          </button>
        </div>
      )}

      {screen === "gameOver" && (
        <div id="game-over-screen">
          <h2>Game Over</h2>
          <p style={{ fontSize: "14px", margin: "5px 0 15px 0", color: "#555" }}>
            Score: <strong>{score}</strong> | Best: <strong>{bestScore}</strong>
          </p>
          <div style={{ fontSize: "12px", color: lives === 0 ? "#e74c3c" : "#27ae60", marginBottom: "10px" }}>
            Lives Left: {lives}
          </div>
          <button id="btnRestart" onClick={handleStartGame} style={{ background: "#27ae60" }}>
            PLAY AGAIN
          </button>
          <button id="btnSaveScore" onClick={handleSaveScore} style={{ background: "#f39c12" }}>
            SAVE SCORE
          </button>
          <button id="btnReturnMenu" onClick={() => setScreen("menu")} style={{ background: "#c0392b" }}>
            MAIN MENU
          </button>
        </div>
      )}

      {showPaywall && (
        <div className="menu-screen" style={{ zIndex: 100 }}>
          <h2 style={{ color: "#e74c3c" }}>0 LIVES</h2>
          <p style={{ color: "white", fontSize: "13px", textAlign: "center", marginBottom: "20px", lineHeight: "1.5" }}>
            You have run out of lives.<br />
            Pay <strong>{SESSION_PRICE} ETH</strong> on Base to refill 5 lives.
          </p>
          <button onClick={handlePayment} style={{ background: "#e74c3c" }}>
            {payStatus || "INSERT COIN (0.000002 ETH)"}
          </button>
          <button
            onClick={() => setShowPaywall(false)}
            style={{ background: "#333", fontSize: "12px", width: "120px", marginTop: "10px" }}
          >
            BACK
          </button>
        </div>
      )}

      {showLeaderboard && (
        <div id="leaderboard-modal">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
            <h2 style={{ fontSize: "18px", margin: 0 }}>TOP RUNNERS</h2>
            <button
              onClick={() => setShowLeaderboard(false)}
              style={{ width: "auto", padding: "4px 10px", background: "#c0392b", margin: 0 }}
            >
              ✕
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {leaderboardData.length === 0 ? (
              <p style={{ color: "#888", fontSize: "12px", textAlign: "center", paddingTop: "20px" }}>
                No scores recorded yet. Play a game and be the first!
              </p>
            ) : (
              leaderboardData.map((item, idx) => (
                <div key={idx} className={"lb-row " + (idx < 3 ? "gold" : "")}>
                  <span>#{idx + 1} {item.username || "Anonymous"}</span>
                  <span>{parseFloat(item.score || 0).toFixed(0)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --- 5. MOUNT ---
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
