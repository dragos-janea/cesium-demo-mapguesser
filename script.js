let countries = {};
let peopleData = [];

async function loadCountries() {
  const response = await fetch('countries.json');
  const data = await response.json();

  // Convert positions and colors to Cesium objects
  Object.entries(data).forEach(([key, value]) => {
    countries[key] = {
      position: Cesium.Cartesian3.fromDegrees(...value.position),
      name: key.replace("Europe/", "").replace("Asia/", "").replace("Africa/", "").replace("America/", ""),
      color: Cesium.Color[value.color]
    };
  });
}

async function loadPeople() {
  const response = await fetch('people.json');
  peopleData = await response.json();
}

const viewer = new Cesium.Viewer("cesiumContainer", {
  shouldAnimate: true,
  selectionIndicator: false,
  infoBox: false,
  timeline: false,
  animation: false,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  navigationInstructionsInitiallyVisible: false,
  fullscreenButton: false,
  vrButton: false,
});

viewer.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
viewer.trackedEntity = undefined;

const people = [];

async function init() {
  await loadCountries();
  await loadPeople();
  addCountryLabels();
  setupPeople();
  startGame();
}
async function loadFaceCroppedImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;

    img.onload = () => {
      const w = img.width;
      const h = img.height;
      const size = Math.min(w, h);

      // Center crop: get the largest possible circle from the center
      const cx = w / 2;
      const cy = h / 2;
      const radius = size / 2;

      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");

      // Draw circular clipping path from center
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      // Draw the image centered in the canvas
      ctx.drawImage(
        img,
        cx - radius, cy - radius, size, size, // source rect
        0, 0, size, size // destination rect
      );

      resolve(canvas.toDataURL("image/png"));
    };

    img.onerror = (err) => {
      console.error("Failed to load image", err);
      reject(new Error("Image failed to load"));
    };
  });
}

// Setup people with spiral movement in their home countries
async function setupPeople() {
  for (let i = 0; i < peopleData.length; i++) {
    const personInfo = peopleData[i];
    const homeCountry = countries[personInfo.tz];

    if (!homeCountry) {
      console.warn(`Country not found: ${personInfo.tz}`);
      continue;
    }

    // Assume images are in public/people and named as in people.json
    const imagePath = `public/people/${personInfo.name}.jpg`;

    try {
      const faceImage = await loadFaceCroppedImage(imagePath);
      const person = createPerson(homeCountry.position, faceImage);
      people.push(person);
      startSpiralMovement(person, homeCountry.position);
    } catch (error) {
      console.error(`Failed to load image for person ${i}: ${imagePath}`, error);
    }
  }
}

// Create a person entity (simplified without name)
function createPerson(position, faceImage) {
  const person = {
    entity: viewer.entities.add({
      position: position,
      billboard: {
        image: faceImage,
        width: 64,
        height: 64,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        scaleByDistance: new Cesium.NearFarScalar(1.0e5, 1.0, 2.0e6, 0.5)
      }
    }),
    centerPosition: Cesium.Cartesian3.clone(position),
    currentAngle: Math.random() * Math.PI * 2,
    spiralSpeed: 0.01 + Math.random() * 0.02,
    spiralRadius: 100000 + Math.random() * 200000,
    noiseOffset: Math.random() * 1000,
    heightOffset: 0
  };

  return person;
}

// Start spiral movement for a person
function startSpiralMovement(person, center) {
  viewer.clock.onTick.addEventListener(() => {
    updateSpiralPosition(person);
  });
}

// Update person's position in a spiral pattern with noise
function updateSpiralPosition(person) {
  // Update angle
  person.currentAngle += person.spiralSpeed;
  
  // Add some noise to make movement more organic
  person.noiseOffset += 0.01;
  const noiseValue = PerlinNoise.noise(person.noiseOffset, 0) * 2 - 1;
  
  // Calculate spiral position
  const radius = person.spiralRadius * (0.9 + 0.1 * noiseValue);
  const x = radius * Math.cos(person.currentAngle);
  const y = radius * Math.sin(person.currentAngle);
  
  // Add some vertical movement with noise
  person.heightOffset = 50000 * noiseValue;
  
  // Calculate final position
  const offset = new Cesium.Cartesian3(x, y, person.heightOffset);
  const position = Cesium.Cartesian3.add(person.centerPosition, offset, new Cesium.Cartesian3());
  
  // Update person's position
  person.entity.position = position;
}

// Simple Perlin noise implementation for organic movement
const PerlinNoise = {
  grad3: [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
          [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
          [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]],
  p: [],
  perm: [],
  
  noise: function(x, y) {
    let X = Math.floor(x), Y = Math.floor(y);
    x = x - X; y = y - Y;
    X = X & 255; Y = Y & 255;
    
    const n00 = this.dot2(this.grad3[this.perm[X+this.perm[Y]] % 12], x, y);
    const n01 = this.dot2(this.grad3[this.perm[X+this.perm[Y+1]] % 12], x, y-1);
    const n10 = this.dot2(this.grad3[this.perm[X+1+this.perm[Y]] % 12], x-1, y);
    const n11 = this.dot2(this.grad3[this.perm[X+1+this.perm[Y+1]] % 12], x-1, y-1);
    
    const u = this.fade(x);
    return this.lerp(this.lerp(n00, n10, u), this.lerp(n01, n11, u), this.fade(y));
  },
  
  fade: function(t) { return t * t * t * (t * (t * 6 - 15) + 10); },
  lerp: function(a, b, t) { return (1-t)*a + t*b; },
  dot2: function(g, x, y) { return g[0]*x + g[1]*y; },
  
  init: function() {
    for (let i = 0; i < 256; i++) {
      this.p[i] = Math.floor(Math.random() * 256);
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = this.p[i & 255];
    }
  }
};
function addCountryLabels() {
  Object.values(countries).forEach(country => {
    viewer.entities.add({
      position: country.position,
      label: {
        text: country.name,
        font: "16px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 4,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -40)
      }
    });
  });
}

// Initialize Perlin noise
PerlinNoise.init();

// --- GAME UI AND LOGIC ---

let currentPersonIndex = 0;
let score = 0;
let timerInterval = null;
let timeLeft = 10;
let guessFlagEntity = null;
let answerFlagEntity = null;
let canGuess = false;
let guessPosition = null;
let roundEnded = false;
let gameTimer = null;
let gameTimeLeft = 60; // 1 minute for the whole game

// UI elements
const uiBar = document.createElement('div');
uiBar.style.position = 'absolute';
uiBar.style.top = '20px';
uiBar.style.left = '50%';
uiBar.style.transform = 'translateX(-50%)';
uiBar.style.background = 'rgba(0,0,0,0.7)';
uiBar.style.color = '#fff';
uiBar.style.padding = '16px 32px';
uiBar.style.fontSize = '2em';
uiBar.style.borderRadius = '12px';
uiBar.style.zIndex = 1000;
uiBar.style.display = 'none';
uiBar.style.textAlign = 'center';
document.body.appendChild(uiBar);

// Total score bar
const scoreBar = document.createElement('div');
scoreBar.style.position = 'absolute';
scoreBar.style.top = '20px';
scoreBar.style.right = '40px';
scoreBar.style.background = 'rgba(0,0,0,0.7)';
scoreBar.style.color = '#fff';
scoreBar.style.padding = '10px 20px';
scoreBar.style.fontSize = '1.5em';
scoreBar.style.borderRadius = '10px';
scoreBar.style.zIndex = '1001';
scoreBar.innerHTML = `Score: 0<br>Time: 60s`;
document.body.appendChild(scoreBar);

function updateScoreBar() {
  scoreBar.innerHTML = `Score: ${score}<br>Time: ${gameTimeLeft}s`;
}

function showPersonUI(name, time) {
  // Assume images are in public/people and named as in people.json
  const imagePath = `public/people/${name}.jpg`;
  uiBar.innerHTML = `
    <div style="font-size:0.5em;">Where's that JaneaSystems Employee?</div>
    <div style="display:flex;align-items:center;justify-content:center;gap:16px;">
      <img src="${imagePath}" alt="${name}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid #fff;box-shadow:0 0 8px #000;">
      <b>${name}</b>
      <span id="timer" style="margin-left:30px;">${time}s</span>
    </div>
  `;
  uiBar.style.display = 'block';
}

function hidePersonUI() {
  uiBar.style.display = 'none';
}

function updateTimer(time) {
  const timerSpan = document.getElementById('timer');
  if (timerSpan) timerSpan.textContent = `${time}s`;
}

function showScore(points) {
  uiBar.innerHTML += `<br><span style="font-size:1em;color:gold;">+${points} points!</span>`;
}

function getDistanceMeters(cartesianA, cartesianB) {
  return Cesium.Cartesian3.distance(cartesianA, cartesianB);
}

function getHotColdColor(dist) {
  // <50km: red, 50-200km: orange, 200-1000km: yellow, 1000-3000km: lightblue, >3000km: blue
  if (dist < 50000) return Cesium.Color.RED;
  if (dist < 200000) return Cesium.Color.ORANGE;
  if (dist < 1000000) return Cesium.Color.YELLOW;
  if (dist < 3000000) return Cesium.Color.CYAN;
  return Cesium.Color.BLUE;
}

function placeFlagAt(position, color = Cesium.Color.WHITE) {
  const direction = Cesium.Cartesian3.normalize(position, new Cesium.Cartesian3());
  const offsetDistance = 100000;
  const offset = Cesium.Cartesian3.multiplyByScalar(direction, offsetDistance, new Cesium.Cartesian3());
  const flagPosition = Cesium.Cartesian3.add(position, offset, new Cesium.Cartesian3());

  // Place the flag at the new position
  return viewer.entities.add({
    position: flagPosition,
    billboard: {
      image: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
      width: 64,
      height: 64,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      color: color
    }
  });
}

function placeAnswerTriangleAt(position) {
  // Draw a red triangle at the answer location
  return viewer.entities.add({
    position: position,
    point: {
      pixelSize: 24,
      color: Cesium.Color.RED,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 4
    }
  });
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

async function startGame() {
  currentPersonIndex = 0;
  score = 0;
  gameTimeLeft = 60;
  shuffleArray(peopleData);
  updateScoreBar();
  if (gameTimer) clearInterval(gameTimer);
  gameTimer = setInterval(() => {
    gameTimeLeft--;
    updateScoreBar();
    if (gameTimeLeft <= 0) {
      clearInterval(gameTimer);
      endGame();
    }
  }, 1000);
  await nextRound();
}

function endGame() {
  canGuess = false;
  if (timerInterval) clearInterval(timerInterval);
  uiBar.innerHTML = `<b>Game Over!</b><br>Your score: <span style="color:gold">${score}</span>`;
  uiBar.style.display = 'block';
  viewer.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

async function nextRound() {
  if (gameTimeLeft <= 0) {
    endGame();
    return;
  }
  if (guessFlagEntity) {
    viewer.entities.remove(guessFlagEntity);
    guessFlagEntity = null;
  }
  if (answerFlagEntity) {
    viewer.entities.remove(answerFlagEntity);
    answerFlagEntity = null;
  }
  guessPosition = null;
  roundEnded = false;

  if (currentPersonIndex >= peopleData.length) {
    endGame();
    return;
  }
  const person = peopleData[currentPersonIndex];
  showPersonUI(person.name, 10);
  timeLeft = 10;
  canGuess = true;

  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimer(timeLeft);
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      onTimeUp();
    }
  }, 1000);

  // Listen for map click for guess (allow updating selection)
  viewer.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);
  viewer.screenSpaceEventHandler.setInputAction(async function(click) {
    if (!canGuess || roundEnded) return;

    // Get the picked position on the globe
    const pickedPosition = viewer.scene.pickPosition(click.position);
    if (!pickedPosition) return;

    // Remove previous guess flag
    if (guessFlagEntity) {
      viewer.entities.remove(guessFlagEntity);
      guessFlagEntity = null;
    }
    guessPosition = pickedPosition;

    // Show hot/cold color
    const homeCountry = countries[person.tz];
    let color = Cesium.Color.WHITE;
    if (homeCountry) {
      const dist = getDistanceMeters(guessPosition, homeCountry.position);
      color = getHotColdColor(dist);
      // If really close, end timer early and go to next person
      if (dist < 200000) {
        canGuess = false;
        clearInterval(timerInterval);
        guessFlagEntity = placeFlagAt(guessPosition, color);
        await showAnswerAndScore(true);
        return;
      }
    }
    guessFlagEntity = placeFlagAt(guessPosition, color);
    // Otherwise, let user keep clicking until timer ends
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

async function showAnswerAndScore(immediate = false) {
  if (roundEnded) return;
  roundEnded = true;
  const person = peopleData[currentPersonIndex];
  const homeCountry = countries[person.tz];
  let points = 0;
  if (!homeCountry || !guessPosition) {
    showScore(0);
  } else {
    answerFlagEntity = placeAnswerTriangleAt(homeCountry.position);
    const dist = getDistanceMeters(guessPosition, homeCountry.position);
    if (dist < 200000) points = 500;
    else if (dist < 1000000) points = 100;
    else points = 10;
    score += points;
    updateScoreBar();
    showScore(points);
  }
  setTimeout(() => {
    if (guessFlagEntity) {
      viewer.entities.remove(guessFlagEntity);
      guessFlagEntity = null;
    }
    if (answerFlagEntity) {
      viewer.entities.remove(answerFlagEntity);
      answerFlagEntity = null;
    }
    currentPersonIndex++;
    nextRound();
  }, 1000);
}

function onTimeUp() {
  canGuess = false;
  showAnswerAndScore();
}

init();