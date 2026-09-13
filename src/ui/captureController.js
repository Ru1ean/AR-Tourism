import * as THREE from 'three';
import { arState } from '../ar/state.js';
import { dom, $ } from './domElements.js';
import { setToast } from './toast.js';
import { getCameraBackgroundMesh } from '../shaders/backgroundShader.js';

/**
 * Ensures that a video element has decoded frames and valid dimensions before drawing to canvas
 */
async function ensureVideoFrameReady(video, maxWaitMs = 1500) {
  if (!video) return false;
  if (video.videoWidth > 0 && video.videoHeight > 0 && !video.paused) {
    return true;
  }

  return new Promise((resolve) => {
    let finished = false;
    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        resolve(video.videoWidth > 0 && video.videoHeight > 0);
      }
    }, maxWaitMs);

    const onReady = () => {
      if (!finished && video.videoWidth > 0 && video.videoHeight > 0) {
        finished = true;
        clearTimeout(timer);
        resolve(true);
      }
    };

    video.addEventListener('loadeddata', onReady, { once: true });
    video.addEventListener('canplay', onReady, { once: true });
    video.addEventListener('playing', onReady, { once: true });

    video.play().then(onReady).catch(() => {});

    // Polling interval in case events already fired
    const interval = setInterval(() => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        clearInterval(interval);
        onReady();
      }
    }, 40);
    setTimeout(() => clearInterval(interval), maxWaitMs);
  });
}

export function requestARSnapshot() {
  return new Promise((resolve, reject) => {
    arState.isCaptureRequested = true;
    arState.capturePromiseResolver = { resolve, reject, timestamp: performance.now() };
    setTimeout(() => {
      if (arState.isCaptureRequested && arState.capturePromiseResolver) {
        arState.capturePromiseResolver.reject(new Error('Capture timeout'));
        arState.isCaptureRequested = false;
        arState.capturePromiseResolver = null;
      }
    }, 5000);
  });
}

export async function executeCaptureFrame(frame) {
  const resolver = arState.capturePromiseResolver;
  arState.isCaptureRequested = false;
  arState.capturePromiseResolver = null;
  if (!resolver) return;

  const renderer = arState.renderer;
  const scene = arState.scene;
  const camera = arState.camera;

  try {
    const W = Math.min(Math.round(window.innerWidth * (window.devicePixelRatio || 1)), 1920);
    const H = Math.min(Math.round(window.innerHeight * (window.devicePixelRatio || 1)), 1920);

    if (!arState.captureRenderTarget || arState.captureRenderTarget.width !== W || arState.captureRenderTarget.height !== H) {
      if (arState.captureRenderTarget) arState.captureRenderTarget.dispose();
      arState.captureRenderTarget = new THREE.WebGLRenderTarget(W, H, {
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        colorSpace: THREE.NoColorSpace
      });
    }

    const prevRenderTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(arState.captureRenderTarget);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();

    // 1. Check if WebXR raw camera texture is available via XRWebGLBinding
    let hasCameraBg = false;
    if (renderer.xr && renderer.xr.isPresenting) {
      try {
        const session = renderer.xr.getSession();
        const gl = renderer.getContext();
        const binding = (typeof renderer.xr.getBinding === 'function' ? renderer.xr.getBinding() : null) ||
          (typeof XRWebGLBinding !== 'undefined' && session ? new XRWebGLBinding(session, gl) : null);
        const refSpace = renderer.xr.getReferenceSpace();
        const pose = frame && refSpace ? frame.getViewerPose(refSpace) : null;

        let glCameraImage = null;
        let xrCam = null;

        if (pose && pose.views && pose.views.length > 0) {
          xrCam = pose.views[0].camera;
          if (binding && xrCam && typeof binding.getCameraImage === 'function') {
            try {
              glCameraImage = binding.getCameraImage(xrCam);
            } catch (e) {
              console.warn('[Capture] getCameraImage failed:', e);
            }
          }
        }

        let cameraTex = null;
        if (glCameraImage) {
          cameraTex = new THREE.ExternalTexture(glCameraImage);
        } else if (xrCam && typeof renderer.xr.getCameraTexture === 'function') {
          cameraTex = renderer.xr.getCameraTexture(xrCam);
        }

        if (cameraTex) {
          const { scene: bgScene, mat: bgMat } = getCameraBackgroundMesh();
          bgMat.uniforms.map.value = cameraTex;
          cameraTex.needsUpdate = true;
          const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
          renderer.render(bgScene, orthoCam);
          hasCameraBg = true;
        }
      } catch (xrErr) {
        console.warn('[Capture] WebXR camera texture probe:', xrErr);
      }
    }

    // 2. Render 3D Scene on top with alpha transparency preserved
    const xrCam = (renderer.xr && renderer.xr.isPresenting) ? renderer.xr.getCamera() : camera;
    const activeCam = (xrCam && xrCam.cameras && xrCam.cameras.length > 0) ? xrCam.cameras[0] : (xrCam || camera);

    renderer.autoClear = !hasCameraBg;
    renderer.render(scene, activeCam);
    renderer.autoClear = true;

    // 3. Read pixel buffer from render target
    const pixelBuffer = new Uint8Array(W * H * 4);
    renderer.readRenderTargetPixels(arState.captureRenderTarget, 0, 0, W, H, pixelBuffer);
    renderer.setRenderTarget(prevRenderTarget);

    // 4. Create 2D canvas of the 3D scene (with vertical flip from WebGL)
    const dancerCanvas = document.createElement('canvas');
    dancerCanvas.width = W;
    dancerCanvas.height = H;
    const dCtx = dancerCanvas.getContext('2d');
    const imgData = dCtx.createImageData(W, H);
    const data = imgData.data;

    for (let y = 0; y < H; y++) {
      const srcY = H - 1 - y;
      const srcOffset = srcY * W * 4;
      const dstOffset = y * W * 4;
      data.set(pixelBuffer.subarray(srcOffset, srcOffset + W * 4), dstOffset);
    }
    dCtx.putImageData(imgData, 0, 0);

    // 5. Composite camera surroundings background with transparent 3D scene
    const outCanvas = document.createElement('canvas');
    outCanvas.width = W;
    outCanvas.height = H;
    const ctx = outCanvas.getContext('2d');

    if (hasCameraBg) {
      // Camera texture was already rendered into the WebGL render target beneath the dancer
      ctx.drawImage(dancerCanvas, 0, 0, W, H);
    } else {
      // Base layer: draw live camera video feed from arCameraFeed or getUserMedia
      let cameraVideo = dom.arCameraFeed || $('ar-camera-feed');
      let tempStream = null;

      if (!cameraVideo) {
        cameraVideo = document.createElement('video');
        cameraVideo.id = 'ar-camera-feed';
        cameraVideo.className = 'ar-camera-feed hidden';
        document.body.appendChild(cameraVideo);
      }

      // If cameraVideo doesn't have an active stream or valid dimensions, initialize it
      if (!cameraVideo.srcObject || cameraVideo.videoWidth === 0 || cameraVideo.paused) {
        if (arState.cameraStream && arState.cameraStream.active) {
          cameraVideo.srcObject = arState.cameraStream;
          cameraVideo.muted = true;
          cameraVideo.setAttribute('playsinline', '');
          cameraVideo.setAttribute('webkit-playsinline', '');
          await ensureVideoFrameReady(cameraVideo, 1200);
        } else if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          try {
            tempStream = await navigator.mediaDevices.getUserMedia({
              video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1920, min: 640 },
                height: { ideal: 1080, min: 480 }
              },
              audio: false
            });
            cameraVideo.srcObject = tempStream;
            cameraVideo.muted = true;
            cameraVideo.setAttribute('playsinline', '');
            cameraVideo.setAttribute('webkit-playsinline', '');
            await ensureVideoFrameReady(cameraVideo, 1500);
          } catch (camErr) {
            console.warn('[Capture] Live camera stream request failed:', camErr);
          }
        }
      } else {
        await ensureVideoFrameReady(cameraVideo, 500);
      }

      // Draw camera feed covering entire screen (object-fit: cover)
      let cameraSource = cameraVideo;
      let imageBitmap = null;

      // 1. Attempt hardware ImageCapture for native ISP color curves (avoids Chrome flat YUV video bug)
      const stream = arState.cameraStream || (cameraVideo.srcObject instanceof MediaStream ? cameraVideo.srcObject : null) || tempStream;
      if (stream && typeof ImageCapture !== 'undefined') {
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack && videoTrack.readyState === 'live') {
          try {
            const imageCapture = new ImageCapture(videoTrack);
            imageBitmap = await imageCapture.grabFrame();
            if (imageBitmap && imageBitmap.width > 0 && imageBitmap.height > 0) {
              cameraSource = imageBitmap;
            }
          } catch (icErr) {
            console.warn('[Capture] ImageCapture grabFrame fallback to video element:', icErr);
          }
        }
      }

      const vw = cameraSource.videoWidth || cameraSource.width || 0;
      const vh = cameraSource.videoHeight || cameraSource.height || 0;

      if (vw > 0 && vh > 0) {
        const videoRatio = vw / vh;
        const screenRatio = W / H;
        let sx = 0, sy = 0, sw = vw, sh = vh;
        if (videoRatio > screenRatio) {
          sw = vh * screenRatio;
          sx = (vw - sw) / 2;
        } else {
          sh = vw / screenRatio;
          sy = (vh - sh) / 2;
        }

        // Apply contrast and color curve correction to counteract Android Chrome's washed-out flat YUV bug.
        // This expands the dynamic range, restores deep true blacks, and removes the white hazy "log" look.
        ctx.save();
        ctx.filter = 'contrast(1.18) saturate(1.16) brightness(0.96)';
        ctx.drawImage(cameraSource, sx, sy, sw, sh, 0, 0, W, H);
        ctx.restore();
      }

      if (imageBitmap && typeof imageBitmap.close === 'function') {
        imageBitmap.close();
      }

      // Draw transparent 3D scene (dancer) on top of camera surroundings with rich, vibrant festival colors
      ctx.save();
      ctx.filter = 'contrast(1.08) saturate(1.22)';
      ctx.drawImage(dancerCanvas, 0, 0, W, H);
      ctx.restore();

      if (tempStream) {
        tempStream.getTracks().forEach((t) => t.stop());
      }
    }

    // 6. Festive Bacolod watermark text (no background box, crisp opaque text with drop shadow)
    const fontSize = Math.round(18 * (W / 720));
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = Math.round(5 * (W / 720));
    ctx.shadowOffsetX = Math.round(1.5 * (W / 720));
    ctx.shadowOffsetY = Math.round(1.5 * (W / 720));
    ctx.fillStyle = '#ffbe3b';
    ctx.font = `bold ${Math.max(fontSize, 14)}px "Plus Jakarta Sans", "Baloo 2", sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText('Bacolod Tourism AR · City of Smiles', Math.round(24 * (W / 720)), H - Math.round(30 * (W / 720)));
    ctx.restore();

    outCanvas.toBlob((blob) => {
      if (blob) {
        resolver.resolve(blob);
      } else {
        resolver.reject(new Error('Canvas toBlob returned null'));
      }
    }, 'image/jpeg', 0.95);

  } catch (err) {
    console.error('[Capture] Error during AR render snapshot:', err);
    resolver.reject(err);
  }
}

export function triggerShutterFlash() {
  try {
    if ('vibrate' in navigator) navigator.vibrate([40, 30, 40]);
  } catch (e) { }

  const flash = document.createElement('div');
  flash.style.position = 'fixed';
  flash.style.inset = '0';
  flash.style.backgroundColor = '#ffffff';
  flash.style.opacity = '0.9';
  flash.style.zIndex = '99999';
  flash.style.pointerEvents = 'none';
  flash.style.transition = 'opacity 0.25s ease-out';
  document.body.appendChild(flash);

  requestAnimationFrame(() => {
    flash.style.opacity = '0';
    setTimeout(() => flash.remove(), 260);
  });
}

export async function handleSaveOrSharePhoto(blob, filename = null) {
  // Direct save/download to device without opening Web Share dialog
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const actualFilename = filename || `bacolod-tourism-ar-${timestamp}.jpg`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = actualFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function setupCapture() {
  const captureBtnEl = dom.captureBtn;
  captureBtnEl?.addEventListener('click', async (e) => {
    e.stopPropagation();
    arState.ignorePlacementUntil = performance.now() + 1000;

    triggerShutterFlash();

    const uiWrapper = dom.uiWrapper;
    if (uiWrapper) uiWrapper.style.opacity = '0';

    try {
      setToast('Capturing AR photo...', true);

      let capturedBlob = null;

      // Method 1: AR snapshot capturing camera background + 3D object
      try {
        capturedBlob = await requestARSnapshot();
      } catch (xrSnapErr) {
        console.warn('Primary AR snapshot error:', xrSnapErr);
      }

      // Method 2: Screen Capture API fallback if supported
      if (!capturedBlob && navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        try {
          const stream = await navigator.mediaDevices.getDisplayMedia({
            video: { displaySurface: 'browser' },
            audio: false
          });

          const video = document.createElement('video');
          video.srcObject = stream;
          video.muted = true;
          video.playsInline = true;
          await video.play();

          await new Promise((r) => setTimeout(r, 140));

          const W = video.videoWidth || window.innerWidth;
          const H = video.videoHeight || window.innerHeight;

          const outCanvas = document.createElement('canvas');
          outCanvas.width = W;
          outCanvas.height = H;
          const ctx = outCanvas.getContext('2d', { alpha: false });
          ctx.drawImage(video, 0, 0, W, H);

          stream.getTracks().forEach((t) => t.stop());

          capturedBlob = await new Promise((res) => outCanvas.toBlob(res, 'image/jpeg', 0.95));
        } catch (screenErr) {
          console.warn('Screen capture skipped/declined:', screenErr);
        }
      }

      if (capturedBlob) {
        await handleSaveOrSharePhoto(capturedBlob, 'bacolod-tourism-ar.jpg');
        setToast('AR Photo Saved!');
      } else {
        setToast('Capture failed.');
      }

    } catch (err) {
      console.error('AR Capture error:', err);
      setToast('Capture failed: ' + (err.message || err));
    } finally {
      if (uiWrapper) uiWrapper.style.opacity = '1';
    }
  });
}
