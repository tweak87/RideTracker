import assert from "node:assert/strict";
import { createRidePackageManifest, validateRidePackage } from "./ride-package.js";

const digestA = "a".repeat(64);
const digestB = "b".repeat(64);
const sessionID = "session-12345678";

const manifest = createRidePackageManifest({
  sessionID,
  telemetryFilename: `${sessionID}.ride.json`,
  platform: "android",
  media: [
    {
      kind: "video",
      filename: `${sessionID}.mp4`,
      startOffsetSeconds: 0.137,
      mimeType: "video/mp4",
    },
  ],
  integrityFiles: {
    [`${sessionID}.ride.json`]: digestA,
    [`${sessionID}.mp4`]: digestB,
  },
});

assert.equal(manifest.packageVersion, "1.0.0");
assert.equal(manifest.telemetry.sessionID, sessionID);
assert.equal(manifest.media[0].sessionID, sessionID);
assert.deepEqual(validateRidePackage(manifest), { valid: true, errors: [] });

const mismatchedVideo = structuredClone(manifest);
mismatchedVideo.media[0].sessionID = "different-session";
const mismatchResult = validateRidePackage(mismatchedVideo);
assert.equal(mismatchResult.valid, false);
assert.ok(mismatchResult.errors.some((error) => error.includes("media[0].sessionID")));

const missingDigest = structuredClone(manifest);
delete missingDigest.integrity.files[`${sessionID}.mp4`];
const digestResult = validateRidePackage(missingDigest);
assert.equal(digestResult.valid, false);
assert.ok(digestResult.errors.some((error) => error.includes("SHA-256")));

const duplicateMedia = structuredClone(manifest);
duplicateMedia.media.push({ ...duplicateMedia.media[0] });
const duplicateResult = validateRidePackage(duplicateMedia);
assert.equal(duplicateResult.valid, false);
assert.ok(duplicateResult.errors.some((error) => error.includes("Duplicate media filename")));

console.log("RidePackage contract tests passed");
