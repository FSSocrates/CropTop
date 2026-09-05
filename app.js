/***************************************************************************
1. Variables and Global State Tracker
***************************************************************************/
const projectWorkspace = {
    selectedImageIndex: null,
    globalScale: 1.0, 
    isDraggingHandle: false,
    activeHandleType: null, 
    startY: 0,
    initialCropValue: 0,
    initialNeighborCrop: 0
};

let uploadedPhotos = []; 
const targetDisplayWidth = 450;

/***************************************************************************
2. The Initialization Hook
***************************************************************************/
function initCropTop() {
    setupGlobalEventListeners();
}

/***************************************************************************
3. Transforms coordinate systems and programmatically compiles layers into the DOM
***************************************************************************/
function renderWorkspaceLayers() {
    const viewport = document.getElementById('stitch-viewport');
    viewport.innerHTML = ''; 

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
        
        layerContainer.style.width = `${targetDisplayWidth}px`;

        // Standard user photo image background masking setup
        layerContainer.style.backgroundImage = `url(${photo.imageSource.src})`;
        layerContainer.style.backgroundSize = `${targetDisplayWidth}px auto`;
        layerContainer.style.backgroundRepeat = 'no-repeat';

        if (projectWorkspace.selectedImageIndex === null) {
            // Preview Mode: Clip the containers tightly to show the clean, permanent stitch lines
            const compiledHeight = photo.displayHeight - photo.cropTop - photo.cropBottom;
            layerContainer.style.height = `${compiledHeight}px`;
            layerContainer.style.backgroundPosition = `0px -${photo.cropTop}px`;
            layerContainer.style.transform = 'none';
            layerContainer.style.zIndex = '1';
            layerContainer.style.opacity = '1.0';
        } else if (projectWorkspace.selectedImageIndex === index) {
            // Selected Base: Stationary background anchor frame. We see it completely uncropped
            layerContainer.style.height = `${photo.displayHeight}px`;
            layerContainer.style.backgroundPosition = `0px 0px`;
            layerContainer.style.transform = 'none';
            layerContainer.style.zIndex = '1'; 
            layerContainer.style.opacity = '1.0'; 
            layerContainer.classList.add('selected-base-anchor');
        } else {
            // Stencil Overlays: Render them based on their own saved crop configurations
            const compiledHeight = photo.displayHeight - photo.cropTop - photo.cropBottom;
            layerContainer.style.height = `${compiledHeight}px`;
            layerContainer.style.backgroundPosition = `0px -${photo.cropTop}px`;
            layerContainer.style.zIndex = '2'; 
            layerContainer.style.opacity = '0.55'; 
            layerContainer.classList.add('screenshot-overlay-mask');

            // Shift calculation: The overlay sheets move smoothly to cover or reveal the base
            // based strictly on the selected photo's active top or bottom crop value displacement.
            const selectedPhoto = uploadedPhotos[projectWorkspace.selectedImageIndex];
            if (index < projectWorkspace.selectedImageIndex) {
                // Images ABOVE move down based on the selected image's cropTop parameter shift
                layerContainer.style.transform = `translateY(${selectedPhoto.cropTop}px)`;
            } else {
                // Images BELOW move up based on the selected image's cropBottom parameter shift
                layerContainer.style.transform = `translateY(-${selectedPhoto.cropBottom}px)`;
            }
        }

        layerContainer.addEventListener('click', (event) => {
            if (projectWorkspace.selectedImageIndex === index) return;
            event.stopPropagation();
            projectWorkspace.selectedImageIndex = index;
            renderWorkspaceLayers();
        });

        viewport.appendChild(layerContainer);

        if (index < uploadedPhotos.length - 1) {
            injectSeparationSeamBorder(viewport, index);
        }

        if (projectWorkspace.selectedImageIndex === index) {
            injectBoundaryBars(viewport, layerContainer, index);
        }
    });
}

/***************************************************************************
4. Separation Seam Injector & Boundary Handles
***************************************************************************/
function injectSeparationSeamBorder(viewport, index) {
    const seamBorder = document.createElement('div');
    seamBorder.className = 'interactive-seam-border';
    
    if (projectWorkspace.selectedImageIndex !== null) {
        seamBorder.classList.add('active-stencil-mode');
    }

    seamBorder.addEventListener('click', (event) => {
        if (event.shiftKey) {
            event.stopPropagation();
            
            const temporaryHolder = uploadedPhotos[index];
            uploadedPhotos[index] = uploadedPhotos[index + 1];
            uploadedPhotos[index + 1] = temporaryHolder;

            projectWorkspace.selectedImageIndex = null;
            renderWorkspaceLayers();
        }
    });

    viewport.appendChild(seamBorder);
}

function injectBoundaryBars(viewport, layerContainer, index) {
    const topBar = document.createElement('div');
    topBar.className = 'active-boundary-bar';
    topBar.style.width = `${targetDisplayWidth}px`;
    topBar.style.top = `${layerContainer.offsetTop}px`;
    topBar.addEventListener('pointerdown', (event) => startBarDrag(event, 'top', index));
    viewport.appendChild(topBar);

    const bottomBar = document.createElement('div');
    bottomBar.className = 'active-boundary-bar';
    bottomBar.style.width = `${targetDisplayWidth}px`;
    bottomBar.style.top = `${layerContainer.offsetTop + layerContainer.offsetHeight}px`;
    bottomBar.addEventListener('pointerdown', (event) => startBarDrag(event, 'bottom', index));
    viewport.appendChild(bottomBar);
}

/***************************************************************************
5. Drag Initialization State Lock
***************************************************************************/
function startBarDrag(event, handleType, index) {
    event.stopPropagation();
    projectWorkspace.isDraggingHandle = true;
    projectWorkspace.activeHandleType = handleType;
    projectWorkspace.startY = event.clientY;
    
    const photo = uploadedPhotos[index];
    projectWorkspace.initialCropValue = handleType === 'top' ? photo.cropTop : photo.cropBottom;
    
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
6. File System, Zoom, and Pointer Listeners
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

    window.addEventListener('pointermove', (event) => {
        if (!projectWorkspace.isDraggingHandle) return;

        const currentMouseY = event.clientY;
        const deltaPixelY = (currentMouseY - projectWorkspace.startY) / projectWorkspace.globalScale;
        const activePhoto = uploadedPhotos[projectWorkspace.selectedImageIndex];

        if (projectWorkspace.activeHandleType === 'top') {
            // Dragging the handle only mutates the active photo's crop boundary offset properties.
            // Neighbors are never cropped or modified; their position shifts dynamically in render.
            activePhoto.cropTop = projectWorkspace.initialCropValue + deltaPixelY;
        } else if (projectWorkspace.activeHandleType === 'bottom') {
            // Dragging the handle only mutates the active photo's crop boundary offset properties.
            activePhoto.cropBottom = projectWorkspace.initialCropValue - deltaPixelY;
        }

        renderWorkspaceLayers();
    });

    window.addEventListener('pointerup', () => {
        if (!projectWorkspace.isDraggingHandle) return;
        projectWorkspace.isDraggingHandle = false;
        document.body.style.cursor = 'default';
    });

    viewport.addEventListener('click', () => {
        projectWorkspace.selectedImageIndex = null;
        renderWorkspaceLayers();
    });

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
7. Canvas Exporter & Engine Kickoff
***************************************************************************/
function compileFinalStitchedImage(realPhotos) {
    const masterCanvas = document.createElement("canvas");
    const masterContext = masterCanvas.getContext("2d");

    const baselineWidth = realPhotos.originalWidth;
    let totalCanvasHeight = 0;

    realPhotos.forEach(photo => {
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

    let currentYPlacement = 0;
    realPhotos.forEach(photo => {
        const scaleRatio = photo.originalWidth / targetDisplayWidth;
        const nativeCropTop = photo.cropTop * scaleRatio;
        const nativeCropBottom = photo.cropBottom * scaleRatio;
        const outputSliceHeight = photo.originalHeight - nativeCropTop - nativeCropBottom;

        if (outputSliceHeight <= 0) return;

        masterContext.drawImage(
            photo.imageSource,
            0, nativeCropTop, photo.originalWidth, outputSliceHeight, 
            0, currentYPlacement, baselineWidth, outputSliceHeight 
        );

        currentYPlacement += outputSliceHeight;
    });

    const saveLink = document.createElement("a");
    saveLink.download = "croptop_stitch.png";
    saveLink.href = masterCanvas.toDataURL("image/png");
    saveLink.click();
}

window.onload = initCropTop;

