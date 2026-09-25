export interface CameraPoint { x: number; y: number }
export interface CameraViewBox { x: number; y: number; width: number; height: number }
export interface CameraViewport { width: number; height: number; viewBox: CameraViewBox; zoom: number }

const MAP_CENTER = { x: 750, y: 500 };

export function cameraScale(view: CameraViewport): number {
  return Math.min(view.width / view.viewBox.width, view.height / view.viewBox.height);
}

export function projectCameraPoint(point: CameraPoint, pan: CameraPoint, view: CameraViewport): CameraPoint {
  const scale = cameraScale(view);
  const letterboxX = (view.width - view.viewBox.width * scale) / 2;
  const letterboxY = (view.height - view.viewBox.height * scale) / 2;
  const worldX = MAP_CENTER.x + pan.x + view.zoom * (point.x - MAP_CENTER.x);
  const worldY = MAP_CENTER.y + pan.y + view.zoom * (point.y - MAP_CENTER.y);
  return {
    x: letterboxX + (worldX - view.viewBox.x) * scale,
    y: letterboxY + (worldY - view.viewBox.y) * scale,
  };
}

export function screenDragToPan(dx: number, dy: number, view: CameraViewport): CameraPoint {
  const scale = cameraScale(view);
  return { x: dx / scale, y: dy / scale };
}

export function focusCameraPan(point: CameraPoint, view: CameraViewport, anchor = { x: 0.5, y: 0.56 }): CameraPoint {
  const projected = projectCameraPoint(point, { x: 0, y: 0 }, view);
  const scale = cameraScale(view);
  return {
    x: (view.width * anchor.x - projected.x) / scale,
    y: (view.height * anchor.y - projected.y) / scale,
  };
}

export function followCameraPan(point: CameraPoint, pan: CameraPoint, view: CameraViewport): CameraPoint {
  const screen = projectCameraPoint(point, pan, view);
  const left = view.width * 0.32, right = view.width * 0.68;
  const top = view.height * 0.41, bottom = view.height * 0.71;
  const targetX = Math.max(left, Math.min(right, screen.x));
  const targetY = Math.max(top, Math.min(bottom, screen.y));
  const scale = cameraScale(view);
  return { x: pan.x + (targetX - screen.x) / scale, y: pan.y + (targetY - screen.y) / scale };
}
