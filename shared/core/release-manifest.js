(() => {
  'use strict';
  globalThis.RideTrackerReleaseManifest = Object.freeze({
    product: 'RideTracker',
    version: '2026.08.08-community-backend-3d.1',
    channel: 'community-backend-3d',
    releasedAt: '2026-08-08T00:00:00.000Z',
    baseline: Object.freeze({
      label: 'Stable local community foundation before backend and 3D',
      commit: '3bd0175b93c7babe515f91555352e7711020fa7f',
      rollbackBranch: 'rollback/pre-community-backend-20260808',
      url: 'https://github.com/tweak87/RideTracker/tree/rollback/pre-community-backend-20260808'
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
      'interactive-3d-telemetry-heatmaps'
    ])
  });
})();
