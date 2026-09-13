import * as THREE from 'three';
import { arState } from './state.js';
import { dom } from '../ui/domElements.js';
import { setToast } from '../ui/toast.js';
import { resetDetectedPlaneGrids } from './planeDetector.js';
import { PLACEMENT_DISTANCE, AUTO_LOAD_TIMER_SECONDS } from '../config/constants.js';
import {
  resumeAudioContext,
  stopPositionalAudio,
  syncAudioToVideo
} from '../audio/audioController.js';
import { applyOrientationClasses, getEffectiveOrientation, updateUILayout } from '../ui/orientationController.js';

let uiControlsRevealTimeout = null;
let countdownInterval = null;
let startDelayTimeout = null;

export function clearUiControlsRevealTimeout() {
  if (uiControlsRevealTimeout) {
    clearTimeout(uiControlsRevealTimeout);
    uiControlsRevealTimeout = null;
  }
}

export function clearVideoStartDelay() {
  arState.isVideoCountdownActive = false;
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  if (startDelayTimeout) {
    clearTimeout(startDelayTimeout);
    startDelayTimeout = null;
  }
}

export function hideARControls() {
  arState.uiControlsVisible = false;

  const captureBtn = dom.captureBtn || document.getElementById('capture-btn');
  if (captureBtn) {
    captureBtn.classList.add('hidden');
    captureBtn.style.setProperty('display', 'none', 'important');
    captureBtn.style.setProperty('visibility', 'hidden', 'important');
    captureBtn.style.setProperty('opacity', '0', 'important');
    captureBtn.style.setProperty('pointer-events', 'none', 'important');
  }

  const infoBtn = dom.infoToggleBtn || document.getElementById('info-toggle-btn');
  if (infoBtn) {
    infoBtn.classList.add('hidden');
    infoBtn.style.setProperty('display', 'none', 'important');
    infoBtn.style.setProperty('visibility', 'hidden', 'important');
    infoBtn.style.setProperty('opacity', '0', 'important');
    infoBtn.style.setProperty('pointer-events', 'none', 'important');
  }

  const recenterBtn = dom.recenterBtn || document.getElementById('recenter-btn');
  if (recenterBtn) {
    recenterBtn.classList.add('hidden');
    recenterBtn.style.setProperty('display', 'none', 'important');
    recenterBtn.style.setProperty('visibility', 'hidden', 'important');
    recenterBtn.style.setProperty('opacity', '0', 'important');
    recenterBtn.style.setProperty('pointer-events', 'none', 'important');
  }

  const exitBtn = dom.exitArBtn || document.getElementById('exit-ar-btn');
  if (exitBtn) {
    exitBtn.classList.add('hidden');
    exitBtn.style.setProperty('display', 'none', 'important');
    exitBtn.style.setProperty('visibility', 'hidden', 'important');
    exitBtn.style.setProperty('opacity', '0', 'important');
    exitBtn.style.setProperty('pointer-events', 'none', 'important');
  }

  const topBar = document.querySelector('.top-bar') || document.querySelector('.top-actions');
  if (topBar) {
    topBar.classList.add('hidden');
    topBar.style.setProperty('display', 'none', 'important');
    topBar.style.setProperty('visibility', 'hidden', 'important');
    topBar.style.setProperty('opacity', '0', 'important');
    topBar.style.setProperty('pointer-events', 'none', 'important');
  }
}

export function revealARControls() {
  arState.uiControlsVisible = true;

  const captureBtn = dom.captureBtn || document.getElementById('capture-btn');
  if (captureBtn) {
    captureBtn.classList.remove('hidden');
    captureBtn.style.removeProperty('display');
    captureBtn.style.removeProperty('visibility');
    captureBtn.style.removeProperty('opacity');
    captureBtn.style.removeProperty('pointer-events');
  }

  const infoBtn = dom.infoToggleBtn || document.getElementById('info-toggle-btn');
  if (infoBtn) {
    infoBtn.classList.remove('hidden');
    infoBtn.style.removeProperty('display');
    infoBtn.style.removeProperty('visibility');
    infoBtn.style.removeProperty('opacity');
    infoBtn.style.removeProperty('pointer-events');
  }

  const recenterBtn = dom.recenterBtn || document.getElementById('recenter-btn');
  if (recenterBtn) {
    recenterBtn.classList.remove('hidden');
    recenterBtn.style.removeProperty('display');
    recenterBtn.style.removeProperty('visibility');
    recenterBtn.style.removeProperty('opacity');
    recenterBtn.style.removeProperty('pointer-events');
  }

  const exitBtn = dom.exitArBtn || document.getElementById('exit-ar-btn');
  if (exitBtn) {
    exitBtn.classList.remove('hidden');
    exitBtn.style.removeProperty('display');
    exitBtn.style.removeProperty('visibility');
    exitBtn.style.removeProperty('opacity');
    exitBtn.style.removeProperty('pointer-events');
  }

  const topBar = document.querySelector('.top-bar') || document.querySelector('.top-actions');
  if (topBar) {
    topBar.classList.remove('hidden');
    topBar.style.removeProperty('display');
    topBar.style.removeProperty('visibility');
    topBar.style.removeProperty('opacity');
    topBar.style.removeProperty('pointer-events');
  }

  updateUILayout(null, true);
  applyOrientationClasses(arState.currentOrientationState || getEffectiveOrientation());
}

export function resetArSessionState() {
  clearUiControlsRevealTimeout();
  clearVideoStartDelay();
  arState.arStarted = false;
  arState.isPlaced = false;
  arState.uiControlsVisible = false;
  hideARControls();
  disablePlacementListener();
  arState.lastHitPoseMatrix = null;
  arState.detectedFloorHeight = null;
  resetDetectedPlaneGrids();
  if (arState.floorGridMesh) arState.floorGridMesh.visible = false;
  if (arState.dancerGroup) {
    arState.dancerGroup.visible = false;
    arState.dancerGroup.scale.set(1, 1, 1);
  }
  const dancerVideo = arState.dancerVideo || document.getElementById('dancer-video');
  if (dancerVideo) {
    dancerVideo.pause();
    dancerVideo.currentTime = 0;
  }
  const toast = dom.toast;
  if (toast) toast.classList.add('hidden');
  stopPositionalAudio();
}

export function enablePlacementListener() {
  // Tap-to-drop feature removed: no listener attached
  arState.placementListenerAttached = false;
}

export function disablePlacementListener() {
  const canvas = dom.arCanvas;
  if (canvas && typeof arState.handlePlacementTap === 'function') {
    canvas.removeEventListener('pointerdown', arState.handlePlacementTap);
  }
  if (typeof arState.handlePlacementTap === 'function') {
    window.removeEventListener('pointerdown', arState.handlePlacementTap);
    window.removeEventListener('touchend', arState.handlePlacementTap);
  }
  arState.placementListenerAttached = false;
}

export function updateTapCoordinates(clientX, clientY) {
  if (typeof clientX === 'number' && clientX > 0 && typeof clientY === 'number' && clientY > 0) {
    arState.lastTapScreenX = clientX;
    arState.lastTapScreenY = clientY;
  }
}

export function onSelect() {
  // Tap-to-drop feature removed: no-op
}

export function handleFloorTap(screenX = null, screenY = null) {
  // Tap-to-drop feature removed: no-op
}

/**
 * Initiates an automatic 5-second countdown timer before loading and placing the object in front of the user.
 */
export function startAutoPlacementCountdown(seconds = AUTO_LOAD_TIMER_SECONDS, distance = PLACEMENT_DISTANCE) {
  clearVideoStartDelay();
  clearUiControlsRevealTimeout();
  hideARControls();

  arState.isVideoCountdownActive = true;
  arState.isPlaced = false;

  // Keep dancer hidden during the countdown
  if (arState.dancerGroup) {
    arState.dancerGroup.visible = false;
  }

  // Ensure video and audio are paused at frame 0
  const dancerVideo = arState.dancerVideo || document.getElementById('dancer-video');
  const audioEl = arState.dancerAudioEl || document.getElementById('dancer-audio');
  if (dancerVideo) {
    dancerVideo.pause();
    dancerVideo.currentTime = 0;
  }
  if (audioEl) {
    audioEl.pause();
    audioEl.currentTime = 0;
  }
  stopPositionalAudio();

  let remaining = seconds;
  setToast(`Loading object in ${remaining}s...`, true);

  countdownInterval = setInterval(() => {
    remaining -= 1;
    if (remaining > 0) {
      setToast(`Loading object in ${remaining}s...`, true);
      if (dancerVideo && !dancerVideo.paused) {
        dancerVideo.pause();
        dancerVideo.currentTime = 0;
      }
    } else {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  }, 1000);

  startDelayTimeout = setTimeout(() => {
    clearVideoStartDelay();
    if (!arState.arStarted) return;

    // Automatically load & spawn the object directly in front of the user at 5.6m distance, sitting on the floor
    spawnDancerInFrontOfCamera(distance);

    setToast('Object loaded 5.6m in front of you!', true);
    setTimeout(() => {
      dom.toast?.classList.add('hidden');
      revealARControls();
    }, 2000);
  }, seconds * 1000);
}

/**
 * Spawns the dancer object directly in front of the user camera at the specified distance (default 5.6m),
 * resting directly on the floor.
 */
export function spawnDancerInFrontOfCamera(distance = PLACEMENT_DISTANCE) {
  if (!arState.dancerGroup) return;

  // 1. Get active camera position and orientation (supporting WebXR presenting camera and standard camera)
  const renderer = arState.renderer;
  const xrCam = (renderer && renderer.xr && renderer.xr.isPresenting)
    ? renderer.xr.getCamera()
    : arState.camera;
  const activeCam = (xrCam && xrCam.cameras && xrCam.cameras.length > 0)
    ? xrCam.cameras[0]
    : (xrCam || arState.camera);

  const camPos = new THREE.Vector3();
  const forward = new THREE.Vector3(0, 0, -1);

  if (activeCam) {
    activeCam.updateMatrixWorld(true);
    activeCam.getWorldPosition(camPos);
    forward.applyQuaternion(activeCam.quaternion);
  }

  // 2. Calculate horizontal forward direction so the dancer stands upright on the floor
  const horizontal = new THREE.Vector3(forward.x, 0, forward.z).normalize();
  if (horizontal.lengthSq() < 0.001) {
    horizontal.set(0, 0, -1);
  }

  // 3. Determine floor level:
  // Use detected floor height from WebXR plane detection or hit-test, or camera-relative floor level
  let floorY;
  if (arState.detectedFloorHeight !== null && arState.detectedFloorHeight !== undefined) {
    floorY = arState.detectedFloorHeight;
  } else if (arState.lastHitPosition && arState.lastHitPosition.lengthSq() > 0) {
    floorY = arState.lastHitPosition.y;
  } else {
    // Default eye-level to floor estimation (~1.4m below device)
    floorY = camPos.y - 1.4;
  }

  // 4. Calculate target 3D coordinates exactly distance (5.6m) away from camera in front of user
  const targetX = camPos.x + horizontal.x * distance;
  const targetZ = camPos.z + horizontal.z * distance;

  // 5. Position dancer directly on the floor
  arState.dancerGroup.position.set(targetX, floorY, targetZ);
  arState.dancerGroup.userData.baseY = floorY;

  // 6. Orient the dancer to face the user camera
  const angle = Math.atan2(camPos.x - targetX, camPos.z - targetZ);
  arState.dancerGroup.userData.baseRotY = angle;
  arState.dancerGroup.rotation.set(0, angle, 0);

  // 7. Make object visible and mark placed
  arState.dancerGroup.visible = true;
  arState.isPlaced = true;
  arState.isSurfaceDetected = true;
  arState.isVideoCountdownActive = false;

  // 8. Start media playback (video and audio)
  const dancerVideo = arState.dancerVideo || document.getElementById('dancer-video');
  const audioEl = arState.dancerAudioEl || document.getElementById('dancer-audio');

  resumeAudioContext();

  if (dancerVideo) {
    dancerVideo.currentTime = 0;
    dancerVideo.play().catch((err) => console.warn('Video auto-play error:', err));
  }
  if (audioEl && arState.isAudioReady && !arState.isAudioMuted) {
    audioEl.currentTime = 0;
    audioEl.play().catch((err) => console.warn('Audio auto-play error:', err));
  }
  if (arState.isAudioReady && !arState.isAudioMuted) {
    syncAudioToVideo(true);
  }
}

export function placeDancer(customToast = 'MassKara Dancer placed in front of you', autoPlayMedia = true) {
  arState.isPlaced = true;
  arState.isSurfaceDetected = true;
  disablePlacementListener();
  clearUiControlsRevealTimeout();

  if (arState.dancerGroup) {
    arState.dancerGroup.visible = true;
  }

  if (arState.floorGridMesh) {
    arState.floorGridMesh.visible = false;
  }
  if (arState.fallbackFloorGridMesh) {
    arState.fallbackFloorGridMesh.visible = false;
  }
  dom.surfaceScannerReticle?.classList.add('hidden');

  const dancerVideo = arState.dancerVideo || document.getElementById('dancer-video');
  const audioEl = arState.dancerAudioEl || document.getElementById('dancer-audio');

  if (autoPlayMedia) {
    if (dancerVideo) {
      if (dancerVideo.paused) {
        dancerVideo.currentTime = 0;
        dancerVideo.play().catch(() => { });
      }
    }

    resumeAudioContext();
    if (audioEl) {
      if (arState.isAudioReady && !arState.isAudioMuted) {
        audioEl.play().catch(() => { });
      }
    }

    if (arState.isAudioReady && !arState.isAudioMuted) {
      if (arState.positionalAudio) {
        arState.positionalAudio.stop();
        arState.positionalAudio._progress = 0;
      }
      syncAudioToVideo(true);
    }
  }

  hideARControls();
  setToast(customToast, true);

  if (autoPlayMedia) {
    uiControlsRevealTimeout = setTimeout(() => {
      if (!arState.arStarted || !arState.isPlaced) return;
      dom.toast?.classList.add('hidden');
      revealARControls();
    }, 2000);
  }
}

export function repositionDancer() {
  clearUiControlsRevealTimeout();
  clearVideoStartDelay();
  arState.ignorePlacementUntil = performance.now() + 600;

  // Immediately re-anchor the dancer 5.6m directly in front of the camera on the floor
  spawnDancerInFrontOfCamera(PLACEMENT_DISTANCE);
  setToast('Object repositioned 5.6m in front of you', true);

  setTimeout(() => {
    dom.toast?.classList.add('hidden');
    revealARControls();
  }, 1800);
}

export function setupPlacementInputListeners() {
  window.addEventListener('pointerdown', (e) => {
    updateTapCoordinates(e.clientX, e.clientY);
  }, { passive: true, capture: true });

  window.addEventListener('touchstart', (e) => {
    if (e.touches && e.touches.length > 0) {
      updateTapCoordinates(e.touches[0].clientX, e.touches[0].clientY);
    }
    if (e.touches && e.touches.length === 2 && arState.isPlaced && arState.dancerGroup) {
      arState.initialPinchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      arState.basePinchScale = arState.currentDancerScale;
    }
  }, { passive: true, capture: true });

  window.addEventListener('touchmove', (e) => {
    if (e.touches && e.touches.length === 2 && arState.isPlaced && arState.dancerGroup && arState.initialPinchDist) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / arState.initialPinchDist;
      arState.currentDancerScale = THREE.MathUtils.clamp(arState.basePinchScale * factor, 0.4, 5.0);
      arState.dancerGroup.scale.set(arState.currentDancerScale, arState.currentDancerScale, arState.currentDancerScale);
    }
  }, { passive: true });

  window.addEventListener('touchend', (e) => {
    if (!e.touches || e.touches.length < 2) {
      arState.initialPinchDist = null;
      arState.basePinchScale = arState.currentDancerScale;
    }
  }, { passive: true });

  arState.handlePlacementTap = () => {
    // Tap-to-drop removed: no-op
  };
}
