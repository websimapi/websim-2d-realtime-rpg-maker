// --- Game State ---
export const state = {
    isPlayMode: false,
    selectedTextureUrl: null,
    selectedTileProperties: {
        walkable: true,
        teleport: false,
        targetX: 0,
        targetY: 0
    },
    currentLayer: 0,
    textures: {}, // Cache for loaded texture images: { url: Image }
    loadedChunks: new Map(), // Keep track of chunks currently loaded/rendered client-side (potentially unused now)
    camera: { x: 0, y: 0 }, // Top-left corner of the viewport in world coordinates
    mousePos: { x: 0, y: 0 }, // Mouse position relative to canvas
    viewNeedsUpdate: true // Flag to trigger redraw
};

// --- Mode Switching ---
export function togglePlayMode(domElements, renderFuncs, network) {
    state.isPlayMode = !state.isPlayMode;
    domElements.playModeToggle.textContent = state.isPlayMode ? 'Edit Mode' : 'Play Mode';
    domElements.playModeToggle.classList.toggle('play-mode-active', state.isPlayMode);
    domElements.toolbar.style.display = state.isPlayMode ? 'none' : 'flex'; // Hide toolbar in play mode
    domElements.canvas.style.cursor = state.isPlayMode ? 'none' : 'crosshair'; // Hide cursor / show crosshair
    renderFuncs.resizeCanvas(); // Adjust canvas size potentially
    renderFuncs.centerCameraOnPlayer(network.room, state.camera, domElements.canvas); // Center camera when entering play mode
    state.viewNeedsUpdate = true;
    console.log("Switched to", state.isPlayMode ? "Play Mode" : "Edit Mode");
}