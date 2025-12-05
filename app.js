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
    particleScale: 1.0, // Scale factor for particle size based on hand distance
    particleExpansion: 1.0, // Expansion factor based on hand tension
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
    container.appendChild(renderer.domElement);

    // Earth
    createEarth();

    // Particles
    createParticleSystem();

    // Lights
    const ambientLight = new THREE.AmbientLight(0x111111);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
    sunLight.position.set(100, 50, 50).normalize();
    scene.add(sunLight);

    // Handle Window Resize
    window.addEventListener('resize', onWindowResize, false);
}

function createEarth() {
    // Larger Earth with ocean‑like color
    const geometry = new THREE.SphereGeometry(250, 32, 32);
    const material = new THREE.MeshPhongMaterial({
        color: 0x1e90ff, // DodgerBlue – resembles Earth's oceans
        specular: 0x555555,
        shininess: 30,
        transparent: true,
        opacity: 0.95
    });
    earthMesh = new THREE.Mesh(geometry, material);
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
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];
    const sizes = [];
    const velocities = [];

    const color = new THREE.Color();

    for (let i = 0; i < particleCount; i++) {
        // Start particles flowing from the sun direction (positive X mostly)
        // creating a "solar wind" effect
        const x = 500 + Math.random() * 1000;
        const y = (Math.random() - 0.5) * 1000;
        const z = (Math.random() - 0.5) * 1000;

        positions.push(x, y, z);
        
        // Flow velocity towards Earth (-x direction)
        velocities.push(-2 - Math.random() * 3); // vx
        velocities.push((Math.random() - 0.5) * 0.5); // vy
        velocities.push((Math.random() - 0.5) * 0.5); // vz

        // Yellow particles for solar‑wind visualization
        color.setHSL(0.15 + Math.random() * 0.05, 0.9, 0.6);
        colors.push(color.r, color.g, color.b);
        
        sizes.push(2 + Math.random() * 4);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
    geometry.setAttribute('velocity', new THREE.Float32BufferAttribute(velocities, 3));
    geometry.setAttribute('initialPos', new THREE.Float32BufferAttribute(positions, 3)); // For respawn logic

    const material = new THREE.PointsMaterial({
        size: 3,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.7,
        sizeAttenuation: true
    });

    particleSystem = new THREE.Points(geometry, material);
    scene.add(particleSystem);
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

    if (particleSystem && state.isPaused === false) {
        // Apply particle scaling based on hand distance and expansion
        particleSystem.material.size = 3 * state.particleScale * state.particleExpansion;

        const positions = particleSystem.geometry.attributes.position.array;
        const velocities = particleSystem.geometry.attributes.velocity.array;
        const count = positions.length / 3;

        // Bz effect: Negative Bz encourages particles to enter the magnetosphere (cusps)
        // Positive Bz deflects them more strongly (bow shock)
        const magnetosphereRadius = 180;
        const bzFactor = state.bzValue;
        const attractionStrength = bzFactor < -5 ? 0.05 : 0.001; // Stronger attraction if Bz is very negative

        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            
            let x = positions[i3];
            let y = positions[i3 + 1];
            let z = positions[i3 + 2];

            // Update position
            x += velocities[i3] * playbackMultiplier * state.particleExpansion;
            y += velocities[i3 + 1] * playbackMultiplier * state.particleExpansion;
            z += velocities[i3 + 2] * playbackMultiplier * state.particleExpansion;

            // Distance to Earth center (0,0,0)
            const distSq = x*x + y*y + z*z;
            const dist = Math.sqrt(distSq);

            // Magnetosphere Interaction
            if (dist < 400 && dist > 150) {
                if (bzFactor < 0) {
                    // Magnetic Reconnection Simulation
                    // Funnel particles into polar regions (cusps)
                    // Simple heuristic: attract towards Y axis poles if near them
                    const polarAngle = Math.abs(Math.atan2(Math.sqrt(x*x + z*z), y));
                    if (polarAngle < 0.5 || polarAngle > 2.6) {
                        // Near poles: suck in
                        x *= 0.98;
                        y *= 0.98;
                        z *= 0.98;
                        // Add glow effect or color change here if possible (expensive per particle)
                    }
                } else {
                    // Positive Bz: Strong deflection (Bow Shock protection)
                    // Push away from Earth center
                    const push = (400 - dist) * 0.002;
                    x += (x / dist) * push;
                    y += (y / dist) * push;
                    z += (z / dist) * push;
                }
            }

            // Reset if too far or hit Earth
            if (x < -1000 || dist < 155 || Math.abs(y) > 800 || Math.abs(z) > 800) {
                // Respawn at source (sun side)
                x = 800 + Math.random() * 200;
                y = (Math.random() - 0.5) * 800;
                z = (Math.random() - 0.5) * 800;
            }

            positions[i3] = x;
            positions[i3 + 1] = y;
            positions[i3 + 2] = z;
        }

        particleSystem.geometry.attributes.position.needsUpdate = true;
    }
    
    // Rotate Earth slowly
    if (earthMesh) earthMesh.rotation.y += 0.0005;
    if (atmosphereMesh) atmosphereMesh.rotation.y += 0.0007;

    renderer.render(scene, camera);
}

function setupEventListeners() {
    const colorPicker = document.getElementById('colorPicker');
    colorPicker.addEventListener('input', (e) => {
        state.baseColor.set(e.target.value);
        
        // Update all particle colors
        const colors = particleSystem.geometry.attributes.color.array;
        for (let i = 0; i < colors.length; i += 3) {
            // Add some variation back
            const hsl = {};
            state.baseColor.getHSL(hsl);
            
            const variation = Math.random() * 0.1;
            const tempColor = new THREE.Color().setHSL(hsl.h + variation, hsl.s, hsl.l);
            
            colors[i] = tempColor.r;
            colors[i + 1] = tempColor.g;
            colors[i + 2] = tempColor.b;
        }
        particleSystem.geometry.attributes.color.needsUpdate = true;
    });
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Start
init();