import { state, togglePlayMode } from './state.js';
import * as dom from './dom.js';
import * as render from './render.js'; // Import render functions
import * as network from './network.js'; // Import network functions/room
import { handleGenerateTexture, selectTexture } from './textures.js';
import { updateSelectedTileProperties } from './tiles.js';
import { getMouseWorldCoordinates, getTextureIdByUrl } from './utils.js';
import { TILE_SIZE, CHUNK_SIZE, MAX_LAYERS } from './config.js';
import { checkTileCollision } from './tiles.js';

export function setupEventListeners() {
    window.addEventListener('resize', () => {
        render.resizeCanvas(dom.canvas, dom.gameWorld, state);
        state.viewNeedsUpdate = true;
    });

    dom.playModeToggle.addEventListener('click', () => togglePlayMode(dom, render, network));
    dom.generateTextureBtn.addEventListener('click', () => handleGenerateTexture(dom, network.room));
    dom.isWalkableCheckbox.addEventListener('change', () => updateSelectedTileProperties(state, dom));
    dom.isTeleportCheckbox.addEventListener('change', () => updateSelectedTileProperties(state, dom));
    dom.teleportXInput.addEventListener('change', () => updateSelectedTileProperties(state, dom));
    dom.teleportYInput.addEventListener('change', () => updateSelectedTileProperties(state, dom));
    dom.layerSelector.addEventListener('change', (e) => {
        state.currentLayer = parseInt(e.target.value, 10);
    });

    // --- Canvas Interaction ---
    dom.canvas.addEventListener('mousemove', (e) => {
        const rect = dom.canvas.getBoundingClientRect();
        state.mousePos = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
        // Trigger redraw on mouse move only in edit mode for hover effect
        if (!state.isPlayMode) {
            state.viewNeedsUpdate = true;
        }
    });

    dom.canvas.addEventListener('click', handleCanvasClick);
    dom.canvas.addEventListener('contextmenu', handleCanvasRightClick); // Prevent default context menu

    // --- Keyboard Input (for Play Mode) ---
    window.addEventListener('keydown', handleKeyDown);
}

function handleCanvasClick(event) {
    if (state.isPlayMode) return; // Don't place tiles in play mode

    const { worldX, worldY, tileX, tileY, chunkX, chunkY } = getMouseWorldCoordinates(event);

    if (!state.selectedTextureUrl) {
        alert("Please select a texture first!");
        return;
    }

    const textureId = getTextureIdByUrl(state.selectedTextureUrl, network.room);
    if (!textureId) {
        console.error("Could not find texture ID for URL:", state.selectedTextureUrl);
        return;
    }

    // Calculate tile coordinates within the chunk
    const localTileX = tileX - chunkX * CHUNK_SIZE;
    const localTileY = tileY - chunkY * CHUNK_SIZE;

    const chunkKey = `${chunkX},${chunkY}`;
    const tileKey = `${state.currentLayer},${localTileX},${localTileY}`; // Include layer in the key

    const updatePayload = { tiles: {} };
    if (!updatePayload.tiles[chunkKey]) {
        updatePayload.tiles[chunkKey] = {};
    }
    // Create a deep copy of properties to avoid reference issues
    const propertiesToSave = JSON.parse(JSON.stringify(state.selectedTileProperties));

    updatePayload.tiles[chunkKey][tileKey] = {
        textureId: textureId,
        properties: propertiesToSave
    };

    console.log(`Placing tile at Chunk: ${chunkKey}, Layer: ${state.currentLayer}, Local Coords: (${localTileX}, ${localTileY})`, updatePayload);
    network.room.updateRoomState(updatePayload);
    state.viewNeedsUpdate = true; // Trigger redraw
}

function handleCanvasRightClick(event) {
    event.preventDefault(); // Prevent browser context menu
    if (state.isPlayMode) return;

    const { worldX, worldY, tileX, tileY, chunkX, chunkY } = getMouseWorldCoordinates(event);

    // Calculate tile coordinates within the chunk
    const localTileX = tileX - chunkX * CHUNK_SIZE;
    const localTileY = tileY - chunkY * CHUNK_SIZE;

    const chunkKey = `${chunkX},${chunkY}`;
    // Iterate through layers to find the topmost tile to remove
    let tileRemoved = false;
    for (let layer = MAX_LAYERS - 1; layer >= 0; layer--) {
        const tileKey = `${layer},${localTileX},${localTileY}`;
        // Access room state via the imported room object
        const chunkData = network.room.roomState?.tiles?.[chunkKey];

        if (chunkData && chunkData[tileKey]) {
            const updatePayload = { tiles: {} };
            // Ensure the chunk key exists in the payload
            if (!updatePayload.tiles[chunkKey]) {
                updatePayload.tiles[chunkKey] = {};
            }
            updatePayload.tiles[chunkKey][tileKey] = null; // Set tile data to null to delete

            console.log(`Removing tile at Chunk: ${chunkKey}, Layer: ${layer}, Local Coords: (${localTileX}, ${localTileY})`, updatePayload);
            network.room.updateRoomState(updatePayload);
            state.viewNeedsUpdate = true; // Trigger redraw
            tileRemoved = true;
            break; // Remove only the topmost tile
        }
    }
    if (!tileRemoved) {
        console.log(`No tile found to remove at Chunk: ${chunkKey}, Coords: (${localTileX}, ${localTileY})`);
    }
}

// --- Player Movement (Play Mode) ---
function handleKeyDown(event) {
    if (!state.isPlayMode) return;

    const playerPresence = network.room.presence[network.room.clientId];
    if (!playerPresence) return;

    let dx = 0;
    let dy = 0;
    const speed = TILE_SIZE / 2; // Move half a tile per key press

    switch (event.key) {
        case 'ArrowUp': case 'w': dy = -speed; break;
        case 'ArrowDown': case 's': dy = speed; break;
        case 'ArrowLeft': case 'a': dx = -speed; break;
        case 'ArrowRight': case 'd': dx = speed; break;
        default: return; // Ignore other keys
    }

    const targetX = playerPresence.x + dx;
    const targetY = playerPresence.y + dy;

    const targetTileX = Math.floor((targetX + TILE_SIZE / 2) / TILE_SIZE); // Check center of player
    const targetTileY = Math.floor((targetY + TILE_SIZE / 2) / TILE_SIZE);

    const { canMove, isTeleport, targetTX, targetTY } = checkTileCollision(targetTileX, targetTileY, network.room);

    if (isTeleport) {
        console.log(`Teleporting player to ${targetTX}, ${targetTY}`);
        // Trigger teleport via presence update request to self
        network.room.requestPresenceUpdate(network.room.clientId, {
            type: 'teleport',
            targetX: targetTX,
            targetY: targetTY
        });
    } else if (canMove) {
        const newChunkX = Math.floor(targetX / TILE_SIZE / CHUNK_SIZE);
        const newChunkY = Math.floor(targetY / TILE_SIZE / CHUNK_SIZE);

        network.room.updatePresence({
            x: targetX,
            y: targetY,
            currentChunkX: newChunkX,
            currentChunkY: newChunkY,
        });
        render.centerCameraOnPlayer(network.room, state.camera, dom.canvas); // Keep player centered
        state.viewNeedsUpdate = true;
    }
}