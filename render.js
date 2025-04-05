import { TILE_SIZE, CHUNK_SIZE, MAX_LAYERS } from './config.js';
import { state } from './state.js';
import * as dom from './dom.js';
import { room } from './network.js'; // Import room
import { getMouseWorldCoordinates } from './utils.js'; // Import utility


// --- Rendering ---
export function resizeCanvas() {
    dom.canvas.width = dom.gameWorld.clientWidth;
    dom.canvas.height = dom.gameWorld.clientHeight;
    state.viewNeedsUpdate = true; // Need to redraw after resize
    console.log(`Canvas resized to: ${dom.canvas.width}x${dom.canvas.height}`);
}

export function centerCameraOnPlayer() {
    const playerPresence = room.presence[room.clientId];
    if (!playerPresence) {
         // Optionally center on 0,0 if player doesn't exist yet
         // state.camera.x = -dom.canvas.width / 2;
         // state.camera.y = -dom.canvas.height / 2;
         return;
    }

    state.camera.x = playerPresence.x - dom.canvas.width / 2 + TILE_SIZE / 2;
    state.camera.y = playerPresence.y - dom.canvas.height / 2 + TILE_SIZE / 2;
    state.viewNeedsUpdate = true;
}

export function gameLoop(timestamp) {
    // Update player elements happens via presence subscription now
    // updatePlayerElements(room, state); // Update DOM elements based on latest presence

    if (state.viewNeedsUpdate) {
        draw();
        state.viewNeedsUpdate = false;
    }
    requestAnimationFrame(gameLoop);
}

function draw() {
    //console.log("Drawing frame...");
    dom.ctx.clearRect(0, 0, dom.canvas.width, dom.canvas.height);

    // Calculate visible world boundaries
    const viewLeft = state.camera.x;
    const viewTop = state.camera.y;
    const viewRight = state.camera.x + dom.canvas.width;
    const viewBottom = state.camera.y + dom.canvas.height;

    // Calculate tile range to draw
    const startTileX = Math.floor(viewLeft / TILE_SIZE);
    const startTileY = Math.floor(viewTop / TILE_SIZE);
    const endTileX = Math.ceil(viewRight / TILE_SIZE);
    const endTileY = Math.ceil(viewBottom / TILE_SIZE);

    // Draw Tiles
    drawTiles(startTileX, startTileY, endTileX, endTileY);

    // Draw Grid (in edit mode)
    if (!state.isPlayMode) {
        drawGrid(startTileX, startTileY, endTileX, endTileY);
    }

    // Draw Edit Mode Highlight
    if (!state.isPlayMode && state.selectedTextureUrl) {
        drawEditHighlight();
    }

    // Player rendering is handled by updatePlayerElements via DOM manipulation
     // Ensure player positions are updated based on camera before next frame if needed
     updatePlayerElementPositions();
}

function drawTiles(startTileX, startTileY, endTileX, endTileY) {
     // Iterate through layers
    for (let layer = 0; layer < MAX_LAYERS; layer++) {
        // Iterate through visible tiles
        for (let tileX = startTileX; tileX < endTileX; tileX++) {
            for (let tileY = startTileY; tileY < endTileY; tileY++) {
                const chunkX = Math.floor(tileX / CHUNK_SIZE);
                const chunkY = Math.floor(tileY / CHUNK_SIZE);
                const localTileX = tileX - chunkX * CHUNK_SIZE;
                const localTileY = tileY - chunkY * CHUNK_SIZE;

                const chunkKey = `${chunkX},${chunkY}`;
                const tileKey = `${layer},${localTileX},${localTileY}`; // Include layer

                const chunkData = room.roomState?.tiles?.[chunkKey];
                const tileData = chunkData?.[tileKey];

                if (tileData && tileData.textureId) {
                    const textureInfo = room.roomState?.textures?.[tileData.textureId];
                    if (textureInfo && textureInfo.url) {
                         const img = state.textures[textureInfo.url]; // Access textures from state
                        if (img && img.complete) { // Ensure image is loaded
                            const drawX = Math.floor(tileX * TILE_SIZE - state.camera.x);
                            const drawY = Math.floor(tileY * TILE_SIZE - state.camera.y);
                            dom.ctx.drawImage(img, 0, 0, img.width, img.height, drawX, drawY, TILE_SIZE, TILE_SIZE);
                        } else if (img && !img.onload && !img.loading) {
                             // Add flag to prevent multiple onload assignments
                             img.loading = true;
                             img.onload = () => {
                                 state.viewNeedsUpdate = true; // Redraw when loaded
                                 img.loading = false; // Reset flag
                             };
                             img.onerror = () => {
                                console.error("Failed to load texture:", img.src);
                                img.loading = false; // Reset flag
                             }
                        }
                    }
                }
            }
        }
    }
}

function drawGrid(startTileX, startTileY, endTileX, endTileY) {
    dom.ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    dom.ctx.lineWidth = 0.5;
    for (let tileX = startTileX; tileX < endTileX; tileX++) {
        for (let tileY = startTileY; tileY < endTileY; tileY++) {
             const drawX = Math.floor(tileX * TILE_SIZE - state.camera.x);
             const drawY = Math.floor(tileY * TILE_SIZE - state.camera.y);
             dom.ctx.strokeRect(drawX, drawY, TILE_SIZE, TILE_SIZE);
        }
    }
}


function drawEditHighlight() {
     // Use cached mousePos relative to canvas
     const eventLike = {
        clientX: state.mousePos.x + dom.canvas.getBoundingClientRect().left,
        clientY: state.mousePos.y + dom.canvas.getBoundingClientRect().top
    };
    const { tileX, tileY } = getMouseWorldCoordinates(eventLike);

    const drawX = Math.floor(tileX * TILE_SIZE - state.camera.x);
    const drawY = Math.floor(tileY * TILE_SIZE - state.camera.y);

    // Draw a semi-transparent overlay of the selected texture
    const selectedImg = state.textures[state.selectedTextureUrl];
    if (selectedImg && selectedImg.complete) {
         dom.ctx.globalAlpha = 0.5;
         dom.ctx.drawImage(selectedImg, 0, 0, selectedImg.width, selectedImg.height, drawX, drawY, TILE_SIZE, TILE_SIZE);
         dom.ctx.globalAlpha = 1.0;
    }

    // Draw border exactly around the tile bounds
    dom.ctx.strokeStyle = 'blue';
    dom.ctx.lineWidth = 1; // Use 1px width for finer highlight
    // Offset by 0.5 to draw crisp lines if lineWidth is 1
    dom.ctx.strokeRect(drawX + 0.5, drawY + 0.5, TILE_SIZE -1, TILE_SIZE -1);
}


// --- Player Element Management ---
export function updatePlayerElements() {
    const currentPeers = room.peers || {};
    const currentPresence = room.presence || {};
    const activePlayerIds = Object.keys(currentPresence);

    // Remove elements for disconnected players
    const playerElements = dom.playerContainer.querySelectorAll('.player');
    playerElements.forEach(el => {
        if (!activePlayerIds.includes(el.dataset.clientId)) {
            el.remove();
        }
    });

    // Add or update elements for connected players
    for (const clientId in currentPresence) {
        const presenceData = currentPresence[clientId];
        const peerData = currentPeers[clientId];

        if (!peerData || typeof presenceData.x !== 'number' || typeof presenceData.y !== 'number') {
             console.warn(`Skipping player element for ${clientId}: Missing data`, {peerData, presenceData});
             continue; // Skip if peer data or position isn't available/valid yet
        }


        let playerEl = dom.playerContainer.querySelector(`.player[data-client-id="${clientId}"]`);

        if (!playerEl) {
            playerEl = document.createElement('div');
            playerEl.classList.add('player');
            playerEl.dataset.clientId = clientId;

            const img = document.createElement('img');
             // Use avatarUrl if present, otherwise generate one
             img.src = peerData.avatarUrl || `https://api.dicebear.com/8.x/initials/svg?seed=${peerData.username || clientId}`;
            img.alt = peerData.username;
            img.onerror = () => { // Fallback if avatar fails to load
                img.src = `https://api.dicebear.com/8.x/initials/svg?seed=${peerData.username || clientId}_fallback`;
            }
            playerEl.appendChild(img);

            const nameEl = document.createElement('div');
            nameEl.classList.add('player-name');
            nameEl.textContent = peerData.username;
            playerEl.appendChild(nameEl);

            dom.playerContainer.appendChild(playerEl);
        }

         // Update position (done separately in updatePlayerElementPositions now)
        // const playerScreenX = Math.floor(presenceData.x - state.camera.x);
        // const playerScreenY = Math.floor(presenceData.y - state.camera.y);
        // playerEl.style.left = `${playerScreenX}px`;
        // playerEl.style.top = `${playerScreenY}px`;
    }
     updatePlayerElementPositions(); // Update positions after ensuring elements exist
}

// Separate function to update positions, called during draw or after element creation/update
function updatePlayerElementPositions() {
    const currentPresence = room.presence || {};
     const playerElements = dom.playerContainer.querySelectorAll('.player');

     playerElements.forEach(el => {
        const clientId = el.dataset.clientId;
        const presenceData = currentPresence[clientId];

        if (presenceData && typeof presenceData.x === 'number' && typeof presenceData.y === 'number') {
            const playerScreenX = Math.floor(presenceData.x - state.camera.x);
            const playerScreenY = Math.floor(presenceData.y - state.camera.y);

            el.style.transform = `translate(${playerScreenX}px, ${playerScreenY}px)`; // Use transform for potentially smoother updates
            // Hide player if they are way off-screen (optional optimization)
            // const margin = TILE_SIZE * 2;
            // el.style.display = (playerScreenX < -margin || playerScreenX > dom.canvas.width + margin || playerScreenY < -margin || playerScreenY > dom.canvas.height + margin) ? 'none' : 'flex';

        } else {
             // Hide element if presence data is missing or invalid
             el.style.transform = `translate(-9999px, -9999px)`; // Move off-screen
        }
     });
}