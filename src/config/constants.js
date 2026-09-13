import * as THREE from 'three';
import defaultVideoUrl from '../assets/Composition_greybg.mp4';
import defaultAudioUrl from '../assets/audioclip-1788760841000-245087 (2).mp4';

export const RETICLE_ACCENT = 0xee6327; // Bacolod Orange
export const RETICLE_LIGHT = 0xfbb03b;  // Bacolod Yellow

export const DEFAULT_MEDIA_URL =
  import.meta.env.FILE_LINK ||
  import.meta.env.VITE_FILE_LINK ||
  import.meta.env.VITE_DEFAULT_MEDIA_URL ||
  defaultVideoUrl;

export const DEFAULT_AUDIO_URL =
  import.meta.env.AUDIO_LINK ||
  import.meta.env.VITE_AUDIO_LINK ||
  import.meta.env.VITE_DEFAULT_AUDIO_URL ||
  defaultAudioUrl;

export const VIDEO_ASPECT = 9 / 16;
export const BILLBOARD_HEIGHT = 2.0;    // 2.0 meters scale (lifesize / feet touching floor)
export const PLACEMENT_DISTANCE = 5.6;  // 5.6 meters away from user camera
export const AUTO_LOAD_TIMER_SECONDS = 5; // 5-second countdown timer before loading object
export const PLACEMENT_FLOAT_AMPLITUDE = 0.04;
export const PLANE_GRID_SURFACE_OFFSET = 0.003;

export const CAMERA_RELEASE_DELAY_MS = 100;

export const QR_CAMERA_CONFIG = {
  fps: 25,
  qrbox: (viewfinderWidth, viewfinderHeight) => {
    const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
    const size = Math.floor(minEdge * 0.88);
    return {
      width: Math.max(size, 200),
      height: Math.max(size, 200)
    };
  },
  aspectRatio: 1.0,
  disableFlip: false
};

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
