import { initializeNetwork, room } from './network.js';
import { setupEventListeners } from './input.js';
import { loadInitialTextures } from './textures.js';
import { resizeCanvas, gameLoop, centerCameraOnPlayer } from './render.js';
import { loadInitialChunks } from './chunks.js';
import { state } from './state.js';
import * as dom from './dom.js'; // Ensure DOM elements are accessible if needed directly

// --- Initialization ---
async function initialize() {
    await initializeNetwork(); // Initialize network and room first

    // Default presence: player position, initially centered
    room.updatePresence({
        x: 0, // World coordinates
        y: 0,
        currentChunkX: 0,
        currentChunkY: 0,
    });

    // Initialize room state if it doesn't exist
    // Note: Room state checks might be better inside network.js after initialize
    if (!room.roomState || Object.keys(room.roomState).length === 0) {
       console.log("Initializing room state...");
       room.updateRoomState({
            textures: {}, // Shared texture gallery { id: { url: '...', prompt: '...' } }
            tiles: {}    // Tile data: { "chunkX,chunkY": { "layer,x,y": { textureId: '...', properties: {...} } } }
       });
    } else {
        // Load initial textures from existing room state
        loadInitialTextures();
    }

    setupEventListeners(); // Setup input listeners
    resizeCanvas(); // Initial canvas size
    loadInitialChunks(); // Load chunks around initial position
    centerCameraOnPlayer(); // Center camera initially if player exists
    requestAnimationFrame(gameLoop); // Start the game loop

    console.log("Initialization complete. Client ID:", room.clientId);
    console.log("Initial Room State:", room.roomState);
    console.log("Initial Presence:", room.presence);
    console.log("Peers:", room.peers);
}

// --- Start the application ---
initialize();

// Expose things globally that might be needed for debugging or extensions
window.dev = {
    room,
    state,
    dom
};