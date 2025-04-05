import { TILE_SIZE, CHUNK_SIZE } from './config.js';
import { state } from './state.js';
import * as dom from './dom.js';
import { room } from './network.js'; // Import room


// --- Chunk Management ---
export function loadVisibleChunks() {
    const playerPresence = room.presence[room.clientId];
    // Default to chunk 0,0 if player presence doesn't exist yet
    const centerChunkX = playerPresence ? playerPresence.currentChunkX : 0;
    const centerChunkY = playerPresence ? playerPresence.currentChunkY : 0;


    // Determine visible chunk range based on camera/viewport
    const viewLeft = state.camera.x;
    const viewTop = state.camera.y;
    const viewRight = state.camera.x + dom.canvas.width;
    const viewBottom = state.camera.y + dom.canvas.height;

    // Calculate chunk range buffer around viewport
    const buffer = 1; // Load 1 chunk beyond viewport edges
    const startChunkX = Math.floor(viewLeft / TILE_SIZE / CHUNK_SIZE) - buffer;
    const startChunkY = Math.floor(viewTop / TILE_SIZE / CHUNK_SIZE) - buffer;
    const endChunkX = Math.ceil(viewRight / TILE_SIZE / CHUNK_SIZE) + buffer;
    const endChunkY = Math.ceil(viewBottom / TILE_SIZE / CHUNK_SIZE) + buffer;


    // Preload textures for visible tiles.
    // Actual chunk data fetching isn't needed here as roomState holds all tile data.
    // This primarily ensures texture Images are created and start loading.
    const roomTextures = room.roomState?.textures || {};
    const roomTiles = room.roomState?.tiles || {};

    let texturesPreloaded = 0;
    for (let cx = startChunkX; cx < endChunkX; cx++) {
        for (let cy = startChunkY; cy < endChunkY; cy++) {
            const chunkKey = `${cx},${cy}`;
            const chunkData = roomTiles[chunkKey];
            if (chunkData) {
                for (const tileKey in chunkData) {
                    const tile = chunkData[tileKey];
                    if (tile && tile.textureId) {
                        const textureData = roomTextures[tile.textureId];
                        // Check if texture exists in room state AND not already cached/loading in local state
                        if (textureData && textureData.url && !state.textures[textureData.url]) {
                            // Preload texture image if not already cached
                            const img = new Image();
                            img.crossOrigin = "anonymous";
                            img.src = textureData.url;
                            state.textures[textureData.url] = img; // Add to local cache
                            texturesPreloaded++;
                            img.onload = () => state.viewNeedsUpdate = true; // Redraw when texture loads
                            img.onerror = () => console.error("Failed to preload texture:", img.src);
                        }
                    }
                }
            }
        }
    }
    if (texturesPreloaded > 0) console.log(`Preloading ${texturesPreloaded} textures for visible chunks.`);
}

export function loadInitialChunks() {
    // Initial load centered around 0,0 or wherever the camera starts
    loadVisibleChunks();
}