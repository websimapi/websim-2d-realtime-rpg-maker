const room = new WebsimSocket();

// --- DOM Elements ---
const app = document.getElementById('app');
const toolbar = document.getElementById('toolbar');
const playModeToggle = document.getElementById('play-mode-toggle');
const textureGallery = document.getElementById('texture-gallery');
const texturePromptInput = document.getElementById('texture-prompt');
const generateTextureBtn = document.getElementById('generate-texture-btn');
const isWalkableCheckbox = document.getElementById('is-walkable');
const isTeleportCheckbox = document.getElementById('is-teleport');
const teleportTargetDiv = document.getElementById('teleport-target');
const teleportXInput = document.getElementById('teleport-x');
const teleportYInput = document.getElementById('teleport-y');
const layerSelector = document.getElementById('current-layer');
const gameWorld = document.getElementById('game-world');
const canvas = document.getElementById('game-canvas');
const playerContainer = document.getElementById('player-container');
const ctx = canvas.getContext('2d');

// --- Constants ---
const TILE_SIZE = 32; // Size of each tile in pixels
const CHUNK_SIZE = 16; // Size of each chunk in tiles (CHUNK_SIZE * CHUNK_SIZE tiles)
const MAX_LAYERS = 3; // Number of tile layers

// --- Game State ---
let isPlayMode = false;
let selectedTextureUrl = null;
let selectedTileProperties = {
    walkable: true,
    teleport: false,
    targetX: 0,
    targetY: 0
};
let currentLayer = 0;
const textures = {}; // Cache for loaded texture images: { url: Image }
const loadedChunks = new Map(); // Keep track of chunks currently loaded/rendered client-side
const camera = { x: 0, y: 0 }; // Top-left corner of the viewport in world coordinates
let mousePos = { x: 0, y: 0 }; // Mouse position relative to canvas
let viewNeedsUpdate = true; // Flag to trigger redraw


// --- Initialization ---
async function initialize() {
    await room.initialize();

    // Default presence: player position, initially centered
    room.updatePresence({
        x: 0, // World coordinates
        y: 0,
        currentChunkX: 0,
        currentChunkY: 0,
    });

    // Initialize room state if it doesn't exist
    if (!room.roomState || Object.keys(room.roomState).length === 0) {
       console.log("Initializing room state...");
       room.updateRoomState({
            textures: {}, // Shared texture gallery { id: { url: '...', prompt: '...' } }
            tiles: {}    // Tile data: { "chunkX,chunkY": { "layer,x,y": { textureId: '...', properties: {...} } } }
       });
    } else {
        // Load initial textures from room state
        loadInitialTextures();
    }

    setupEventListeners();
    subscribeToUpdates();
    resizeCanvas();
    loadInitialChunks(); // Load chunks around initial player position
    requestAnimationFrame(gameLoop); // Start the game loop

    console.log("Initialization complete. Client ID:", room.clientId);
    console.log("Initial Room State:", room.roomState);
    console.log("Initial Presence:", room.presence);
    console.log("Peers:", room.peers);
}

function setupEventListeners() {
    window.addEventListener('resize', () => {
        resizeCanvas();
        viewNeedsUpdate = true;
    });

    playModeToggle.addEventListener('click', togglePlayMode);
    generateTextureBtn.addEventListener('click', handleGenerateTexture);
    isWalkableCheckbox.addEventListener('change', updateSelectedTileProperties);
    isTeleportCheckbox.addEventListener('change', updateSelectedTileProperties);
    teleportXInput.addEventListener('change', updateSelectedTileProperties);
    teleportYInput.addEventListener('change', updateSelectedTileProperties);
    layerSelector.addEventListener('change', (e) => {
        currentLayer = parseInt(e.target.value, 10);
    });

    // --- Canvas Interaction ---
    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mousePos = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
        // Potentially update hover effects or info displays in edit mode
    });

    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('contextmenu', handleCanvasRightClick); // Prevent default context menu

    // --- Keyboard Input (for Play Mode) ---
    window.addEventListener('keydown', handleKeyDown);
}

function subscribeToUpdates() {
    room.subscribeRoomState((newState) => {
        //console.log("Room state updated:", newState);
        // Check for new textures
        if (newState.textures) {
            const currentTextureIds = Object.keys(textures);
            for (const id in newState.textures) {
                if (!currentTextureIds.includes(id)) {
                    addTextureToGallery(id, newState.textures[id]);
                }
            }
        }
         // We need to redraw if tile data changed
        viewNeedsUpdate = true;
         // Reload chunks if necessary (e.g., tile data updated)
        loadVisibleChunks();
    });

    room.subscribePresence((newPresence) => {
        //console.log("Presence updated:", newPresence);
        updatePlayerElements();
        // If our own position changed, potentially load new chunks
        if (newPresence[room.clientId]) {
             const myPresence = newPresence[room.clientId];
             const myOldPresence = room.presence[room.clientId] || {};
             if (myPresence.currentChunkX !== myOldPresence.currentChunkX || myPresence.currentChunkY !== myOldPresence.currentChunkY) {
                loadVisibleChunks(); // Load new chunks when player moves to a new one
             }
        }
        viewNeedsUpdate = true; // Player positions might have changed
    });

     room.subscribePresenceUpdateRequests((updateRequest, fromClientId) => {
        console.log("Received presence update request:", updateRequest, "from", fromClientId);
        // Handle requests like teleport triggers etc. if implemented
         const clientPresence = room.presence[room.clientId];
         if (updateRequest.type === 'teleport') {
            const { targetX, targetY } = updateRequest;
            const newChunkX = Math.floor(targetX / TILE_SIZE / CHUNK_SIZE);
            const newChunkY = Math.floor(targetY / TILE_SIZE / CHUNK_SIZE);

            room.updatePresence({
                x: targetX,
                y: targetY,
                currentChunkX: newChunkX,
                currentChunkY: newChunkY,
            });
            // Move camera instantly on teleport
            centerCameraOnPlayer();
            viewNeedsUpdate = true;
         }
    });

    room.onmessage = (event) => {
        //console.log("Received message:", event);
        // Handle custom events if needed
    };
}

// --- Mode Switching ---
function togglePlayMode() {
    isPlayMode = !isPlayMode;
    playModeToggle.textContent = isPlayMode ? 'Edit Mode' : 'Play Mode';
    playModeToggle.classList.toggle('play-mode-active', isPlayMode);
    toolbar.style.display = isPlayMode ? 'none' : 'flex'; // Hide toolbar in play mode
    canvas.style.cursor = isPlayMode ? 'none' : 'crosshair'; // Hide cursor / show crosshair
    resizeCanvas(); // Adjust canvas size potentially
    centerCameraOnPlayer(); // Center camera when entering play mode
    viewNeedsUpdate = true;
    console.log("Switched to", isPlayMode ? "Play Mode" : "Edit Mode");
}

// --- Texture Management ---
async function handleGenerateTexture() {
    const prompt = texturePromptInput.value.trim();
    if (!prompt) return;

    generateTextureBtn.disabled = true;
    generateTextureBtn.textContent = 'Generating...';

    try {
        console.log("Generating texture for prompt:", prompt);
        const result = await websim.imageGen({
            prompt: `${prompt}, seamless tile texture, 2D game asset`,
            width: TILE_SIZE * 2, // Generate slightly larger for potential scaling/cropping
            height: TILE_SIZE * 2,
            aspect_ratio: "1:1"
        });
        console.log("Texture generated:", result.url);

        const textureId = `tex_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const newTextureData = { url: result.url, prompt: prompt };

        // Update shared room state
        const updatePayload = { textures: {} };
        updatePayload.textures[textureId] = newTextureData;
        room.updateRoomState(updatePayload);

        // No need to manually add to gallery, subscribeRoomState handles it
        // addTextureToGallery(textureId, newTextureData);

        texturePromptInput.value = ''; // Clear prompt input
    } catch (error) {
        console.error('Error generating texture:', error);
        alert('Failed to generate texture. Please check the console for details.');
    } finally {
        generateTextureBtn.disabled = false;
        generateTextureBtn.textContent = 'Generate';
    }
}

function loadInitialTextures() {
    const initialTextures = room.roomState?.textures || {};
    console.log("Loading initial textures from room state:", initialTextures);
    for (const id in initialTextures) {
        addTextureToGallery(id, initialTextures[id]);
    }
     // Select the first texture by default if any exist
    const firstTextureId = Object.keys(initialTextures)[0];
    if (firstTextureId) {
        selectTexture(firstTextureId, initialTextures[firstTextureId].url);
    }
}


function addTextureToGallery(id, textureData) {
    if (textures[textureData.url]) return; // Already loaded or loading

    const img = new Image();
    img.crossOrigin = "anonymous"; // Important for canvas drawing if sourced externally
    img.src = textureData.url;
    textures[textureData.url] = img; // Add to cache

    const tileDiv = document.createElement('div');
    tileDiv.classList.add('texture-tile');
    tileDiv.style.backgroundImage = `url(${textureData.url})`;
    tileDiv.dataset.textureId = id;
    tileDiv.dataset.textureUrl = textureData.url;
    tileDiv.title = textureData.prompt || 'Generated Texture'; // Tooltip

    tileDiv.addEventListener('click', () => {
        selectTexture(id, textureData.url);
    });

    textureGallery.appendChild(tileDiv);

     // Select the first texture added if none is selected yet
     if (!selectedTextureUrl) {
        selectTexture(id, textureData.url);
    }
}

function selectTexture(id, url) {
    selectedTextureUrl = url;
    console.log(`Selected texture: ID=${id}, URL=${url}`);

    // Update UI to show selected texture
    document.querySelectorAll('.texture-tile').forEach(tile => {
        tile.classList.toggle('selected', tile.dataset.textureUrl === url);
    });
}

// --- Tile Property Management ---
function updateSelectedTileProperties() {
    selectedTileProperties.walkable = isWalkableCheckbox.checked;
    selectedTileProperties.teleport = isTeleportCheckbox.checked;
    selectedTileProperties.targetX = parseInt(teleportXInput.value, 10) || 0;
    selectedTileProperties.targetY = parseInt(teleportYInput.value, 10) || 0;

    teleportTargetDiv.style.display = isTeleportCheckbox.checked ? 'block' : 'none';
    console.log("Updated selected tile properties:", selectedTileProperties);
}

// --- Canvas Interaction ---
function handleCanvasClick(event) {
    if (isPlayMode) return; // Don't place tiles in play mode

    const { worldX, worldY, tileX, tileY, chunkX, chunkY } = getMouseWorldCoordinates(event);

    if (!selectedTextureUrl) {
        alert("Please select a texture first!");
        return;
    }

    const textureId = getTextureIdByUrl(selectedTextureUrl);
    if (!textureId) {
        console.error("Could not find texture ID for URL:", selectedTextureUrl);
        return;
    }

    // Calculate tile coordinates within the chunk
    const localTileX = tileX - chunkX * CHUNK_SIZE;
    const localTileY = tileY - chunkY * CHUNK_SIZE;

    const chunkKey = `${chunkX},${chunkY}`;
    const tileKey = `${currentLayer},${localTileX},${localTileY}`; // Include layer in the key

    const updatePayload = { tiles: {} };
    if (!updatePayload.tiles[chunkKey]) {
        updatePayload.tiles[chunkKey] = {};
    }

    updatePayload.tiles[chunkKey][tileKey] = {
        textureId: textureId,
        properties: { ...selectedTileProperties } // Store properties with the tile
    };

    console.log(`Placing tile at Chunk: ${chunkKey}, Layer: ${currentLayer}, Local Coords: (${localTileX}, ${localTileY})`, updatePayload);
    room.updateRoomState(updatePayload);
    viewNeedsUpdate = true; // Trigger redraw
}

function handleCanvasRightClick(event) {
    event.preventDefault(); // Prevent browser context menu
    if (isPlayMode) return;

    const { worldX, worldY, tileX, tileY, chunkX, chunkY } = getMouseWorldCoordinates(event);

    // Calculate tile coordinates within the chunk
    const localTileX = tileX - chunkX * CHUNK_SIZE;
    const localTileY = tileY - chunkY * CHUNK_SIZE;

    const chunkKey = `${chunkX},${chunkY}`;
    // Iterate through layers to find the topmost tile to remove
    let tileRemoved = false;
    for (let layer = MAX_LAYERS - 1; layer >= 0; layer--) {
        const tileKey = `${layer},${localTileX},${localTileY}`;
        const chunkData = room.roomState?.tiles?.[chunkKey];

        if (chunkData && chunkData[tileKey]) {
            const updatePayload = { tiles: {} };
            updatePayload.tiles[chunkKey] = {};
            updatePayload.tiles[chunkKey][tileKey] = null; // Set tile data to null to delete

            console.log(`Removing tile at Chunk: ${chunkKey}, Layer: ${layer}, Local Coords: (${localTileX}, ${localTileY})`, updatePayload);
            room.updateRoomState(updatePayload);
            viewNeedsUpdate = true; // Trigger redraw
            tileRemoved = true;
            break; // Remove only the topmost tile
        }
    }
    if (!tileRemoved) {
        console.log(`No tile found to remove at Chunk: ${chunkKey}, Coords: (${localTileX}, ${localTileY})`);
    }
}

function getMouseWorldCoordinates(event) {
    const rect = canvas.getBoundingClientRect();
    const canvasX = event.clientX - rect.left;
    const canvasY = event.clientY - rect.top;

    const worldX = camera.x + canvasX;
    const worldY = camera.y + canvasY;

    const tileX = Math.floor(worldX / TILE_SIZE);
    const tileY = Math.floor(worldY / TILE_SIZE);

    const chunkX = Math.floor(tileX / CHUNK_SIZE);
    const chunkY = Math.floor(tileY / CHUNK_SIZE);

    return { canvasX, canvasY, worldX, worldY, tileX, tileY, chunkX, chunkY };
}

function getTextureIdByUrl(url) {
    const texturesState = room.roomState?.textures || {};
    for (const id in texturesState) {
        if (texturesState[id].url === url) {
            return id;
        }
    }
    return null;
}

// --- Player Movement (Play Mode) ---
function handleKeyDown(event) {
    if (!isPlayMode) return;

    const playerPresence = room.presence[room.clientId];
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

    const { canMove, isTeleport, targetTX, targetTY } = checkTileCollision(targetTileX, targetTileY);

    if (isTeleport) {
        console.log(`Teleporting player to ${targetTX}, ${targetTY}`);
        // Trigger teleport via presence update request to self (simplest way to handle locally)
        room.requestPresenceUpdate(room.clientId, {
            type: 'teleport',
            targetX: targetTX,
            targetY: targetTY
        });
    } else if (canMove) {
        const newChunkX = Math.floor(targetX / TILE_SIZE / CHUNK_SIZE);
        const newChunkY = Math.floor(targetY / TILE_SIZE / CHUNK_SIZE);

        room.updatePresence({
            x: targetX,
            y: targetY,
            currentChunkX: newChunkX,
            currentChunkY: newChunkY,
        });
        centerCameraOnPlayer(); // Keep player centered
        viewNeedsUpdate = true;
    }
}

function checkTileCollision(tileX, tileY) {
    const chunkX = Math.floor(tileX / CHUNK_SIZE);
    const chunkY = Math.floor(tileY / CHUNK_SIZE);
    const localTileX = tileX - chunkX * CHUNK_SIZE;
    const localTileY = tileY - chunkY * CHUNK_SIZE;
    const chunkKey = `${chunkX},${chunkY}`;
    const chunkData = room.roomState?.tiles?.[chunkKey] || {};

    let isWalkable = true; // Default to walkable if no tile found (empty space)
    let isTeleport = false;
    let targetTX = 0, targetTY = 0;

    // Check all layers at this position, highest layer takes precedence
    for (let layer = MAX_LAYERS - 1; layer >= 0; layer--) {
        const tileKey = `${layer},${localTileX},${localTileY}`;
        const tileData = chunkData[tileKey];

        if (tileData && tileData.properties) {
            if (tileData.properties.teleport) {
                isTeleport = true;
                targetTX = tileData.properties.targetX !== undefined ? tileData.properties.targetX : 0;
                targetTY = tileData.properties.targetY !== undefined ? tileData.properties.targetY : 0;
                 // Teleport overrides walkability check for this specific interaction
                isWalkable = true;
                break; // Teleport found, stop checking lower layers
            }
            // If a tile exists and is explicitly not walkable, mark as blocked
            if (tileData.properties.walkable === false) {
                isWalkable = false;
                break; // Non-walkable found, stop checking lower layers
            }
            // If a walkable tile is found, ensure walkability is true
             if (tileData.properties.walkable === true) {
                isWalkable = true;
                // Don't break, a higher layer might override walkability or teleport
            }

        }
    }

    return { canMove: isWalkable, isTeleport, targetTX, targetTY };
}


// --- Rendering ---
function resizeCanvas() {
    canvas.width = gameWorld.clientWidth;
    canvas.height = gameWorld.clientHeight;
    viewNeedsUpdate = true; // Need to redraw after resize
    console.log(`Canvas resized to: ${canvas.width}x${canvas.height}`);
}

function centerCameraOnPlayer() {
    const playerPresence = room.presence[room.clientId];
    if (!playerPresence) return;

    camera.x = playerPresence.x - canvas.width / 2 + TILE_SIZE / 2;
    camera.y = playerPresence.y - canvas.height / 2 + TILE_SIZE / 2;
    viewNeedsUpdate = true;
}

function gameLoop(timestamp) {
    if (viewNeedsUpdate) {
        draw();
        viewNeedsUpdate = false;
    }
    requestAnimationFrame(gameLoop);
}

function draw() {
    //console.log("Drawing frame...");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calculate visible world boundaries
    const viewLeft = camera.x;
    const viewTop = camera.y;
    const viewRight = camera.x + canvas.width;
    const viewBottom = camera.y + canvas.height;

    // Calculate tile range to draw
    const startTileX = Math.floor(viewLeft / TILE_SIZE);
    const startTileY = Math.floor(viewTop / TILE_SIZE);
    const endTileX = Math.ceil(viewRight / TILE_SIZE);
    const endTileY = Math.ceil(viewBottom / TILE_SIZE);

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
                         const img = textures[textureInfo.url];
                        if (img && img.complete) { // Ensure image is loaded
                            const drawX = Math.floor(tileX * TILE_SIZE - camera.x);
                            const drawY = Math.floor(tileY * TILE_SIZE - camera.y);
                            ctx.drawImage(img, 0, 0, img.width, img.height, drawX, drawY, TILE_SIZE, TILE_SIZE);
                        } else if (img && !img.onload) {
                            // Start loading if not already loading
                            img.onload = () => viewNeedsUpdate = true; // Redraw when loaded
                        }
                    }
                }

                // Draw grid lines in edit mode for clarity
                if (!isPlayMode && layer === 0) { // Only draw grid on base layer
                    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
                    ctx.lineWidth = 0.5;
                    const drawX = Math.floor(tileX * TILE_SIZE - camera.x);
                    const drawY = Math.floor(tileY * TILE_SIZE - camera.y);
                    ctx.strokeRect(drawX, drawY, TILE_SIZE, TILE_SIZE);
                }
            }
        }
    }

    // Draw tile selection highlight in edit mode
    if (!isPlayMode && selectedTextureUrl) {
        const { worldX, worldY, tileX, tileY } = getMouseWorldCoordinates({clientX: mousePos.x + canvas.getBoundingClientRect().left, clientY: mousePos.y + canvas.getBoundingClientRect().top}); // Use cached mousePos
        const drawX = Math.floor(tileX * TILE_SIZE - camera.x);
        const drawY = Math.floor(tileY * TILE_SIZE - camera.y);

        // Draw a semi-transparent overlay of the selected texture
        const selectedImg = textures[selectedTextureUrl];
        if (selectedImg && selectedImg.complete) {
             ctx.globalAlpha = 0.5;
             ctx.drawImage(selectedImg, 0, 0, selectedImg.width, selectedImg.height, drawX, drawY, TILE_SIZE, TILE_SIZE);
             ctx.globalAlpha = 1.0;
        }

        // Draw border around the tile to be placed/removed
        ctx.strokeStyle = 'blue';
        ctx.lineWidth = 2;
        ctx.strokeRect(drawX + 1, drawY + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    }


    // Player rendering is handled by updatePlayerElements via DOM manipulation
}

// --- Chunk Management ---
function loadVisibleChunks() {
    const playerPresence = room.presence[room.clientId];
    const centerChunkX = playerPresence ? playerPresence.currentChunkX : 0;
    const centerChunkY = playerPresence ? playerPresence.currentChunkY : 0;

    // Determine visible chunk range based on camera/viewport
    const viewLeft = camera.x;
    const viewTop = camera.y;
    const viewRight = camera.x + canvas.width;
    const viewBottom = camera.y + canvas.height;

    const startChunkX = Math.floor(viewLeft / TILE_SIZE / CHUNK_SIZE);
    const startChunkY = Math.floor(viewTop / TILE_SIZE / CHUNK_SIZE);
    const endChunkX = Math.ceil(viewRight / TILE_SIZE / CHUNK_SIZE);
    const endChunkY = Math.ceil(viewBottom / TILE_SIZE / CHUNK_SIZE);

    // Could potentially implement smarter chunk loading/unloading here,
    // but for now, drawing just uses the global roomState.tiles directly.
    // This function primarily ensures textures for visible tiles are pre-loaded.

    const roomTextures = room.roomState?.textures || {};
    const roomTiles = room.roomState?.tiles || {};

    for (let cx = startChunkX; cx < endChunkX; cx++) {
        for (let cy = startChunkY; cy < endChunkY; cy++) {
            const chunkKey = `${cx},${cy}`;
            const chunkData = roomTiles[chunkKey];
            if (chunkData) {
                for (const tileKey in chunkData) {
                    const tile = chunkData[tileKey];
                    if (tile && tile.textureId) {
                        const textureData = roomTextures[tile.textureId];
                        if (textureData && textureData.url && !textures[textureData.url]) {
                            // Preload texture image if not already cached
                            const img = new Image();
                             img.crossOrigin = "anonymous";
                            img.src = textureData.url;
                            textures[textureData.url] = img;
                            img.onload = () => viewNeedsUpdate = true; // Redraw when texture loads
                        }
                    }
                }
            }
        }
    }
}

function loadInitialChunks() {
    // Initial load around 0,0 or player start pos if available
    loadVisibleChunks();
}


// --- Player Element Management ---
function updatePlayerElements() {
    const currentPeers = room.peers || {};
    const currentPresence = room.presence || {};
    const activePlayerIds = Object.keys(currentPresence);

    // Remove elements for disconnected players
    const playerElements = playerContainer.querySelectorAll('.player');
    playerElements.forEach(el => {
        if (!activePlayerIds.includes(el.dataset.clientId)) {
            el.remove();
        }
    });

    // Add or update elements for connected players
    for (const clientId in currentPresence) {
        const presenceData = currentPresence[clientId];
        const peerData = currentPeers[clientId];

        if (!peerData) continue; // Skip if peer data isn't available yet

        let playerEl = playerContainer.querySelector(`.player[data-client-id="${clientId}"]`);

        if (!playerEl) {
            playerEl = document.createElement('div');
            playerEl.classList.add('player');
            playerEl.dataset.clientId = clientId;

            const img = document.createElement('img');
            img.src = peerData.avatarUrl || `https://api.dicebear.com/8.x/pixel-art/svg?seed=${clientId}`; // Default avatar
            img.alt = peerData.username;
            playerEl.appendChild(img);

            const nameEl = document.createElement('div');
            nameEl.classList.add('player-name');
            nameEl.textContent = peerData.username;
            playerEl.appendChild(nameEl);

            playerContainer.appendChild(playerEl);
        }

        // Update position based on presence data, translating world coords to canvas coords
        const playerScreenX = Math.floor(presenceData.x - camera.x);
        const playerScreenY = Math.floor(presenceData.y - camera.y);

        playerEl.style.left = `${playerScreenX}px`;
        playerEl.style.top = `${playerScreenY}px`;

         // Hide player if they are off-screen (optional optimization)
         // playerEl.style.display = (playerScreenX < -TILE_SIZE || playerScreenX > canvas.width || playerScreenY < -TILE_SIZE || playerScreenY > canvas.height) ? 'none' : 'flex';
    }
}


// --- Start the application ---
initialize();