import { TILE_SIZE } from './config.js';
import { state } from './state.js';
import * as dom from './dom.js';
import { room } from './network.js'; // Import room directly

export async function handleGenerateTexture(domElements, currentRoom) {
    const prompt = domElements.texturePromptInput.value.trim();
    if (!prompt) return;

    domElements.generateTextureBtn.disabled = true;
    domElements.generateTextureBtn.textContent = 'Generating...';

    try {
        console.log("Generating texture for prompt:", prompt);
        const result = await websim.imageGen({
            prompt: `${prompt}, seamless tile texture, 2D game asset`,
             // Use TILE_SIZE for generation to match usage
            width: TILE_SIZE,
            height: TILE_SIZE,
            aspect_ratio: "1:1"
        });
        console.log("Texture generated:", result.url);

        const textureId = `tex_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const newTextureData = { url: result.url, prompt: prompt };

        // Update shared room state
        const updatePayload = { textures: {} };
        updatePayload.textures[textureId] = newTextureData;
        currentRoom.updateRoomState(updatePayload); // Use passed room instance

        domElements.texturePromptInput.value = ''; // Clear prompt input
    } catch (error) {
        console.error('Error generating texture:', error);
        alert('Failed to generate texture. Please check the console for details.');
    } finally {
        domElements.generateTextureBtn.disabled = false;
        domElements.generateTextureBtn.textContent = 'Generate';
    }
}

export function loadInitialTextures() {
    const initialTextures = room.roomState?.textures || {}; // Access directly
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


export function addTextureToGallery(id, textureData) {
    if (state.textures[textureData.url]) return; // Already loaded or loading

    const img = new Image();
    img.crossOrigin = "anonymous"; // Important for canvas drawing
    img.src = textureData.url;
    state.textures[textureData.url] = img; // Add to cache in state

    const tileDiv = document.createElement('div');
    tileDiv.classList.add('texture-tile');
    tileDiv.style.backgroundImage = `url(${textureData.url})`;
    tileDiv.dataset.textureId = id;
    tileDiv.dataset.textureUrl = textureData.url;
    tileDiv.title = textureData.prompt || 'Generated Texture'; // Tooltip

    tileDiv.addEventListener('click', () => {
        selectTexture(id, textureData.url);
    });

    dom.textureGallery.appendChild(tileDiv);

     // Select the first texture added if none is selected yet
     if (!state.selectedTextureUrl) {
        selectTexture(id, textureData.url);
    }
}

export function selectTexture(id, url) {
    state.selectedTextureUrl = url;
    console.log(`Selected texture: ID=${id}, URL=${url}`);

    // Update UI to show selected texture
    document.querySelectorAll('.texture-tile').forEach(tile => {
        tile.classList.toggle('selected', tile.dataset.textureUrl === url);
    });
    // Ensure properties panel reflects the selected texture state (or reset)
    // For now, we just select the texture URL. Properties are independent.
}