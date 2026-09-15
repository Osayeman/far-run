/* =============================================================================
   FAR RUN - Main Application (Farcaster Mini-App / Endless Runner)
   ============================================================================= */

// --- 1. CONFIGURATION & CONSTANTS ---
const CONTRACT_ADDRESS = "0x7eeb54adef1a77fecd8c51aba1eb6288215d90c9";
const SESSION_PRICE = "0.000002"; // ETH on Base
const BASE_CHAIN_ID_HEX = "0x2105"; // 8453
const MAX_LIVES = 5;

const CHARACTERS = [
  {
    id: "player1",
    name: "Shady",
    file: "player.png",
    desc: "Put on your cloak and lock in, no warplet can do it like you"
  },
  {
    id: "player2",
    name: "Warplin",
    file: "player2.png",
    desc: "The MAGIC happens at night, abwarpadabra!"
  },
  {
    id: "player3",
    name: "Astro",
    file: "player3.png",
    desc: "If clanker had NASA, warplets would fly"
  },
  {
    id: "player4",
    name: "Nude",
    file: "player4.png",
    desc: "Ever seen a naked clanker with all five senses?"
  }
];

// --- 2. RESILIENT ASSET PRELOADER ---
function preloadImage(filename) {
  const img = new Image();
  const candidates = [
    "assets/" + filename,
    filename,
    "/" + filename,
    "/assets/" + filename
  ];
  let idx = 0;

  img.onerror = () => {
    idx++;
    if (idx < candidates.length) {
      img.src = candidates[idx];
    }
  };

  img.src = candidates[0];
  return img;
}

const gameAssets = {
  characters: {
    player1: preloadImage("player.png"),
    player2: preloadImage("player2.png"),
    player3: preloadImage("player3.png"),
    player4: preloadImage("player4.png")
  },
  bone: preloadImage("bone.png"),
  sun: preloadImage("sun.png"),
  moon: preloadImage("moon.png")
};

// --- 3. UNIVERSAL WEB3 PROVIDER RESOLVER ---
async function getEthereumProvider() {
  // 1. Farcaster Frame SDK (@farcaster/frame-sdk)
  if (window.frame && window.frame.sdk && window.frame.sdk.wallet) {
    try {
      if (typeof window.frame.sdk.wallet.getEthereumProvider === "function") {
        const p = await window.frame.sdk.wallet.getEthereumProvider();
        if (p) return p;
      }
      if (window.frame.sdk.wallet.ethProvider) {
        return window.frame.sdk.wallet.ethProvider;
      }
    } catch (e) {
      console.warn("frame.sdk wallet notice:", e);
    }
  }

  // 2. Farcaster MiniApp SDK (@farcaster/miniapp-sdk)
  if (window.miniapp && window.miniapp.sdk && window.miniapp.sdk.wallet) {
    try {
      if (typeof window.miniapp.sdk.wallet.getEthereumProvider === "function") {
        const p = await window.miniapp.sdk.wallet.getEthereumProvider();
        if (p) return p;
      }
      if (window.miniapp.sdk.wallet.ethProvider) {
        return window.miniapp.sdk.wallet.ethProvider;
      }
    } catch (e) {
      console.warn("miniapp.sdk wallet notice:", e);
    }
  }

  // 3. Legacy / alternate window.farcaster namespace
  if (window.farcaster && window.farcaster.sdk && window.farcaster.sdk.wallet) {
    try {
      if (typeof window.farcaster.sdk.wallet.getEthereumProvider === "function") {
        const p = await window.farcaster.sdk.wallet.getEthereumProvider();
        if (p) return p;
      }
      if (window.farcaster.sdk.wallet.ethProvider) {
        return window.farcaster.sdk.wallet.ethProvider;
      }
    } catch (e) {}
  }

  // 4. Injected window.ethereum (Coinbase, MetaMask, Rainbow, Brave, etc.)
  if (typeof window !== "undefined" && window.ethereum) {
    return window.ethereum;
  }

  return null;
}

// --- 4. GAME ENGINE (EndlessRunner) ---
const EndlessRunner = (function () {
  let canvas, ctx;
  const CANVAS_WIDTH = 300;
  const CANVAS_HEIGHT = 500;
  const GROUND_HEIGHT = 50;

  let animationFrameId = null;
  let isRunning = false;
  let groundY = 0;

  let player = null;
  let obstacles = [];
  let clouds = [];
  let stars = [];

  let gameSpeed = 4;
  let score = 0;
  let distance = 0;
  let isNight = false;
  let timeOfDay = 0;

  let onScoreUpdateCb = null;
  let onGameOverCb = null;
  let onCheckLivesCb = null;

  class PlayerEntity {
    constructor(x, y, width, height, image) {
      this.x = x;
      this.y = y;
      this.baseY = y;
      this.width = width;
      this.height = height;
      this.image = image;

      this.vy = 0;
      this.gravity = 0.65;
      this.jumpPower = -12.5;
      this.isJumping = false;
    }

    jump() {
      if (!this.isJumping) {
        this.vy = this.jumpPower;
        this.isJumping = true;
      }
    }

    stopJump() {
      if (this.vy < -4) {
        this.vy = -4;
      }
    }

    update() {
      this.y += this.vy;
      this.vy += this.gravity;

      if (this.y >= this.baseY) {
        this.y = this.baseY;
        this.vy = 0;
        this.isJumping = false;
      }
    }

    draw() {
      const renderHeight = this.height;
      let renderWidth = this.width;

      if (this.image && this.image.complete && this.image.naturalHeight > 0) {
        const aspect = this.image.naturalWidth / this.image.naturalHeight;
        renderWidth = Math.round(renderHeight * aspect);
        ctx.drawImage(this.image, Math.floor(this.x), Math.floor(this.y), renderWidth, renderHeight);
      } else {
        // Fallback crisp runner block with face detail
        ctx.fillStyle = "#3498DB";
        ctx.fillRect(Math.floor(this.x), Math.floor(this.y), renderWidth, renderHeight);
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(Math.floor(this.x + renderWidth - 14), Math.floor(this.y + 12), 8, 8);
        ctx.fillStyle = "#111111";
        ctx.fillRect(Math.floor(this.x + renderWidth - 10), Math.floor(this.y + 14), 4, 4);
      }
    }

    getHitbox() {
      return {
        x: this.x + 8,
        y: this.y + 8,
        width: this.width - 16,
        height: this.height - 10
      };
    }
  }

  class ObstacleEntity {
    constructor(x, y, width, height, image) {
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;
      this.image = image;
      this.passed = false;
    }

    update(speed) {
      this.x -= speed;
    }

    draw() {
      if (this.image && this.image.complete && this.image.naturalHeight > 0) {
        ctx.drawImage(this.image, Math.floor(this.x), Math.floor(this.y), this.width, this.height);
      } else {
        // Bone fallback graphic
        ctx.fillStyle = "#ECF0F1";
        ctx.beginPath();
        ctx.roundRect(this.x, this.y + 8, this.width, 10, 4);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(this.x + 3, this.y + 5, 6, 0, Math.PI * 2);
        ctx.arc(this.x + 3, this.y + 21, 6, 0, Math.PI * 2);
        ctx.arc(this.x + this.width - 3, this.y + 5, 6, 0, Math.PI * 2);
        ctx.arc(this.x + this.width - 3, this.y + 21, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    getHitbox() {
      return {
        x: this.x + 4,
        y: this.y + 4,
        width: this.width - 8,
        height: this.height - 6
      };
    }
  }

  function checkCollision(a, b) {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  }

  function initClouds() {
    clouds = [];
    for (let i = 0; i < 4; i++) {
      clouds.push({
        x: Math.random() * CANVAS_WIDTH,
        y: 20 + Math.random() * 120,
        speed: 0.3 + Math.random() * 0.5,
        radius: 12 + Math.random() * 10
      });
    }
  }

  function initStars() {
    stars = [];
    for (let i = 0; i < 35; i++) {
      stars.push({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * (CANVAS_HEIGHT - 120),
        size: Math.random() * 2 + 1,
        alpha: Math.random() * 0.8 + 0.2
      });
    }
  }

  function spawnObstacle() {
    const obH = 34;
    const obW = 34;
    const obY = CANVAS_HEIGHT - obH - GROUND_HEIGHT + 6;
    obstacles.push(new ObstacleEntity(CANVAS_WIDTH + 20, obY, obW, obH, gameAssets.bone));
  }

  function update() {
    if (!isRunning) return;

    // Day / Night cycle
    timeOfDay += 0.0015;
    isNight = Math.sin(timeOfDay) < 0;

    // Clouds
    clouds.forEach(c => {
      c.x -= c.speed;
      if (c.x < -40) {
        c.x = CANVAS_WIDTH + 30;
        c.y = 20 + Math.random() * 120;
      }
    });

    // Player
    player.update();

    // Distance & score
    distance += gameSpeed;
    if (distance % 5 === 0) {
      score += 1;
      if (onScoreUpdateCb) onScoreUpdateCb(score);
    }

    // Difficulty scaling
    if (score > 0 && score % 100 === 0) {
      gameSpeed = Math.min(10, 4 + Math.floor(score / 100) * 0.5);
    }

    // Spawning obstacles
    const minDistance = 160;
    const lastOb = obstacles[obstacles.length - 1];
    if (!lastOb || (CANVAS_WIDTH - lastOb.x > minDistance && Math.random() < 0.025)) {
      spawnObstacle();
    }

    // Update obstacles & check collisions
    const playerHitbox = player.getHitbox();
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const ob = obstacles[i];
      ob.update(gameSpeed);

      if (checkCollision(playerHitbox, ob.getHitbox())) {
        gameOver();
        return;
      }

      if (ob.x + ob.width < -10) {
        obstacles.splice(i, 1);
      }
    }
  }

  function draw() {
    // Sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    if (isNight) {
      skyGrad.addColorStop(0, "#0B0C10");
      skyGrad.addColorStop(1, "#1F2833");
    } else {
      skyGrad.addColorStop(0, "#4DA0B0");
      skyGrad.addColorStop(1, "#D39D38");
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Stars at night
    if (isNight) {
      ctx.fillStyle = "#FFFFFF";
      stars.forEach(s => {
        ctx.globalAlpha = s.alpha;
        ctx.fillRect(s.x, s.y, s.size, s.size);
      });
      ctx.globalAlpha = 1.0;
    }

    // Sun or Moon
    const celestialY = 40 + Math.abs(Math.cos(timeOfDay)) * 60;
    const celestialImg = isNight ? gameAssets.moon : gameAssets.sun;
    if (celestialImg && celestialImg.complete && celestialImg.naturalHeight > 0) {
      ctx.drawImage(celestialImg, CANVAS_WIDTH - 65, celestialY, 44, 44);
    } else {
      ctx.fillStyle = isNight ? "#F1C40F" : "#FFA500";
      ctx.beginPath();
      ctx.arc(CANVAS_WIDTH - 42, celestialY + 22, 18, 0, Math.PI * 2);
      ctx.fill();
    }

    // Clouds
    ctx.fillStyle = isNight ? "rgba(255, 255, 255, 0.15)" : "rgba(255, 255, 255, 0.65)";
    clouds.forEach(c => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
      ctx.arc(c.x + c.radius * 0.7, c.y - c.radius * 0.2, c.radius * 0.7, 0, Math.PI * 2);
      ctx.arc(c.x + c.radius * 1.3, c.y, c.radius * 0.6, 0, Math.PI * 2);
      ctx.fill();
    });

    // Ground
    ctx.fillStyle = isNight ? "#2C3E50" : "#27AE60";
    ctx.fillRect(0, CANVAS_HEIGHT - GROUND_HEIGHT, CANVAS_WIDTH, GROUND_HEIGHT);
    // Ground stripe
    ctx.fillStyle = isNight ? "#1A252F" : "#2ECC71";
    ctx.fillRect(0, CANVAS_HEIGHT - GROUND_HEIGHT, CANVAS_WIDTH, 4);

    // Entities
    obstacles.forEach(ob => ob.draw());
    if (player) player.draw();
  }

  function loop() {
    if (!isRunning) return;
    update();
    draw();
    animationFrameId = requestAnimationFrame(loop);
  }

  function gameOver() {
    isRunning = false;
    cancelAnimationFrame(animationFrameId);
    if (onGameOverCb) onGameOverCb(score);
  }

  return {
    init: function (canvasElement, callbacks) {
      canvas = canvasElement;
      ctx = canvas.getContext("2d");
      canvas.width = CANVAS_WIDTH;
      canvas.height = CANVAS_HEIGHT;

      onScoreUpdateCb = callbacks.onScoreUpdate;
      onGameOverCb = callbacks.onGameOver;
      onCheckLivesCb = callbacks.onCheckLives;

      groundY = CANVAS_HEIGHT - 65 - GROUND_HEIGHT + 10;
      initClouds();
      initStars();

      // Initial clean draw
      draw();
    },

    start: function (characterId) {
      if (onCheckLivesCb && !onCheckLivesCb()) {
        return false;
      }

      const selectedId = characterId || "player1";
      const charImg = gameAssets.characters[selectedId] || gameAssets.characters.player1;

      const pH = 66;
      let pW = 54;
      if (charImg && charImg.complete && charImg.naturalHeight > 0) {
        pW = Math.round(pH * (charImg.naturalWidth / charImg.naturalHeight));
      }

      groundY = CANVAS_HEIGHT - pH - GROUND_HEIGHT + 8;
      player = new PlayerEntity(45, groundY, pW, pH, charImg);

      obstacles = [];
      score = 0;
      distance = 0;
      gameSpeed = 4;
      timeOfDay = 0;
      isNight = false;
      isRunning = true;

      if (onScoreUpdateCb) onScoreUpdateCb(0);

      cancelAnimationFrame(animationFrameId);
      loop();
      return true;
    },

    jump: function () {
      if (player && isRunning) player.jump();
    },

    stopJump: function () {
      if (player && isRunning) player.stopJump();
    },

    stop: function () {
      isRunning = false;
      cancelAnimationFrame(animationFrameId);
    }
  };
})();

// --- 5. REACT USER INTERFACE ---
function App() {
  const [gameState, setGameState] = React.useState("MENU"); // MENU, PLAYING, GAMEOVER, CHAR_SELECT
  const [selectedCharId, setSelectedCharId] = React.useState("player1");
  const [currentScore, setCurrentScore] = React.useState(0);
  const [highScore, setHighScore] = React.useState(0);
  const [lives, setLives] = React.useState(MAX_LIVES);
  const [showPaywall, setShowPaywall] = React.useState(false);
  const [payStatus, setPayStatus] = React.useState("");
  const [isPaying, setIsPaying] = React.useState(false);
  const [showLeaderboard, setShowLeaderboard] = React.useState(false);
  const [leaderboardData, setLeaderboardData] = React.useState([]);
  const [userProfile, setUserProfile] = React.useState({ username: "Runner", fid: null });

  const canvasRef = React.useRef(null);

  // Initialize Farcaster SDK and lives on mount
  React.useEffect(() => {
    // 1. Tell Farcaster client the mini-app is ready
    try {
      if (window.frame && window.frame.sdk && window.frame.sdk.actions && window.frame.sdk.actions.ready) {
        window.frame.sdk.actions.ready();
      }
    } catch (e) {}

    try {
      if (window.miniapp && window.miniapp.sdk && window.miniapp.sdk.actions && window.miniapp.sdk.actions.ready) {
        window.miniapp.sdk.actions.ready();
      }
    } catch (e) {}

    // Extract user profile if available in Farcaster context
    try {
      const fcContext = (window.frame && window.frame.sdk && window.frame.sdk.context) ||
                        (window.miniapp && window.miniapp.sdk && window.miniapp.sdk.context);
      if (fcContext && fcContext.user) {
        setUserProfile({
          username: fcContext.user.username || fcContext.user.displayName || "Runner",
          fid: fcContext.user.fid || null
        });
      }
    } catch (e) {}

    // 2. Load cached high score & lives
    const savedHighScore = localStorage.getItem("far_run_high_score");
    if (savedHighScore) setHighScore(parseInt(savedHighScore, 10));

    const savedLives = localStorage.getItem("far_run_lives");
    if (savedLives !== null) {
      setLives(parseInt(savedLives, 10));
    } else {
      localStorage.setItem("far_run_lives", MAX_LIVES);
      setLives(MAX_LIVES);
    }

    // 3. Initialize game engine
    if (canvasRef.current) {
      EndlessRunner.init(canvasRef.current, {
        onScoreUpdate: (s) => setCurrentScore(s),
        onGameOver: (finalScore) => handleGameOver(finalScore),
        onCheckLives: () => {
          const currentLives = parseInt(localStorage.getItem("far_run_lives") || "0", 10);
          if (currentLives <= 0) {
            setShowPaywall(true);
            return false;
          }
          return true;
        }
      });
    }

    // 4. Keyboard controls
    const handleKeyDown = (e) => {
      if (e.code === "Space" || e.code === "ArrowUp" || e.key === "w" || e.key === "W") {
        e.preventDefault();
        EndlessRunner.jump();
      }
    };
    const handleKeyUp = (e) => {
      if (e.code === "Space" || e.code === "ArrowUp" || e.key === "w" || e.key === "W") {
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

  const handleGameOver = (finalScore) => {
    setGameState("GAMEOVER");

    // Deduct one life
    setLives((prev) => {
      const next = Math.max(0, prev - 1);
      localStorage.setItem("far_run_lives", next);
      if (next === 0) {
        setShowPaywall(true);
      }
      return next;
    });

    // Update high score
    setHighScore((prev) => {
      if (finalScore > prev) {
        localStorage.setItem("far_run_high_score", finalScore);
        saveScoreToCloud(finalScore);
        return finalScore;
      }
      return prev;
    });
  };

  const saveScoreToCloud = (scoreVal) => {
    try {
      if (window.firebase && firebase.firestore) {
        const db = firebase.firestore();
        db.collection("leaderboard").add({
          username: userProfile.username,
          fid: userProfile.fid,
          score: scoreVal,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(err => console.warn("Firestore write notice:", err));
      }
    } catch (e) {}
  };

  const fetchLeaderboard = async () => {
    setShowLeaderboard(true);
    try {
      if (window.firebase && firebase.firestore) {
        const db = firebase.firestore();
        const snap = await db.collection("leaderboard").orderBy("score", "desc").limit(10).get();
        const list = [];
        snap.forEach(doc => list.push(doc.data()));
        setLeaderboardData(list);
      }
    } catch (e) {
      console.warn("Firestore read notice:", e);
    }
  };

  // --- REVOLUTIONIZED WEB3 WALLET CALL ---
  const handlePayment = async () => {
    if (isPaying) return;
    setIsPaying(true);
    setPayStatus("Locating wallet provider...");

    try {
      const rawProvider = await getEthereumProvider();

      if (!rawProvider) {
        alert("No Ethereum wallet found. If you are using Warpcast, please ensure the mini-app has opened your connected wallet. If on desktop/browser, please install MetaMask, Coinbase Wallet, or Rainbow.");
        setPayStatus("");
        setIsPaying(false);
        return;
      }

      setPayStatus("Requesting wallet connection...");

      // 1. Request account access
      let accounts = [];
      try {
        if (typeof rawProvider.request === "function") {
          accounts = await rawProvider.request({ method: "eth_requestAccounts" });
        }
      } catch (accErr) {
        console.warn("eth_requestAccounts notice:", accErr);
      }

      const userAddr = (accounts && accounts.length > 0) ? accounts[0] : undefined;

      // 2. Switch chain to Base (Chain ID 8453 / 0x2105)
      setPayStatus("Switching to Base network...");
      try {
        if (typeof rawProvider.request === "function") {
          await rawProvider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: BASE_CHAIN_ID_HEX }]
          });
        }
      } catch (chainErr) {
        console.warn("Base chain switch notice:", chainErr);
      }

      // Compute value in wei hex (0.000002 ETH = 2000000000000 wei = 0x1d1a94a2000)
      let valueHex = "0x1d1a94a2000";
      let valueBigInt = BigInt("2000000000000");

      if (typeof ethers !== "undefined" && ethers.parseEther) {
        try {
          valueBigInt = ethers.parseEther(SESSION_PRICE);
          valueHex = "0x" + BigInt(valueBigInt.toString()).toString(16);
        } catch (e) {}
      }

      setPayStatus("Please approve transaction in your wallet...");

      let txHash = null;

      // Approach 1: Try ethers BrowserProvider (standard EVM signer)
      let ethersSucceeded = false;
      if (typeof ethers !== "undefined" && ethers.BrowserProvider) {
        try {
          const browserProvider = new ethers.BrowserProvider(rawProvider);
          const signer = await browserProvider.getSigner();
          const txResponse = await signer.sendTransaction({
            to: CONTRACT_ADDRESS,
            value: valueBigInt
          });
          txHash = txResponse.hash;
          ethersSucceeded = true;
          setPayStatus("Transaction submitted! Waiting for confirmation...");
          if (txResponse.wait) {
            await txResponse.wait(1);
          }
        } catch (ethersErr) {
          console.warn("Ethers BrowserProvider attempt notice:", ethersErr);
        }
      }

      // Approach 2: Direct EIP-1193 eth_sendTransaction (Native in Farcaster/Warpcast webviews)
      if (!ethersSucceeded && typeof rawProvider.request === "function") {
        const txParams = {
          to: CONTRACT_ADDRESS,
          value: valueHex,
          data: "0x"
        };
        if (userAddr) txParams.from = userAddr;

        txHash = await rawProvider.request({
          method: "eth_sendTransaction",
          params: [txParams]
        });
      }

      if (txHash) {
        console.log("Tx approved successfully:", txHash);
        setLives(MAX_LIVES);
        localStorage.setItem("far_run_lives", MAX_LIVES);
        setShowPaywall(false);
        setPayStatus("");
        alert("Payment successful! 5 lives added. Good luck!");
      } else {
        throw new Error("Transaction could not be completed.");
      }
    } catch (err) {
      console.error("Wallet transaction failed:", err);
      const userMsg = err.shortMessage || err.message || (typeof err === "string" ? err : "Transaction cancelled");
      setPayStatus("Error: " + userMsg);
    } finally {
      setIsPaying(false);
    }
  };

  const handleStartGame = () => {
    if (lives <= 0) {
      setShowPaywall(true);
      return;
    }
    const started = EndlessRunner.start(selectedCharId);
    if (started) {
      setGameState("PLAYING");
    }
  };

  const selectedCharObj = CHARACTERS.find((c) => c.id === selectedCharId) || CHARACTERS[0];

  return (
    <div id="gameContainer">
      <div id="scoreContainer">
        LIVES: {lives} | SCORE: {currentScore} | BEST: {highScore}
      </div>

      <canvas
        id="gameCanvas"
        ref={canvasRef}
        onPointerDown={() => {
          if (gameState === "PLAYING") {
            EndlessRunner.jump();
          }
        }}
        onPointerUp={() => {
          if (gameState === "PLAYING") {
            EndlessRunner.stopJump();
          }
        }}
      />

      {/* --- MAIN MENU --- */}
      {gameState === "MENU" && (
        <div id="main-menu" className="menu-screen">
          <h1>FAR RUN</h1>
          <div className="instructions">
            <p>JUMP TO SURVIVE</p>
            <p>SPACEBAR / TAP / CLICK</p>
            <p style={{ marginTop: "8px", color: "#A8DADC" }}>
              CURRENT: {selectedCharObj.name.toUpperCase()}
            </p>
          </div>
          <button id="btnStartGame" onClick={handleStartGame}>
            START GAME
          </button>
          <button onClick={() => setGameState("CHAR_SELECT")}>
            CHOOSE WARPLET
          </button>
          <button onClick={fetchLeaderboard}>
            LEADERBOARD
          </button>
        </div>
      )}

      {/* --- CHARACTER SELECT --- */}
      {gameState === "CHAR_SELECT" && (
        <div id="char-select-screen" className="menu-screen">
          <h2>SELECT WARPLET</h2>
          <div className="char-grid">
            {CHARACTERS.map((char) => (
              <div
                key={char.id}
                className="char-card"
                onClick={() => setSelectedCharId(char.id)}
              >
                <img
                  src={"assets/" + char.file}
                  alt={char.name}
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (!target.dataset.tried) {
                      target.dataset.tried = "1";
                      target.src = char.file;
                    } else if (target.dataset.tried === "1") {
                      target.dataset.tried = "2";
                      target.src = "/" + char.file;
                    }
                  }}
                  className={
                    "char-option " + (selectedCharId === char.id ? "selected" : "")
                  }
                />
                <div className="char-name">{char.name}</div>
              </div>
            ))}
          </div>

          <div id="charDescription">
            "{selectedCharObj.desc}"
          </div>

          <button id="btnStartGame" onClick={() => setGameState("MENU")}>
            CONFIRM SELECTION
          </button>
        </div>
      )}

      {/* --- GAME OVER SCREEN --- */}
      {gameState === "GAMEOVER" && (
        <div id="game-over-screen">
          <h2>GAME OVER</h2>
          <p style={{ fontSize: "18px", fontWeight: "bold", margin: "10px 0" }}>
            SCORE: {currentScore}
          </p>
          <p style={{ fontSize: "13px", color: "#555", marginBottom: "16px" }}>
            LIVES REMAINING: {lives}
          </p>
          <button id="btnRestart" onClick={handleStartGame}>
            {lives > 0 ? "PLAY AGAIN" : "GET LIVES TO PLAY"}
          </button>
          <button id="btnReturnMenu" onClick={() => setGameState("MENU")}>
            MAIN MENU
          </button>
        </div>
      )}

      {/* --- PAYWALL MODAL --- */}
      {showPaywall && (
        <div className="menu-screen" style={{ zIndex: 25 }}>
          <h2>OUT OF LIVES!</h2>
          <div className="instructions">
            <p>Insert 0.000002 ETH on Base to refill 5 lives and continue running.</p>
          </div>

          {payStatus && (
            <p style={{ color: "#FFD700", fontSize: "12px", fontFamily: "monospace", textAlign: "center", maxWidth: "240px", margin: "8px 0" }}>
              {payStatus}
            </p>
          )}

          <button
            id="btnStartGame"
            onClick={handlePayment}
            disabled={isPaying}
            style={{ opacity: isPaying ? 0.6 : 1 }}
          >
            {isPaying ? "PROCESSING..." : "INSERT COIN (BASE)"}
          </button>
          <button onClick={() => setShowPaywall(false)} disabled={isPaying}>
            CANCEL
          </button>
        </div>
      )}

      {/* --- LEADERBOARD MODAL --- */}
      {showLeaderboard && (
        <div id="leaderboard-modal">
          <h2>TOP RUNNERS</h2>
          <div style={{ flex: 1, overflowY: "auto", margin: "10px 0" }}>
            {leaderboardData.length === 0 ? (
              <p style={{ textAlign: "center", color: "#888", marginTop: "40px", fontFamily: "monospace" }}>
                Loading scores...
              </p>
            ) : (
              leaderboardData.map((item, idx) => (
                <div
                  key={idx}
                  className={"lb-row " + (idx === 0 ? "gold" : "")}
                >
                  <span>#{idx + 1} {item.username || "Runner"}</span>
                  <span>{item.score} pts</span>
                </div>
              ))
            )}
          </div>
          <button onClick={() => setShowLeaderboard(false)} style={{ alignSelf: "center" }}>
            CLOSE
          </button>
        </div>
      )}
    </div>
  );
}

// --- 6. SAFE MOUNTING ---
try {
  const rootElement = document.getElementById("root");
  if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(<App />);
  }
} catch (err) {
  console.error("Failed to initialize FAR RUN:", err);
}
