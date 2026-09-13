import * as THREE from 'three';
import { arState } from './state.js';
import { isHorizontalDetectedPlane } from '../shaders/floorGridShader.js';

const hitTestMatrix = new THREE.Matrix4();
const planePoseMatrix = new THREE.Matrix4();

export function disposeDetectedPlaneGrid(context) {
  if (!context) return;
  if (context.mesh) {
    arState.floorGridMesh?.remove(context.mesh);
    context.mesh.geometry?.dispose();
  }
}

export function resetDetectedPlaneGrids() {
  arState.detectedPlaneGrids.forEach(disposeDetectedPlaneGrid);
  arState.detectedPlaneGrids.clear();
  arState.planeDetectionAvailable = false;
  arState.detectedFloorHeight = null;
  if (arState.fallbackFloorGridMesh) {
    arState.floorGridMesh?.remove(arState.fallbackFloorGridMesh);
    arState.fallbackFloorGridMesh.geometry?.dispose();
    arState.fallbackFloorGridMesh = null;
  }
  if (arState.floorGridMesh) arState.floorGridMesh.visible = false;
}

export function updateDetectedPlaneGrids(frame, referenceSpace, hitMatrix = null) {
  let detectedPlanes = null;
  try {
    detectedPlanes = frame?.detectedPlanes;
  } catch (err) {
    detectedPlanes = null;
  }

  // 1. Process horizontal planes from WebXR Plane Detection API to accurately determine floor height
  if (detectedPlanes && detectedPlanes.size > 0) {
    arState.planeDetectionAvailable = true;
    arState.detectedPlaneGrids.forEach((context, plane) => {
      if (!detectedPlanes.has(plane)) {
        arState.detectedPlaneGrids.delete(plane);
      }
    });

    let detectedCount = 0;
    detectedPlanes.forEach((plane) => {
      const planePose = frame.getPose(plane.planeSpace, referenceSpace);
      if (!planePose || !isHorizontalDetectedPlane(plane, planePose)) {
        return;
      }

      planePoseMatrix.fromArray(planePose.transform.matrix);
      const floorY = planePoseMatrix.elements[13];
      // Keep lowest or reasonable horizontal plane height for floor level
      if (arState.detectedFloorHeight === null || floorY < arState.detectedFloorHeight) {
        arState.detectedFloorHeight = floorY;
      } else {
        arState.detectedFloorHeight = floorY;
      }
      detectedCount++;
    });

    if (detectedCount > 0) {
      return true;
    }
  }

  // 2. Track floor height from WebXR SLAM Hit-Test
  if (hitMatrix && !arState.isPlaced) {
    hitTestMatrix.fromArray(hitMatrix);
    const hitPos = new THREE.Vector3().setFromMatrixPosition(hitTestMatrix);
    arState.detectedFloorHeight = hitPos.y;
    arState.lastHitPosition.copy(hitPos);
    return true;
  }

  return false;
}
