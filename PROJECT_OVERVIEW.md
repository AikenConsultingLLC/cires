
# Project Overview: Real‑Time Interactive 3D Particle Visualizer

## 1. Goal
Create a web‑based visualizer that:
- Renders a 3‑D particle system with **Three.js**.
- Detects **both hands** via the webcam using **MediaPipe Hands**.
- Maps hand gestures to particle system parameters:
  - **Hand openness** → playback speed (open hand = fast, fist = 0.25× speed).
  - **Distance between hands** → particle scaling & expansion (hand tension).
- Provides a **color selector** to change particle colors instantly.
- Visualizes **NOAA CIRES GSM magnetospheric data** (converted from NetCDF to JSON).
- Displays a **simulation clock** synced to the data timestamp.
- Offers a **clean, modern UI**.

---

## 2. Prerequisites
| Tool | Version | Usage |
|------|---------|-------|
| Node.js / npm | 20+ | Serve static files (e.g., `npx http-server`). |
| Python 3 | 3.9+ | Convert NetCDF to JSON (`convert_nc_to_json.py`). |
| `ncdump` | N/A | Inspect NetCDF files (used during conversion). |
| Browser | Chrome/Firefox | Must support WebGL and webcam access. |

---

## 3. File Structure
```
/ (workspace root)
├─ index.html          # HTML scaffold, loads scripts & UI
├─ style.css           # Minimal modern styling
├─ app.js              # Core Three.js + MediaPipe logic
├─ magnetic_data.json  # JSON export of NOAA CIRES GSM data
├─ PROJECT_OVERVIEW.md # This documentation file
└─ convert_nc_to_json.py # Helper script (already run)
```

---

## 4. Data Preparation
1. **Original file**: `oe_m1m_dscovr_s20251204000000_e20251204235959_p20251205020036_pub.nc`
2. Use `ncdump` to inspect the NetCDF structure.
3. Run `convert_nc_to_json.py` (already executed) which:
   - Reads the NetCDF variables (`time`, `bx`, `by`, `bz`, `bt`, …).
   - Converts them to an array of objects:
     ```json
     [
       {"time": 0, "bx": 1.2, "by": -0.5, "bz": 0.3, "bt": 5.6},
       …
     ]
     ```
   - Saves the result as `magnetic_data.json` (≈1500 records).

The JSON is loaded in **`app.js`** with `fetch('magnetic_data.json')`.

---

## 5. Core Components

### 5.1 Three.js Scene
- **Camera**: Perspective, positioned to view the Earth model.
- **Renderer**: WebGL, attached to `<canvas id="threeCanvas">`.
- **Particle System**:
  ```js
  // Use InstancedMesh to render each particle as a small 3‑D arrow (cone)
  // that points in the direction of its velocity.
  // Particles are small and translucent, with orientation influenced by bZ.
  // Updated cone size: radius 20% (0.4), height 33% (≈2.6) of original
  const arrowGeometry = new THREE.ConeGeometry(0.4, 2.6, 8);
  const arrowMaterial = new THREE.MeshBasicMaterial({
      // Default particle color (yellow) matching the GUI picker initial value
      color: 0xffff00,
      transparent: true,
      opacity: 0.6
  });
  const particleMesh = new THREE.InstancedMesh(arrowGeometry, arrowMaterial, particleCount);
  particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(particleMesh);
  ```
- **Earth Model**: Sphere textured with `visuals/2k_earth_daymap.jpg`, placed at the origin. The directional light is positioned to the right of the scene, casting shadows so the left side of the Earth appears in shadow.
- **Magnetosphere Wireframe**: Scaled sphere whose color (red/blue) reflects the sign of the current `bz` value.

### 5.2 MediaPipe Hands
```js
const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
});
hands.setOptions({
  maxNumHands: 2,
  modelComplexity: 1,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.7,
});
```
- **`onResults`** draws landmarks on a hidden canvas and forwards the result to `processGestures(results)`.

### 5.3 Gesture Processing (`processGestures`)
1. **Hand Openness** – average distance between tip and MCP of each finger.  
   - `state.handOpenness` ∈ [0,1] → `playbackMultiplier = 0.5 + 1.5 * handOpenness`.  
   - `open hand` → fast playback, `fist` → 0.25× speed (handled in UI).
2. **Two‑Hand Distance** – Euclidean distance between the wrist landmarks of both hands.  
   - Scales particle size: `state.particleScale = minScale + distance * (maxScale - minScale)`.  
   - Expansion factor: `state.particleExpansion = 1.0 + (1.0 - handOpenness) * 0.5`.  
   - When only one hand is present, defaults (`1.0`) are used.

### 5.4 Data‑Driven Magnetosphere Interaction
- In `updateDataVisualization(time)` the current `bz` value determines the wireframe color:
  ```js
  if (bz < 0) { atmosphereMesh.material.color.set(0xff0000); }
  else { atmosphereMesh.material.color.set(0x0000ff); }
  ```
- **Bt Scaling**: The total magnetic field magnitude (`bt`) scales the length of the particles (Z-axis), visually representing field intensity.
- **Magnetosphere Deflection**: Particles approaching the Earth model (< 320 units) are deflected radially and tangentially to simulate the magnetosheath flow, preventing them from clipping into the Earth.

### 5.5 UI Elements
| Element | Purpose |
|---------|---------|
| `#status` | Shows playback speed / pause state. |
| `#val-bx`, `#val-by`, `#val-bz`, `#val-bt` | Live data readouts. |
| `<input type="color" id="colorPicker">` | Changes particle base color instantly (initialized to match the default yellow particle color). |
| `<video id="cameraFeed">` | Mirrors webcam feed (semi‑transparent overlay). |
| `#clock` | Displays the current simulation date/time in UTC. |

CSS uses CSS variables for easy theming and positions the UI in the top‑right corner.

---

## 6. Running the Application

1. **Serve the folder** (any static server works):
   ```bash
   npx http-server . -p 8080
   ```
2. Open `http://localhost:8080` in a browser.
3. Grant webcam permission when prompted.
4. Use both hands in view:
   - **Open hand** → faster particle flow.
   - **Fist** → pause (status text changes).
   - **Move hands apart** → particles enlarge & expand more quickly.
5. Pick a new color with the color selector to recolor the particles instantly.
6. Observe the magnetosphere wireframe turning red (negative `bz`) or blue (positive `bz`) as the data stream advances.

---

## 7. Development Notes & Extensibility

- **Performance**: 15 000 particles run at ~60 fps on modern hardware. Reduce `particleCount` or switch to a GPU‑based shader material if needed.
- **Data Source**: Replace `magnetic_data.json` with any similarly‑structured JSON (time, bx, by, bz, bt) to visualize other datasets.
- **Gesture Mapping**: The scaling/exansion formulas are adjustable in `processGestures`. Tweaking the multipliers changes sensitivity.
- **UI Enhancements**: Additional sliders (e.g., for playback speed) can be added without touching core logic.
- **Future Features**:
  - Add a timeline scrubber to jump to specific timestamps.
  - Visualize additional parameters (e.g., solar wind density) as particle color or size.
  - Incorporate a VR/WebXR view for immersive exploration.

---

## 8. Todo List (All Completed)

```
[x] Verify existence of the specified NetCDF file or identify suitable alternative
[x] Check availability of `ncdump` and Python environment
[x] Convert NetCDF data to JSON for the web visualization
[x] Create HTML/CSS scaffold with clean UI
[x] Implement Three.js particle system
[x] Integrate MediaPipe Hands for gesture control
[x] Connect data visualization to particle system
[x] Add Earth model to the center of the scene
[x] Implement magnetosphere particle interaction (Bz dependent)
[x] Update gesture controls for playback speed (Open=Play, Fist=Pause)
[x] Adjust Earth size/color and particle color per user feedback
[x] Create project documentation (PROJECT_OVERVIEW.md)
[x] Add simulation clock to UI
[x] Implement magnetosphere particle deflection logic
[x] Scale particle length based on magnetic field magnitude (Bt)
```

--- 

**End of Documentation**  
You can now start a fresh context by loading only `PROJECT_OVERVIEW.md`.