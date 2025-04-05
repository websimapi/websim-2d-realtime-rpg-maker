import { state, togglePlayMode } from './state.js';
import { loadInitialTextures, addTextureToGallery } from './textures.js';
import { loadVisibleChunks } from './chunks.js';
import { updatePlayerElements, centerCameraOnPlayer } from './render.js';
import * as dom from './dom.js';

export const room = new WebsimSocket();

export async function initializeNetwork() {
    await room.initialize();
    subscribeToUpdates(); // Setup subscriptions after room is ready
}

function subscribeToUpdates() {
    room.subscribeRoomState((newState) => {
        //console.log("Room state updated:", newState);
        // Check for new textures
        if (newState.textures) {
            const currentTextureUrls = Object.keys(state.textures);
            for (const id in newState.textures) {
                // Add if URL not already in our cache (addTextureToGallery checks this too)
                if (!currentTextureUrls.includes(newState.textures[id].url)) {
                     addTextureToGallery(id, newState.textures[id], state.textures, dom.textureGallery);
                }
            }
        }
         // We need to redraw if tile data changed
        state.viewNeedsUpdate = true;
         // Reload chunks if necessary (e.g., tile data updated)
        loadVisibleChunks(room, state);
    });

    room.subscribePresence((newPresence) => {
        //console.log("Presence updated:", newPresence);
        updatePlayerElements(room, state); // Update DOM elements
        // If our own position changed, potentially load new chunks
        const myClientId = room.clientId;
        if (newPresence[myClientId]) {
             const myPresence = newPresence[myClientId];
             // Ensure old presence exists before comparing
             const myOldPresence = (room.presence && room.presence[myClientId]) ? room.presence[myClientId] : {};
             if (myPresence.currentChunkX !== myOldPresence.currentChunkX || myPresence.currentChunkY !== myOldPresence.currentChunkY) {
                loadVisibleChunks(room, state); // Load new chunks when player moves to a new one
             }
        }
        state.viewNeedsUpdate = true; // Player positions might have changed
    });

     room.subscribePresenceUpdateRequests((updateRequest, fromClientId) => {
        console.log("Received presence update request:", updateRequest, "from", fromClientId);
        // Handle requests like teleport triggers etc.
         const clientPresence = room.presence[room.clientId];
         if (!clientPresence) return; // Safety check

         if (updateRequest.type === 'teleport') {
            const { targetX, targetY } = updateRequest;
            // Ensure target coordinates are numbers
            const validX = typeof targetX === 'number' ? targetX : clientPresence.x;
            const validY = typeof targetY === 'number' ? targetY : clientPresence.y;

            const TILE_SIZE_IMPORT = 32; // TODO: Import from config if possible here
            const CHUNK_SIZE_IMPORT = 16; // TODO: Import from config if possible here
            const newChunkX = Math.floor(validX / TILE_SIZE_IMPORT / CHUNK_SIZE_IMPORT);
            const newChunkY = Math.floor(validY / TILE_SIZE_IMPORT / CHUNK_SIZE_IMPORT);

            room.updatePresence({
                x: validX,
                y: validY,
                currentChunkX: newChunkX,
                currentChunkY: newChunkY,
            });
            // Move camera instantly on teleport
            centerCameraOnPlayer(room, state.camera, dom.canvas);
            state.viewNeedsUpdate = true;
         }
    });

    room.onmessage = (event) => {
        //console.log("Received message:", event);
        // Handle custom broadcast events if needed
    };
}

// Export room instance for use in other modules
export { room };