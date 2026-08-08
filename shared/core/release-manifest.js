(() => {
  'use strict';
  globalThis.RideTrackerReleaseManifest = Object.freeze({
    product: 'RideTracker',
    version: '2026.08.08-speed-compass-3d.1',
    channel: 'speed-compass-spatial-inspector',
    releasedAt: '2026-08-08T08:00:00.000Z',
    baseline: Object.freeze({
      label: 'Stable community backend and 3D baseline before speed, compass and spatial inspector',
      commit: '9a0d225bd291f1c5c3b65cb4f507f898dcf5a83b',
      rollbackBranch: 'rollback/pre-speed-compass-3d-20260808',
      url: 'https://github.com/tweak87/RideTracker/tree/rollback/pre-speed-compass-3d-20260808'
    }),
    features: Object.freeze([
      'community-navigation',
      'recording-preflight',
      'ride-visibility-model',
      'support-bundle',
      'local-admin-center',
      'mobile-browser-e2e',
      'optional-community-auth-sync',
      'friends-feed-moderation-reports',
      'server-track-model-merge',
      'park-track-ride-thumbnails',
      'interactive-3d-telemetry-heatmaps',
      'windowed-ios-gps-speed',
      'configurable-compass-widget',
      'xyz-track-point-inspector',
      'recursion-safe-runtime-errors'
    ])
  });
})();
