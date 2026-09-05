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
        layerContainer.dataset.index = index;
        
        layerContainer.style.width = `${targetDisplayWidth}px`;

        layerContainer.style.backgroundImage = `url(${photo.imageSource.src})`;
        layerContainer.style.backgroundSize = `${targetDisplayWidth}px auto`;
        layerContainer.style.backgroundRepeat = 'no-repeat';

        const compiledHeight = photo.displayHeight - photo.cropTop - photo.cropBottom;
        layerContainer.style.height = `${compiledHeight}px`;

        if (projectWorkspace.selectedImageIndex === null) {
            layerContainer.style.backgroundPosition = `0px -${photo.cropTop}px`;
            layerContainer.style.zIndex = '1';
            layerContainer.style.opacity = '1.0';
            layerContainer.style.marginTop = '0px';
            layerContainer.style.marginBottom = '0px';
        } else if (projectWorkspace.selectedImageIndex === index) {
            layerContainer.style.height = `${photo.displayHeight}px`;
            layerContainer.style.backgroundPosition = `0px 0px`;
            
            layerContainer.style.marginTop = `-${photo.cropTop}px`;
            layerContainer.style.marginBottom = `-${photo.cropBottom}px`;
            
            layerContainer.style.zIndex = '1'; 
            layerContainer.style.opacity = '1.0'; 
            layerContainer.classList.add('selected-base-anchor');
        } else {
            layerContainer.style.backgroundPosition = `0px -${photo.cropTop}px`;
            layerContainer.style.zIndex = '2'; 
            layerContainer.style.opacity = '0.55'; 
            layerContainer.classList.add('screenshot-overlay-mask');
            layerContainer.style.marginTop = '0px';
            layerContainer.style.marginBottom = '0px';
        }

        layerContainer.addEventListener('click', (event) => {
            if (projectWorkspace.selectedImageIndex === index) return;
            event.stopPropagation(); // Stops immediate viewport bubble triggering
            projectWorkspace.selectedImageIndex = index;
            renderWorkspaceLayers();
        });

        viewport.appendChild(layerContainer);

        if (index < uploadedPhotos.length - 1) {
            injectSeparationSeamBorder(viewport, index);
        }
    });

    // FIX: Render dragging bar anchors independently at the absolute edge position points
    if (projectWorkspace.selectedImageIndex !== null) {
        injectBoundaryBars(viewport);
    }
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

function injectBoundaryBars(viewport) {
    const activeIndex = projectWorkspace.selectedImageIndex;
    const activePhoto = uploadedPhotos[activeIndex];
    
    // Find our rendered element node track references
    const layerContainers = viewport.getElementsByClassName('screenshot-layer-container');
    let targetElement = null;
    
    for (let element of layerContainers) {
        if (parseInt(element.dataset.index) === activeIndex) {
            targetElement = element;
            break;
        }
    }
    
    if (!targetElement) return;

    // FIX: Lock handle placement coordinates directly onto the dynamic edge boundaries
    const topBarYPosition = targetElement.offsetTop + activePhoto.cropTop;
    const bottomBarYPosition = targetElement.offsetTop + activePhoto.displayHeight - activePhoto.cropBottom;

    const topBar = document.createElement('div');
    topBar.className = 'active-boundary-bar';
    topBar.style.width = `${targetDisplayWidth}px`;
    topBar.style.top = `${topBarYPosition}px`;
    topBar.addEventListener('pointerdown', (event) => startBarDrag(event, 'top', activeIndex));
    viewport.appendChild(topBar);

    const bottomBar = document.createElement('div');
    bottomBar.className = 'active-boundary-bar';
    bottomBar.style.width = `${targetDisplayWidth}px`;
    bottomBar.style.top = `${bottomBarYPosition}px`;
    bottomBar.addEventListener('pointerdown', (event) => startBarDrag(event, 'bottom', activeIndex));
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
    // Select the universal scrolling window block
    const zoomWrapper = document.querySelector('.zoom-viewport-wrapper');

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
            activePhoto.cropTop = projectWorkspace.initialCropValue + deltaPixelY;
        } else if (projectWorkspace.activeHandleType === 'bottom') {
            activePhoto.cropBottom = projectWorkspace.initialCropValue - deltaPixelY;
        }

        renderWorkspaceLayers();
    });

    window.addEventListener('pointerup', () => {
        if (!projectWorkspace.isDraggingHandle) return;
        projectWorkspace.isDraggingHandle = false;
        document.body.style.cursor = 'default';
    });

    // FIX: Catch deselection clicks on the zoom container frame to prevent layer target obstruction
    zoomWrapper.addEventListener('click', (event) => {
        // If clicking the workspace canvas layout shell backdrop, deselect cleanly
        if (event.target === zoomWrapper || event.target === viewport) {
            projectWorkspace.selectedImageIndex = null;
            renderWorkspaceLayers();
        }
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

