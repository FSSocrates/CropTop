// Global workspace parameters tracking selection, scaling, and handle interactions
const projectWorkspace = {
    selectedImageIndex: null,
    globalScale: 1.0, // Managed by Shift + Scroll
    isDraggingHandle: false,
    activeHandleType: null, // "top" or "bottom"
    startY: 0,
    initialCropValue: 0
};

// Pure framework array for real user screenshots
let uploadedPhotos = []; 
const targetDisplayWidth = 450; // Dynamic locked width constraints

/***************************************************************************
2. Entry point. Prepares global tracking listener triggers.
***************************************************************************/
function initCropTop() {
    setupGlobalEventListeners();
}

/***************************************************************************
3. Transforms coordinate systems and programmatically compiles layers into the DOM
***************************************************************************/
function renderWorkspaceLayers() {
    const viewport = document.getElementById('stitch-viewport');
    viewport.innerHTML = ''; // Fresh render loop pass

    if (uploadedPhotos.length === 0) {
        viewport.innerHTML = `
            <div class="empty-state-notice">
                <span class="material-symbols-rounded" style="font-size: 48px;">photo_library</span>
                <p>Upload screenshots to begin interactive stitching</p>
            </div>`;
        return;
    }

    uploadedPhotos.forEach((photo, index) => {
        const layerContainer = document.createElement('div');
        layerContainer.className = 'screenshot-layer-container';
        
        // Compute active visible workspace viewport box dimensions
        const computedHeight = photo.displayHeight - photo.cropTop - photo.cropBottom;
        layerContainer.style.height = `${computedHeight}px`;
        layerContainer.style.width = `${targetDisplayWidth}px`;

        // Standard user photo image background masking setup
        layerContainer.style.backgroundImage = `url(${photo.imageSource.src})`;
        layerContainer.style.backgroundSize = `${targetDisplayWidth}px auto`;
        layerContainer.style.backgroundPosition = `0px -${photo.cropTop}px`;
        layerContainer.style.backgroundRepeat = 'no-repeat';

        // Apply Inverse-Layering mechanics safely across selection modes
        if (projectWorkspace.selectedImageIndex === null) {
            layerContainer.style.zIndex = '1';
            layerContainer.style.opacity = '1.0';
        } else if (projectWorkspace.selectedImageIndex === index) {
            layerContainer.style.zIndex = '1'; // Pushed to the bottom layer
            layerContainer.style.opacity = '1.0'; // Stays crisp
            layerContainer.classList.add('selected-base-anchor');
        } else {
            layerContainer.style.zIndex = '2'; // Pulled to front layer
            layerContainer.style.opacity = '0.55'; // Turned semi-transparent stencil
            layerContainer.classList.add('screenshot-overlay-mask');
        }

        // Click interaction listener toggles layout workspace updates
        layerContainer.addEventListener('click', (event) => {
            if (projectWorkspace.selectedImageIndex === index) return;
            event.stopPropagation();
            projectWorkspace.selectedImageIndex = index;
            renderWorkspaceLayers();
        });

        viewport.appendChild(layerContainer);

        // Inject the interactive separation seam element below the image if it isn't the last photo
        if (index < uploadedPhotos.length - 1) {
            injectSeparationSeamBorder(viewport, index);
        }

        // Render dragging bar anchors only when a valid real layer is selected
        if (projectWorkspace.selectedImageIndex === index) {
            injectBoundaryBars(viewport, layerContainer, index);
        }
    });
}

/***************************************************************************
4a. Injects a click-sensitive line between screenshots to allow instant layer swapping via Shift + Click
***************************************************************************/
function injectSeparationSeamBorder(viewport, index) {
    const seamBorder = document.createElement('div');
    seamBorder.className = 'interactive-seam-border';
    
    // Check if the current environment is in an active selection layout
    if (projectWorkspace.selectedImageIndex !== null) {
        seamBorder.classList.add('active-stencil-mode');
    }

    seamBorder.addEventListener('click', (event) => {
        // If the user holds Shift while clicking the border line, swap adjacent screenshots
        if (event.shiftKey) {
            event.stopPropagation();
            
            // Execute the position array swap engine logic
            const temporaryHolder = uploadedPhotos[index];
            uploadedPhotos[index] = uploadedPhotos[index + 1];
            uploadedPhotos[index + 1] = temporaryHolder;

            // Reset current selections to avoid coordinate breakage after order alterations
            projectWorkspace.selectedImageIndex = null;
            renderWorkspaceLayers();
        }
    });

    viewport.appendChild(seamBorder);
}

/***************************************************************************
4b. Injects boundary drag handle controls tightly flush against selected layer frames
***************************************************************************/
function injectBoundaryBars(viewport, layerContainer, index) {
    // Top active boundary anchor bar
    const topBar = document.createElement('div');
    topBar.className = 'active-boundary-bar';
    topBar.style.width = `${targetDisplayWidth}px`;
    topBar.style.top = `${layerContainer.offsetTop}px`;
    topBar.addEventListener('pointerdown', (event) => startBarDrag(event, 'top', index));
    viewport.appendChild(topBar);

    // Bottom active boundary anchor bar
    const bottomBar = document.createElement('div');
    bottomBar.className = 'active-boundary-bar';
    bottomBar.style.width = `${targetDisplayWidth}px`;
    bottomBar.style.top = `${layerContainer.offsetTop + layerContainer.offsetHeight}px`;
    bottomBar.addEventListener('pointerdown', (event) => startBarDrag(event, 'bottom', index));
    viewport.appendChild(bottomBar);
}

/***************************************************************************
5. Lock workspace positioning state coordinates immediately upon clicking handles
***************************************************************************/
function startBarDrag(event, handleType, index) {
    event.stopPropagation();
    projectWorkspace.isDraggingHandle = true;
    projectWorkspace.activeHandleType = handleType;
    projectWorkspace.startY = event.clientY;
    
    const photo = uploadedPhotos[index];
    projectWorkspace.initialCropValue = handleType === 'top' ? photo.cropTop : photo.cropBottom;
    
    // NEW: Safely cache the baseline crops of the neighboring photos before movement starts
    if (handleType === 'top' && index > 0) {
        projectWorkspace.initialNeighborCrop = uploadedPhotos[index - 1].cropBottom;
    } else if (handleType === 'bottom' && index < uploadedPhotos.length - 1) {
        projectWorkspace.initialNeighborCrop = uploadedPhotos[index + 1].cropTop;
    } else {
        projectWorkspace.initialNeighborCrop = 0;
    }
    
    document.body.style.cursor = 'ns-resize';
}

/***************************************************************************
6. Orchestrates event listening parameters for file uploads, mouse dragging, and scales
***************************************************************************/
function setupGlobalEventListeners() {
    const filePicker = document.getElementById('screenshot-upload-picker');
    const uploadTrigger = document.getElementById('upload-trigger');
    const downloadTrigger = document.getElementById('download-trigger');
    const viewport = document.getElementById('stitch-viewport');

    uploadTrigger.addEventListener('click', () => filePicker.click());

    filePicker.addEventListener('change', (event) => {
        const files = Array.from(event.target.files);
        if (files.length === 0) return;

        const tempPhotosList = [];
        let loadedCounter = 0;

        files.forEach((file, fileIdx) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    tempPhotosList[fileIdx] = {
                        imageSource: img,
                        cropTop: 0,
                        cropBottom: 0,
                        originalWidth: img.width,
                        originalHeight: img.height,
                        displayHeight: (img.height * targetDisplayWidth) / img.width
                    };
                    
                    loadedCounter++;
                    if (loadedCounter === files.length) {
                        uploadedPhotos = tempPhotosList.filter(Boolean);
                        projectWorkspace.selectedImageIndex = null;
                        renderWorkspaceLayers();
                    }
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    });

    // Handle structural pointer adjustment drift movements safely without compounding runaway loops
    window.addEventListener('pointermove', (event) => {
        if (!projectWorkspace.isDraggingHandle) return;

        const currentMouseY = event.clientY;
        // Compensate drag delta calculations dynamically against the global zoom layout factor
        const deltaPixelY = (currentMouseY - projectWorkspace.startY) / projectWorkspace.globalScale;
        const activePhoto = uploadedPhotos[projectWorkspace.selectedImageIndex];

        if (projectWorkspace.activeHandleType === 'top') {
            // Absolute adjustment tracking relative to our baseline click point
            activePhoto.cropTop = projectWorkspace.initialCropValue + deltaPixelY;
            
            // FIX: Use absolute baseline tracking instead of += to prevent the image from instantly fully cropping
            if (projectWorkspace.selectedImageIndex > 0) {
                const abovePhoto = uploadedPhotos[projectWorkspace.selectedImageIndex - 1];
                abovePhoto.cropBottom = projectWorkspace.initialNeighborCrop + deltaPixelY;
            }
        } else if (projectWorkspace.activeHandleType === 'bottom') {
            // Absolute adjustment tracking relative to our baseline click point
            activePhoto.cropBottom = projectWorkspace.initialCropValue - deltaPixelY;
            
            // FIX: Use absolute baseline tracking instead of -= to prevent the image from instantly fully cropping
            if (projectWorkspace.selectedImageIndex < uploadedPhotos.length - 1) {
                const belowPhoto = uploadedPhotos[projectWorkspace.selectedImageIndex + 1];
                belowPhoto.cropTop = projectWorkspace.initialNeighborCrop - deltaPixelY;
            }
        }

        renderWorkspaceLayers();
    });

    window.addEventListener('pointerup', () => {
        if (!projectWorkspace.isDraggingHandle) return;
        projectWorkspace.isDraggingHandle = false;
        document.body.style.cursor = 'default';
    });

    // Deselect active frames cleanly when clicking onto canvas empty space backgrounds
    viewport.addEventListener('click', () => {
        projectWorkspace.selectedImageIndex = null;
        renderWorkspaceLayers();
    });

    // Shift + Mouse Wheel Canvas Zoom Engine configuration setup rules
    window.addEventListener('wheel', (event) => {
        if (event.shiftKey) {
            event.preventDefault(); 
            const zoomDirection = event.deltaY > 0 ? -0.08 : 0.08;
            projectWorkspace.globalScale = Math.max(0.4, Math.min(3.0, projectWorkspace.globalScale + zoomDirection));
            
            viewport.style.transform = `scale(${projectWorkspace.globalScale})`;
            viewport.style.transformOrigin = 'top center';
        }
    }, { passive: false });

    downloadTrigger.addEventListener('click', () => {
        if (uploadedPhotos.length === 0) return;
        compileFinalStitchedImage(uploadedPhotos);
    });
}

/***************************************************************************
7. Transforms non-destructive crop tracking logic states into unified, lossless PNG exports
***************************************************************************/
function compileFinalStitchedImage(realPhotos) {
    const masterCanvas = document.createElement("canvas");
    const masterContext = masterCanvas.getContext("2d");

    // Enforce matching dimensions across items using the original width of the first photo
    const baselineWidth = realPhotos[0].originalWidth;
    let totalCanvasHeight = 0;

    // Phase 1: Coordinate mapping loops to extract target render heights
    realPhotos.forEach(photo => {
        // Map displayed browser crop pixels back into proportional original file dimensions
        const scaleRatio = photo.originalWidth / targetDisplayWidth;
        const nativeCropTop = photo.cropTop * scaleRatio;
        const nativeCropBottom = photo.cropBottom * scaleRatio;
        
        const outputSliceHeight = photo.originalHeight - nativeCropTop - nativeCropBottom;
        if (outputSliceHeight > 0) {
            totalCanvasHeight += outputSliceHeight;
        }
    });

    masterCanvas.width = baselineWidth;
    masterCanvas.height = totalCanvasHeight;

    // Phase 2: Sequential raster paint compilation loop execution pass
    let currentYPlacement = 0;
    realPhotos.forEach(photo => {
        const scaleRatio = photo.originalWidth / targetDisplayWidth;
        const nativeCropTop = photo.cropTop * scaleRatio;
        const nativeCropBottom = photo.cropBottom * scaleRatio;
        const outputSliceHeight = photo.originalHeight - nativeCropTop - nativeCropBottom;

        if (outputSliceHeight <= 0) return;

        masterContext.drawImage(
            photo.imageSource,
            0, nativeCropTop, photo.originalWidth, outputSliceHeight, // Source bounding bounds
            0, currentYPlacement, baselineWidth, outputSliceHeight // Canvas rendering map slots
        );

        currentYPlacement += outputSliceHeight;
    });

    // Establish browser file output download stream pipelines
    const saveLink = document.createElement("a");
    saveLink.download = "croptop_stitch.png";
    saveLink.href = masterCanvas.toDataURL("image/png");
    saveLink.click();
}

// Kick off system operations upon standard browser loading
window.onload = initCropTop;
