import { describe, expect, it } from 'vitest';
import { cameraScale, focusCameraPan, followCameraPan, projectCameraPoint, screenDragToPan, type CameraViewport } from '../src/visual/cameraMath';

describe('small-screen board camera coordinates', () => {
  it('converts drag pixels through the actual viewBox meet scale', () => {
    const view: CameraViewport = { width: 600, height: 300, zoom: 1.5, viewBox: { x: -90, y: -125, width: 1680, height: 1240 } };
    const scale = 300 / 1240; // Height-limited valley viewBox; the SVG has horizontal letterboxing.
    expect(cameraScale(view)).toBeCloseTo(scale);
    expect(screenDragToPan(24, -12, view)).toEqual({ x: 24 / scale, y: -12 / scale });
    expect(projectCameraPoint({ x: -90, y: -125 }, { x: 0, y: 0 }, { ...view, zoom: 1 }).y).toBeCloseTo(0);
  });

  it('focuses an actor below center, then moves only when the actor leaves the safe zone', () => {
    const view: CameraViewport = { width: 390, height: 300, zoom: 1.8, viewBox: { x: -90, y: -125, width: 1680, height: 1240 } };
    const origin = { x: 750, y: 500 };
    const focus = focusCameraPan(origin, view);
    const onScreen = projectCameraPoint(origin, focus, view);
    expect(onScreen.x).toBeCloseTo(view.width * 0.5);
    expect(onScreen.y).toBeCloseTo(view.height * 0.56);
    expect(followCameraPan(origin, focus, view)).toEqual(focus);

    const edge = { x: 1200, y: 500 };
    const follow = followCameraPan(edge, focus, view);
    expect(follow.x).toBeLessThan(focus.x);
    expect(projectCameraPoint(edge, follow, view).x).toBeCloseTo(view.width * 0.68);
  });
});
