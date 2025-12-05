// Main Application Logic

// --- Global Variables ---
let scene, camera, renderer;
let particles, particleSystem;
let earthMesh, atmosphereMesh;
let magneticData = [];
let currentTimeIndex = 0;
let lastTime = 0;
let baseDataInterval = 50; // ms between data updates
let playbackMultiplier = 1.0;

// Interaction State
const state = {
    handOpenness: 1.0, // 0 to 1 (closed to open)
    isPaused: false,
    baseColor: new THREE.Color(0xffff00), // Default yellow particles
    bzValue: 0, // Current Bz value affecting magnetosphere
    btValue: 5, // Current Bt value (magnitude) affecting particle length
    particleScale: 1.0, // Scale factor for particle size based on hand distance
    particleExpansion: 1.0, // Expansion factor based on hand tension
    simTime: 0, // Simulation time (seconds) of current data point
};

// DOM Elements
const statusEl = document.getElementById('status');
const valBx = document.getElementById('val-bx');
const valBy = document.getElementById('val-by');
const valBz = document.getElementById('val-bz');
const valBt = document.getElementById('val-bt');
const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');

// --- Initialization ---
async function init() {
    initThreeJS();
    await loadData();
    initMediaPipe();
    setupEventListeners();
    animate();
}

function initThreeJS() {
    const container = document.getElementById('canvas-container');

    // Scene
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050510, 0.002);

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 10000);
    camera.position.z = 600; // Zoomed in on Earth

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // Earth
    createEarth();

    // Particles
    createParticleSystem();

    // Lights
    const ambientLight = new THREE.AmbientLight(0x111111);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
    sunLight.position.set(500, 0, 0);
    sunLight.castShadow = true;
    scene.add(sunLight);

    // Handle Window Resize
    window.addEventListener('resize', onWindowResize, false);
}

function createEarth() {
    // Larger Earth with ocean‑like color
    const geometry = new THREE.SphereGeometry(250, 32, 32);
    const textureLoader = new THREE.TextureLoader();
    const earthTexture = textureLoader.load('visuals/2k_earth_daymap.jpg');
    const material = new THREE.MeshStandardMaterial({
        map: earthTexture,
        color: 0xffffff,
        transparent: true,
        opacity: 0.95,
        metalness: 0,
        roughness: 1
    });
    earthMesh = new THREE.Mesh(geometry, material);
    earthMesh.receiveShadow = true;
    scene.add(earthMesh);

    // Wireframe Magnetosphere boundary visualization
    const atmGeometry = new THREE.SphereGeometry(160, 32, 32);
    const atmMaterial = new THREE.MeshBasicMaterial({
        color: 0x44aaff,
        transparent: true,
        opacity: 0.1,
        wireframe: true
    });
    atmosphereMesh = new THREE.Mesh(atmGeometry, atmMaterial);
    scene.add(atmosphereMesh);
}

function createParticleSystem() {
    const particleCount = 15000;

    // Store particle data for animation
    const positions = [];
    const velocities = [];

    // Geometry for a small arrow (cone) pointing along +Y, will be rotated per instance
    // Reduced size and made translucent per user feedback
    // Reduced cone size: radius 20% (0.4), height 33% (≈2.6) of original
    const arrowGeometry = new THREE.ConeGeometry(0.4, 2.6, 5);
    const arrowMaterial = new THREE.MeshBasicMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.6
    });

    // Instanced mesh to efficiently render many arrows
    const particleMesh = new THREE.InstancedMesh(arrowGeometry, arrowMaterial, particleCount);
    particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(particleMesh);

    const dummy = new THREE.Object3D();

    for (let i = 0; i < particleCount; i++) {
        // Initial position (sun side)
        const x = 500 + Math.random() * 1000;
        const y = (Math.random() - 0.5) * 1000;
        const z = (Math.random() - 0.5) * 1000;
        positions.push(x, y, z);

        // Initial velocity towards Earth (negative X)
        const vx = -2 - Math.random() * 3;
        const vy = (Math.random() - 0.5) * 0.5;
        const vz = (Math.random() - 0.5) * 0.5;
        velocities.push(vx, vy, vz);

        // Set initial instance matrix
        dummy.position.set(x, y, z);
        dummy.scale.setScalar(1);
        
        // Orient arrow to point along its velocity vector.
        // Since ConeGeometry points to +Y by default, we need to rotate it to point to +Z (lookAt standard)
        // or just use lookAt and then rotate X by -PI/2 to align the cone tip with the direction.
        
        // Target point based on velocity
        dummy.lookAt(x + vx, y + vy, z + vz);
        
        // Correct orientation: rotate 90 degrees around X so the Y-axis cone points towards Z-axis lookAt
        dummy.rotateX(Math.PI / 2);

        dummy.updateMatrix();
        particleMesh.setMatrixAt(i, dummy.matrix);
    }

    // Store for later updates
    window.particleData = {
        positions: new Float32Array(positions),
        velocities: new Float32Array(velocities),
        mesh: particleMesh,
        dummy: dummy
    };
}

async function loadData() {
    try {
        statusEl.textContent = 'Status: Loading Data...';
        const response = await fetch('magnetic_data.json');
        magneticData = await response.json();
        statusEl.textContent = 'Status: Data Loaded. Initializing Camera...';
    } catch (error) {
        console.error('Error loading data:', error);
        statusEl.textContent = 'Status: Error loading data.';
    }
}

function initMediaPipe() {
    const hands = new Hands({locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }});
    
    hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
    
    hands.onResults(onHandsResults);
    
    const camera = new Camera(videoElement, {
        onFrame: async () => {
            await hands.send({image: videoElement});
        },
        width: 320,
        height: 240
    });
    camera.start();
}

function onHandsResults(results) {
    // Draw on the small debug canvas
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    
    if (results.multiHandLandmarks) {
        for (const landmarks of results.multiHandLandmarks) {
            drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS,
                           {color: '#00FF00', lineWidth: 2});
            drawLandmarks(canvasCtx, landmarks, {color: '#FF0000', lineWidth: 1});
        }
    }
    canvasCtx.restore();

    // Process gestures for 3D control
    processGestures(results);
}

function processGestures(results) {
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
        // Default idle state drift
        state.particleScale = 1.0;
        state.particleExpansion = 1.0;
        return;
    }

    // 1. Calculate Hand Openness for Playback Speed
    let totalOpenness = 0;
    
    results.multiHandLandmarks.forEach(landmarks => {
        const wrist = landmarks[0];
        const tips = [4, 8, 12, 16, 20];
        let handSum = 0;
        
        tips.forEach(tipIdx => {
            const tip = landmarks[tipIdx];
            const dist = Math.sqrt(
                Math.pow(tip.x - wrist.x, 2) +
                Math.pow(tip.y - wrist.y, 2)
            );
            handSum += dist;
        });
        
        totalOpenness += Math.min(Math.max(handSum / 1.5, 0), 1);
    });

    state.handOpenness = totalOpenness / results.multiHandLandmarks.length;

    // Playback Speed Logic: Fist (low openness) = Slow (0.25x), Open Hand = Play/Fast
    if (state.handOpenness < 0.2) {
        playbackMultiplier = 0.25; // Slow speed
        state.isPaused = false;
        statusEl.textContent = `Status: SLOW (Fist detected)`;
    } else {
        playbackMultiplier = 0.5 + (state.handOpenness * 1.5); // 0.5x to 2.0x speed
        state.isPaused = false;
        statusEl.textContent = `Status: PLAYING (Speed: ${playbackMultiplier.toFixed(1)}x)`;
    }

    // Hand distance scaling (tension) – only when both hands are present
    if (results.multiHandLandmarks && results.multiHandLandmarks.length === 2) {
        const wristA = results.multiHandLandmarks[0][0];
        const wristB = results.multiHandLandmarks[1][0];
        const dx = wristA.x - wristB.x;
        const dy = wristA.y - wristB.y;
        const dz = wristA.z - wristB.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz); // normalized 0‑1 range
        
        // Map distance to a reasonable scale factor (0.5‑2.0)
        const minScale = 0.5;
        const maxScale = 2.0;
        const scale = minScale + distance * (maxScale - minScale);
        
        state.particleScale = scale;
        // Use hand openness as an expansion factor (more closed → more expansion)
        state.particleExpansion = 1.0 + (1.0 - state.handOpenness) * 0.5;
    } else {
        // Reset to defaults when not both hands
        state.particleScale = 1.0;
        state.particleExpansion = 1.0;
    }
}

function updateDataVisualization(time) {
    if (magneticData.length === 0) return;

    // Use playbackMultiplier to adjust update interval
    const effectiveInterval = baseDataInterval / (playbackMultiplier || 0.001);

    if (!state.isPaused && time - lastTime > effectiveInterval) {
        const data = magneticData[currentTimeIndex];
                 
        if (data) {
            // Update UI
            valBx.textContent = data.bx ? data.bx.toFixed(2) : '--';
            valBy.textContent = data.by ? data.by.toFixed(2) : '--';
            valBz.textContent = data.bz ? data.bz.toFixed(2) : '--';
            valBt.textContent = data.bt ? data.bt.toFixed(2) : '--';
         
            // Store Bz for particle logic
            state.bzValue = data.bz || 0;
            state.btValue = data.bt || 5;
         
            // Store simulation time for clock display
            state.simTime = data.time || 0;
         
            // Visual feedback on Earth magnetosphere mesh
            // If Bz is negative (Southward IMF), reconnection happens -> more activity/redder
            if (state.bzValue < 0) {
                atmosphereMesh.material.color.setHSL(0.0, 1.0, 0.5); // Red alert
                atmosphereMesh.material.opacity = 0.3;
            } else {
                atmosphereMesh.material.color.setHSL(0.6, 0.8, 0.5); // Calm Blue
                atmosphereMesh.material.opacity = 0.1;
            }
        }

        currentTimeIndex = (currentTimeIndex + 1) % magneticData.length;
        lastTime = time;
    }
}

function animate(time) {
    requestAnimationFrame(animate);
    updateDataVisualization(time);

    // Update particle scaling based on hand distance and expansion
    if (window.particleData && state.isPaused === false) {
        const baseScale = 3 * state.particleScale * state.particleExpansion;
        // Scale length (Z-axis of the cone) based on Bt value.
        // Normalize Bt (typically 0-20 nT) to a length multiplier (e.g., 1.0 to 3.0)
        const lengthMultiplier = Math.max(1.0, Math.min(3.0, state.btValue / 5.0));
        
        window.particleData.dummy.scale.set(baseScale, baseScale, baseScale * lengthMultiplier);

        const positions = window.particleData.positions;
        const velocities = window.particleData.velocities;
        const count = positions.length / 3;
        const dummy = window.particleData.dummy;
        const mesh = window.particleData.mesh;
        const bzFactor = state.bzValue;

        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            let x = positions[i3];
            let y = positions[i3 + 1];
            let z = positions[i3 + 2];

            // Update position
            // Reduce speed to 0.25 when a fist (handOpenness near 0) is detected
            if (state.handOpenness < 0.2) {
                playbackMultiplier = 0.25;
            }
            x += velocities[i3] * playbackMultiplier * state.particleExpansion;
            y += velocities[i3 + 1] * playbackMultiplier * state.particleExpansion;
            z += velocities[i3 + 2] * playbackMultiplier * state.particleExpansion;

            const distSq = x * x + y * y + z * z;
            const dist = Math.sqrt(distSq);

            // Magnetosphere interaction: prevent particles from entering the Earth (dist < 260 approx)
            // Earth radius is 250.
            if (dist < 320) {
                // Deflection force scaled to match smaller cone size (≈33% of original)
                const sizeFactor = 0.77; // adjust deflection to 77% of original strength
                const pushStrength = (320 - dist) * 0.05 * sizeFactor;
                const nx = x / dist;
                const ny = y / dist;
                const nz = z / dist;
                
                x += nx * pushStrength;
                y += ny * pushStrength;
                z += nz * pushStrength;

                // Also deflect velocity to avoid sticking
                velocities[i3 + 1] += ny * 0.5;
                velocities[i3 + 2] += nz * 0.5;
            }

            if (x < -1000 || dist < 260 || Math.abs(y) > 800 || Math.abs(z) > 800) {
                x = 800 + Math.random() * 200;
                y = (Math.random() - 0.5) * 800;
                z = (Math.random() - 0.5) * 800;
            }

            positions[i3] = x;
            positions[i3 + 1] = y;
            positions[i3 + 2] = z;

            dummy.position.set(x, y, z);

            // Orient based on velocity + Bz influence
            // Cone points to +Y by default. We rotate X +90deg to point to Z.
            // Then we lookAt the target direction.
            
            // Simple approach: look at the next position (velocity direction)
            // Plus a vertical bias based on Bz to make them tilt up/down
            const vy = velocities[i3 + 1];
            
            // If bz < 0, particles tilt down (negative Y bias).
            // If bz > 0, particles tilt up (positive Y bias).
            // Scale bias by 0.1 for subtle effect
            const bzBias = state.bzValue * 0.1;

            dummy.lookAt(x + velocities[i3], y + vy + bzBias, z + velocities[i3 + 2]);
            dummy.rotateX(Math.PI / 2);

            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
    }

    // Rotate Earth slowly
    if (earthMesh) earthMesh.rotation.y += 0.0005;
    if (atmosphereMesh) atmosphereMesh.rotation.y += 0.0007;

    renderer.render(scene, camera);
}

function setupEventListeners() {
    const colorPicker = document.getElementById('colorPicker');
    // Set initial picker value to match the default particle color (yellow)
    colorPicker.value = '#ffff00';
    colorPicker.addEventListener('input', (e) => {
        state.baseColor.set(e.target.value);
        if (window.particleData) {
            window.particleData.mesh.material.color.set(state.baseColor);
        }
    });
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Start
init();
// Clock element update - shows simulation time
function updateClock() {
    const clockEl = document.getElementById('clock');
    if (!clockEl) return;

    // If simulation time is available, display it; otherwise fall back to real UTC time
    if (state && typeof state.simTime === 'number' && state.simTime > 0) {
        // Assume simTime is milliseconds since epoch. Convert to Date.
        // If the value is very small (e.g. relative time), treat it as seconds * 1000?
        // Based on magnetic_data.json sample "1764806400000.0", it looks like milliseconds.
        const simDate = new Date(state.simTime);
        const year = simDate.getUTCFullYear();
        const month = String(simDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(simDate.getUTCDate()).padStart(2, '0');
        const hours = String(simDate.getUTCHours()).padStart(2, '0');
        const minutes = String(simDate.getUTCMinutes()).padStart(2, '0');
        const seconds = String(simDate.getUTCSeconds()).padStart(2, '0');
        clockEl.textContent = `${year}-${month}-${day} ${hours}:${minutes}:${seconds} UTC`;
    } else {
        const now = new Date();
        const utc = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
        const year = utc.getUTCFullYear();
        const month = String(utc.getUTCMonth() + 1).padStart(2, '0');
        const day = String(utc.getUTCDate()).padStart(2, '0');
        const hours = String(utc.getUTCHours()).padStart(2, '0');
        const minutes = String(utc.getUTCMinutes()).padStart(2, '0');
        const seconds = String(utc.getUTCSeconds()).padStart(2, '0');
        clockEl.textContent = `${year}-${month}-${day} ${hours}:${minutes}:${seconds} UTC`;
    }
}
setInterval(updateClock, 1000);
updateClock();