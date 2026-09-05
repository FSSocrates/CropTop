// Global workspace parameters tracking selection, scaling, and handle interactions
const projectWorkspace = {
    selectedImageIndex: null,
    globalScale: 1.0,
    isDraggingHandle: false,
    activeHandleType: null, // Track if pulling the "top" or "bottom" boundary bar
    startY: 0,
    initialCropValue: 0
};

// State model representing your uploaded photos array
// We keep explicit track of top and bottom cuts for non-destructive masking
const uploadedPhotos = [];

/**
 * Initializes the app and injects mock image files for immediate workspace preview
 */
function initCropTop() {
    // Creating two temporary image containers to verify your UI layers immediately
    const mockImage1 = {
        element: document.createElement('div'),
        cropTop: 0,
        cropBottom: 0,
        originalHeight: 400
    };
    
    const mockImage2 = {
        element: document.createElement('div'),
        cropTop: 0,
        cropBottom: 0,
        originalHeight: 400
    };

    uploadedPhotos.push(mockImage1, mockImage2);
    renderWorkspaceLayers();
    setupGlobalEventListeners();
}

/**
 * Programmatically builds the interactive stack inside the viewport container
 */
function renderWorkspaceLayers() {
    const viewport = document.getElementById('stitch-viewport');
    viewport.innerHTML = ''; // Fresh render pass

    uploadedPhotos.forEach((photo, index) => {
        // Create the core structural crop window box
        const layerContainer = document.createElement('div');
        layerContainer.className = 'screenshot-layer-container';
        
        // Define dynamic styles using your custom crop tracking variables
        const computedHeight = photo.originalHeight - photo.cropTop - photo.cropBottom;
        layerContainer.style.height = `${computedHeight}px`;

        // Apply interactive layers based on your inverse-layering logic
        if (projectWorkspace.selectedImageIndex === null) {
            // Default View: Standard unified stitched presentation
            layerContainer.style.zIndex = '1';
            layerContainer.style.opacity = '1.0';
        } else if (projectWorkspace.selectedImageIndex === index) {
            // Active Selection View: Push to the bottom, keep full opacity, freeze positioning
            layerContainer.style.zIndex = '1';
            layerContainer.style.opacity = '1.0';
            layerContainer.classList.add('selected-base-anchor');
        } else {
            // Context Shield View: Bring to front, make semi-transparent to act as a stencil
            layerContainer.style.zIndex = '2';
            layerContainer.style.opacity = '0.6';
            layerContainer.classList.add('screenshot-overlay-mask');
        }

        // Mock background color to visualize the layers before file uploading is wired up
        layerContainer.style.backgroundColor = index % 2 === 0 ? '#3a3055' : '#2c4055';
        layerContainer.style.width = '360px'; // Equal width constraints
        layerContainer.style.display = 'flex';
        layerContainer.style.alignItems = 'center';
        layerContainer.style.justifyContent = 'center';
        layerContainer.innerText = `Screenshot Layer ${index + 1}`;

        // Tap/Click to Select an Image Layer
        layerContainer.addEventListener('click', (event) => {
            if (projectWorkspace.selectedImageIndex === index) return;
            event.stopPropagation();
            projectWorkspace.selectedImageIndex = index;
            renderWorkspaceLayers(); // Update layers and borders instantly
        });

        viewport.appendChild(layerContainer);

        // Inject Active Boundary Interaction Bars ONLY around the selected layer
        if (projectWorkspace.selectedImageIndex === index) {
            injectBoundaryBars(viewport, layerContainer, index);
        }
    });
}

/**
 * Creates and appends the dedicated boundary handle strips around the active layer
 */
function injectBoundaryBars(viewport, layerContainer, index) {
    // Top boundary bar
    const topBar = document.createElement('div');
    topBar.className = 'active-boundary-bar top-handle';
    topBar.style.top = `${layerContainer.offsetTop}px`;
    topBar.addEventListener('pointerdown', (event) => startBarDrag(event, 'top', index));
    viewport.appendChild(topBar);

    // Bottom boundary bar
    const bottomBar = document.createElement('div');
    bottomBar.className = 'active-boundary-bar bottom-handle';
    bottomBar.style.top = `${layerContainer.offsetTop + layerContainer.offsetHeight}px`;
    bottomBar.addEventListener('pointerdown', (event) => startBarDrag(event, 'bottom', index));
    viewport.appendChild(bottomBar);
}

/**
 * Capture baseline coordinate values when clicking a boundary bar handle
 */
function startBarDrag(event, handleType, index) {
    event.stopPropagation();
    projectWorkspace.isDraggingHandle = true;
    projectWorkspace.activeHandleType = handleType;
    projectWorkspace.startY = event.clientY;
    
    const photo = uploadedPhotos[index];
    projectWorkspace.initialCropValue = handleType === 'top' ? photo.cropTop : photo.cropBottom;
    
    document.body.style.cursor = 'ns-resize'; // Show physical slider indicator
}

/**
 * Listens for global interaction mouse movements to recalculate boundary shifts
 */
function setupGlobalEventListeners() {
    window.addEventListener('pointermove', (event) => {
        if (!projectWorkspace.isDraggingHandle) return;

        const currentMouseY = event.clientY;
        const deltaPixelY = currentMouseY - projectWorkspace.startY;
        const activePhoto = uploadedPhotos[projectWorkspace.selectedImageIndex];

        if (projectWorkspace.activeHandleType === 'top') {
            // Pulling the top handle DOWN cuts into the selected image (increases top crop)
            activePhoto.cropTop = projectWorkspace.initialCropValue + deltaPixelY;
            
            // Simultaneously pull the bottom edge of the image ABOVE it to keep the gap tightly shut
            if (projectWorkspace.selectedImageIndex > 0) {
                const abovePhoto = uploadedPhotos[projectWorkspace.selectedImageIndex - 1];
                abovePhoto.cropBottom += deltaPixelY;
            }
        } else if (projectWorkspace.activeHandleType === 'bottom') {
            // Pulling the bottom handle UP cuts into the selected image (increases bottom crop)
            activePhoto.cropBottom = projectWorkspace.initialCropValue - deltaPixelY;
            
            // Simultaneously shift the top edge of the image BELOW it
            if (projectWorkspace.selectedImageIndex < uploadedPhotos.length - 1) {
                const belowPhoto = uploadedPhotos[projectWorkspace.selectedImageIndex + 1];
                belowPhoto.cropTop -= deltaPixelY;
            }
        }

        renderWorkspaceLayers();
    });

    window.addEventListener('pointerup', () => {
        if (!projectWorkspace.isDraggingHandle) return;
        projectWorkspace.isDraggingHandle = false;
        document.body.style.cursor = 'default';
    });

    // Tap the empty viewport background space to deselect and view final stitch
    document.getElementById('stitch-viewport').addEventListener('click', () => {
        projectWorkspace.selectedImageIndex = null;
        renderWorkspaceLayers();
    });
}

// Fire up the workspace engine configuration
window.onload = initCropTop;
