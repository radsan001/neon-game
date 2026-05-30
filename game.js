// --- Matter.js Aliases ---
const Engine = Matter.Engine,
      Render = Matter.Render,
      Runner = Matter.Runner,
      Bodies = Matter.Bodies,
      Composite = Matter.Composite,
      Events = Matter.Events,
      Mouse = Matter.Mouse,
      MouseConstraint = Matter.MouseConstraint,
      Body = Matter.Body;

// --- Game Constants & Config ---
const GEM_TIERS = [
  { radius: 15, color: '#ff00ff', score: 2 },
  { radius: 25, color: '#00ffff', score: 4 },
  { radius: 35, color: '#ff00aa', score: 8 },
  { radius: 45, color: '#00ccff', score: 16 },
  { radius: 60, color: '#cc00ff', score: 32 },
  { radius: 75, color: '#00ffcc', score: 64 },
  { radius: 95, color: '#ff9900', score: 128 },
  { radius: 115, color: '#ff3333', score: 256 },
  { radius: 135, color: '#33ff33', score: 512 },
  { radius: 155, color: '#ffff00', score: 1024 },
  { radius: 180, color: '#ffffff', score: 2048 }
];

const GAME_WIDTH = 600;
const GAME_HEIGHT = 1000;
const WALL_THICKNESS = 60;
const TOP_LIMIT_Y = 150;

// --- State Variables ---
let engine, render, runner;
let world;
let currentScore = 0;
let stardust = 0;
let isGameOver = false;
let isGameRunning = false;
let isPaused = false;
let nextGemTier = 0;
let walls = [];
let topSensor;

// Shop logic
let unlockedThemes = ['default'];
let activeTheme = 'default';

// Web Audio Context
let audioCtx;

// --- DOM Elements ---
const canvasWrapper = document.getElementById('canvas-wrapper');
const gameContainer = document.getElementById('game-container');

// HUD
const inGameHud = document.getElementById('in-game-hud');
const scoreEl = document.getElementById('score');
const nextGemEl = document.getElementById('next-gem');
const btnPause = document.getElementById('btn-pause');

// Menus
const mainMenu = document.getElementById('main-menu');
const pauseMenu = document.getElementById('pause-menu');
const gameOverMenu = document.getElementById('game-over');
const shopMenu = document.getElementById('shop');

// Buttons
const btnStart = document.getElementById('btn-start');
const btnResume = document.getElementById('btn-resume');
const btnBackFromPause = document.getElementById('btn-back-from-pause');
const btnRestart = document.getElementById('btn-restart');
const btnBackFromOver = document.getElementById('btn-back-from-over');
const btnShare = document.getElementById('btn-share');
const btnShop = document.getElementById('btn-shop');
const btnCloseShop = document.getElementById('btn-close-shop');
const finalScoreEl = document.getElementById('final-score');
const shopStardustEl = document.getElementById('shop-stardust');

// --- Audio & Haptics (Juice) ---
function initAudio() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioCtx = new AudioContext();
    }
  }
}

function playSound(type) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  
  if (type === 'drop') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
  } else if (type === 'merge_small') {
    osc.type = 'square';
    osc.frequency.setValueAtTime(200, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
  } else if (type === 'merge_big') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.6, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  }
}

function triggerHaptic(tier) {
  if (navigator.vibrate) {
    if (tier < 3) navigator.vibrate(20);
    else if (tier < 6) navigator.vibrate([30, 20, 30]);
    else navigator.vibrate([50, 30, 50, 30, 100]);
  }
}

function triggerHitStop(tier) {
  if (tier < 3 || isPaused || isGameOver) return;
  const stopTime = tier < 6 ? 50 : 100;
  
  Runner.stop(runner);
  
  gameContainer.classList.add(tier < 6 ? 'shake' : 'shake-heavy');
  setTimeout(() => {
    gameContainer.classList.remove('shake', 'shake-heavy');
    if (!isPaused && !isGameOver) {
      Runner.start(runner, engine);
    }
  }, stopTime);
}

function updateEnvironment() {
  const newHue = 280 + (currentScore * 0.05);
  const root = document.documentElement;
  root.style.setProperty('--bg-hue', newHue % 360);
  
  const speed = Math.max(5, 20 - (currentScore * 0.001));
  root.style.setProperty('--particle-speed', `${speed}s`);
}

// --- Game Logic ---
function initMatter() {
  engine = Engine.create();
  world = engine.world;
  
  engine.gravity.y = 1.5;

  render = Render.create({
    element: canvasWrapper,
    engine: engine,
    options: {
      width: canvasWrapper.clientWidth,
      height: canvasWrapper.clientHeight,
      wireframes: false,
      background: 'transparent',
      pixelRatio: window.devicePixelRatio
    }
  });

  runner = Runner.create();
  
  createWalls();
  setupEvents();
  
  const resizeObserver = new ResizeObserver(() => {
    if (!render) return;
    render.canvas.width = canvasWrapper.clientWidth * window.devicePixelRatio;
    render.canvas.height = canvasWrapper.clientHeight * window.devicePixelRatio;
    render.canvas.style.width = canvasWrapper.clientWidth + 'px';
    render.canvas.style.height = canvasWrapper.clientHeight + 'px';
    render.options.width = canvasWrapper.clientWidth;
    render.options.height = canvasWrapper.clientHeight;
    
    updateWalls();
  });
  resizeObserver.observe(canvasWrapper);
  
  canvasWrapper.addEventListener('pointerdown', (e) => {
    if (isGameOver || !isGameRunning || isPaused) return;
    initAudio();
    
    const rect = canvasWrapper.getBoundingClientRect();
    let x = e.clientX - rect.left;
    
    const radius = GEM_TIERS[nextGemTier].radius;
    const cw = canvasWrapper.clientWidth;
    if (x < radius + 10) x = radius + 10;
    if (x > cw - radius - 10) x = cw - radius - 10;

    spawnGem(x, 50, nextGemTier);
    playSound('drop');
    
    nextGemTier = Math.floor(Math.random() * 4);
    updateNextGemUI();
  });
}

function createWalls() {
  const cw = canvasWrapper.clientWidth || GAME_WIDTH;
  const ch = canvasWrapper.clientHeight || GAME_HEIGHT;
  
  walls = [
    Bodies.rectangle(cw/2, ch + WALL_THICKNESS/2, cw, WALL_THICKNESS, { isStatic: true, render: { fillStyle: 'transparent' } }),
    Bodies.rectangle(-WALL_THICKNESS/2, ch/2, WALL_THICKNESS, ch * 2, { isStatic: true, render: { fillStyle: 'transparent' } }),
    Bodies.rectangle(cw + WALL_THICKNESS/2, ch/2, WALL_THICKNESS, ch * 2, { isStatic: true, render: { fillStyle: 'transparent' } })
  ];
  
  topSensor = Bodies.rectangle(cw/2, TOP_LIMIT_Y, cw, 10, { 
    isStatic: true, 
    isSensor: true,
    render: { fillStyle: 'rgba(255, 0, 0, 0.2)' }
  });
  
  Composite.add(world, [...walls, topSensor]);
}

function updateWalls() {
  const cw = canvasWrapper.clientWidth;
  const ch = canvasWrapper.clientHeight;
  
  if (walls.length) {
    Body.setPosition(walls[0], { x: cw/2, y: ch + WALL_THICKNESS/2 });
    Body.setVertices(walls[0], Matter.Vertices.fromPath(`0 0 ${cw} 0 ${cw} ${WALL_THICKNESS} 0 ${WALL_THICKNESS}`));
    
    Body.setPosition(walls[1], { x: -WALL_THICKNESS/2, y: ch/2 });
    Body.setPosition(walls[2], { x: cw + WALL_THICKNESS/2, y: ch/2 });
    
    Body.setPosition(topSensor, { x: cw/2, y: TOP_LIMIT_Y });
    Body.setVertices(topSensor, Matter.Vertices.fromPath(`0 0 ${cw} 0 ${cw} 10 0 10`));
  }
}

function spawnGem(x, y, tier) {
  const t = GEM_TIERS[tier];
  const gem = Bodies.circle(x, y, t.radius, {
    restitution: 0.2,
    density: 0.001 * (tier + 1),
    friction: 0.5,
    render: {
      fillStyle: t.color,
      strokeStyle: '#ffffff',
      lineWidth: 2
    },
    label: `gem_${tier}`
  });
  Composite.add(world, gem);
}

function setupEvents() {
  Events.on(engine, 'collisionStart', (event) => {
    if (isPaused) return; // Prevent logic if accidentally triggered
    const pairs = event.pairs;
    
    for (let i = 0; i < pairs.length; i++) {
      const bodyA = pairs[i].bodyA;
      const bodyB = pairs[i].bodyB;
      
      if (!isGameOver) {
        if ((bodyA === topSensor && bodyB.label.startsWith('gem_')) ||
            (bodyB === topSensor && bodyA.label.startsWith('gem_'))) {
          const gem = bodyA === topSensor ? bodyB : bodyA;
          if (Math.abs(gem.velocity.y) < 0.1 && gem.position.y < TOP_LIMIT_Y + 20) {
            triggerGameOver();
          }
        }
      }

      if (bodyA.label.startsWith('gem_') && bodyB.label.startsWith('gem_')) {
        const tierA = parseInt(bodyA.label.split('_')[1]);
        const tierB = parseInt(bodyB.label.split('_')[1]);
        
        if (tierA === tierB && tierA < GEM_TIERS.length - 1) {
          const nextTier = tierA + 1;
          const newX = (bodyA.position.x + bodyB.position.x) / 2;
          const newY = (bodyA.position.y + bodyB.position.y) / 2;
          
          Composite.remove(world, [bodyA, bodyB]);
          spawnGem(newX, newY, nextTier);
          
          currentScore += GEM_TIERS[nextTier].score;
          stardust += Math.floor(GEM_TIERS[nextTier].score / 2);
          updateUI();
          
          playSound(nextTier > 5 ? 'merge_big' : 'merge_small');
          triggerHaptic(nextTier);
          triggerHitStop(nextTier);
          updateEnvironment();
          
          bodyA.label = 'merged';
          bodyB.label = 'merged';
        }
      }
    }
  });
}

function updateUI() {
  scoreEl.textContent = currentScore;
}

function updateNextGemUI() {
  const t = GEM_TIERS[nextGemTier];
  nextGemEl.style.backgroundColor = t.color;
  const size = Math.min(45, t.radius * 2);
  nextGemEl.style.width = size + 'px';
  nextGemEl.style.height = size + 'px';
}

function startGame() {
  initAudio();
  mainMenu.classList.remove('active');
  mainMenu.classList.add('hidden');
  gameOverMenu.classList.remove('active');
  gameOverMenu.classList.add('hidden');
  pauseMenu.classList.remove('active');
  pauseMenu.classList.add('hidden');
  
  inGameHud.classList.remove('hidden');
  canvasWrapper.classList.remove('blurred');
  
  Composite.clear(world);
  Engine.clear(engine);
  createWalls();
  
  currentScore = 0;
  isGameOver = false;
  isGameRunning = true;
  isPaused = false;
  nextGemTier = Math.floor(Math.random() * 4);
  
  updateUI();
  updateNextGemUI();
  
  Render.run(render);
  Runner.run(runner, engine);
}

function pauseGame() {
  if (!isGameRunning || isGameOver || isPaused) return;
  isPaused = true;
  Runner.stop(runner);
  canvasWrapper.classList.add('blurred');
  inGameHud.classList.add('hidden');
  
  pauseMenu.classList.remove('hidden');
  pauseMenu.classList.add('active');
}

function resumeGame() {
  if (!isGameRunning || isGameOver || !isPaused) return;
  isPaused = false;
  
  pauseMenu.classList.remove('active');
  pauseMenu.classList.add('hidden');
  
  inGameHud.classList.remove('hidden');
  canvasWrapper.classList.remove('blurred');
  
  Runner.start(runner, engine);
}

function backToMenu() {
  isGameRunning = false;
  isPaused = false;
  isGameOver = false;
  
  Runner.stop(runner);
  Render.stop(render);
  
  pauseMenu.classList.remove('active');
  pauseMenu.classList.add('hidden');
  gameOverMenu.classList.remove('active');
  gameOverMenu.classList.add('hidden');
  inGameHud.classList.add('hidden');
  canvasWrapper.classList.remove('blurred');
  
  mainMenu.classList.remove('hidden');
  mainMenu.classList.add('active');
  
  saveData();
}

function triggerGameOver() {
  if (isGameOver) return;
  isGameOver = true;
  isGameRunning = false;
  isPaused = false;
  
  Runner.stop(runner);
  Render.stop(render);
  
  inGameHud.classList.add('hidden');
  canvasWrapper.classList.add('blurred');
  
  finalScoreEl.textContent = `Score: ${currentScore}`;
  gameOverMenu.classList.remove('hidden');
  gameOverMenu.classList.add('active');
  
  saveData();
}

// --- Data Persistence ---
function saveData() {
  const data = {
    stardust: stardust,
    unlockedThemes: unlockedThemes,
    activeTheme: activeTheme
  };
  localStorage.setItem('cosmicGemData', JSON.stringify(data));
}

function loadData() {
  const stored = localStorage.getItem('cosmicGemData');
  if (stored) {
    const data = JSON.parse(stored);
    stardust = data.stardust || 0;
    unlockedThemes = data.unlockedThemes || ['default'];
    activeTheme = data.activeTheme || 'default';
  }
}

setInterval(() => {
  if (isGameRunning) {
    saveData();
  }
}, 3000);

// --- Share API ---
btnShare.addEventListener('click', async () => {
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Neon Cosmic Gem',
        text: `I just scored ${currentScore} in Neon Cosmic Gem! Can you beat me?`,
        url: window.location.href,
      });
    } catch (err) {
      console.log('Error sharing:', err);
    }
  } else {
    alert(`Score: ${currentScore} - Share feature not supported on this browser.`);
  }
});

// --- UI Event Listeners ---
btnStart.addEventListener('click', startGame);
btnPause.addEventListener('click', pauseGame);
btnResume.addEventListener('click', resumeGame);
btnBackFromPause.addEventListener('click', backToMenu);
btnRestart.addEventListener('click', startGame);
btnBackFromOver.addEventListener('click', backToMenu);

btnShop.addEventListener('click', () => {
  shopStardustEl.textContent = `Your Stardust: ${stardust} ✨`;
  shopMenu.classList.remove('hidden');
  shopMenu.classList.add('active');
});

btnCloseShop.addEventListener('click', () => {
  shopMenu.classList.add('hidden');
  shopMenu.classList.remove('active');
});

// --- Init ---
loadData();
initMatter();
