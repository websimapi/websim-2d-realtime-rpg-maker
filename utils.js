import { TILE_SIZE, CHUNK_SIZE } from './config.js';
import { state } from './state.js';
import * as dom from './dom.js';

// --- Coordinate Utilities ---
export function getMouseWorldCoordinates(event) {
    const rect = dom.canvas.getBoundingClientRect();
    const canvasX = event.clientX - rect.left;
    const canvasY = event.clientY - rect.top;

    const worldX = state.camera.x + canvasX;
    const worldY = state.camera.y + canvasY;

    const tileX = Math.floor(worldX / TILE_SIZE);
    const tileY = Math.floor(worldY / TILE_SIZE);

    const chunkX = Math.floor(tileX / CHUNK_SIZE);
    const chunkY = Math.floor(tileY / CHUNK_SIZE);

    return { canvasX, canvasY, worldX, worldY, tileX, tileY, chunkX, chunkY };
}

export function getTextureIdByUrl(url, room) {
    const texturesState = room.roomState?.textures || {};
    for (const id in texturesState) {
        if (texturesState[id].url === url) {
            return id;
        }
    }
    return null;
}