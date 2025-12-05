
# Project Overview: Real‑Time Interactive 3D Particle Visualizer

## 1. Goal
Create a web‑based visualizer that:
- Renders a 3‑D particle system with **Three.js**.
- Detects **both hands** via the webcam using **MediaPipe Hands**.
- Maps hand gestures to particle system parameters:
  - **Hand openness** → playback speed (open hand = fast, fist = pause).
  - **Distance between hands** → particle scaling & expansion (hand tension).
- Provides a **color selector** to change particle colors instantly.
- Visualizes **NOAA CIRES GSM magnetospheric data** (converted from NetCDF to JSON).
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
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const velocities = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  // ...initialize arrays...
  const material = new THREE.PointsMaterial({
      size: 3,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
  });
  const particleSystem = new THREE.Points(geometry, material);
  scene.add(particleSystem);
  ```
- **Earth Model**: Simple sphere with a texture; placed at the origin.
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
   - `open hand` → fast playback, `fist` → pause (handled in UI).
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
- The same `bz` magnitude influences particle attraction/repulsion (simple velocity scaling).

### 5.5 UI Elements
| Element | Purpose |
|---------|---------|
| `#status` | Shows playback speed / pause state. |
| `#val-bx`, `#val-by`, `#val-bz`, `#val-bt` | Live data readouts. |
| `<input type="color" id="colorPicker">` | Changes particle base color instantly. |
| `<video id="cameraFeed">` | Mirrors webcam feed (semi‑transparent overlay). |

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
```

--- 

**End of Documentation**  
You can now start a fresh context by loading only `PROJECT_OVERVIEW.md`.