import { TILE_SIZE, CHUNK_SIZE, MAX_LAYERS } from './config.js';

// --- Tile Property Management ---
export function updateSelectedTileProperties(state, domElements) {
    state.selectedTileProperties.walkable = domElements.isWalkableCheckbox.checked;
    state.selectedTileProperties.teleport = domElements.isTeleportCheckbox.checked;
    // Ensure values are numbers, default to 0 if parsing fails
    state.selectedTileProperties.targetX = parseInt(domElements.teleportXInput.value, 10) || 0;
    state.selectedTileProperties.targetY = parseInt(domElements.teleportYInput.value, 10) || 0;

    domElements.teleportTargetDiv.style.display = domElements.isTeleportCheckbox.checked ? 'block' : 'none';
    console.log("Updated selected tile properties:", state.selectedTileProperties);
}


// --- Collision Detection ---
export function checkTileCollision(tileX, tileY, room) {
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
             // Check teleport first, as it overrides walkability for interaction
            if (tileData.properties.teleport === true) { // Explicit check for boolean true
                isTeleport = true;
                // Use || 0 to default if undefined/null/NaN etc.
                targetTX = tileData.properties.targetX || 0;
                targetTY = tileData.properties.targetY || 0;
                isWalkable = true; // Can always 'walk' onto a teleport tile to trigger it
                console.log(`Tile ${tileX},${tileY} (Layer ${layer}) is TELEPORT to ${targetTX},${targetTY}`);
                break; // Teleport found, stop checking lower layers
            }
            // If a tile exists and is explicitly not walkable, mark as blocked
             if (tileData.properties.walkable === false) { // Explicit check for boolean false
                isWalkable = false;
                console.log(`Tile ${tileX},${tileY} (Layer ${layer}) is NOT walkable.`);
                break; // Non-walkable found, stop checking lower layers
            }
            // If a tile exists and is explicitly walkable, ensure walkability is true
            // (This handles cases where default might be false or overridden by lower layers if logic changes)
             if (tileData.properties.walkable === true) { // Explicit check for boolean true
                 isWalkable = true;
                 console.log(`Tile ${tileX},${tileY} (Layer ${layer}) is walkable.`);
                // Don't break yet, a higher layer might still be non-walkable or teleport
            }
            // If properties exist but walkable/teleport are undefined/null, treat as default walkable for that layer
            else if (tileData.properties.walkable === undefined && tileData.properties.teleport === undefined) {
                isWalkable = true; // Assume walkable if properties exist but don't specify otherwise
            }
        }
        // If no tileData at this layer, continue checking lower layers
    }
     console.log(`Final check for ${tileX},${tileY}: Walkable=${isWalkable}, Teleport=${isTeleport}`);
    return { canMove: isWalkable, isTeleport, targetTX, targetTY };
}