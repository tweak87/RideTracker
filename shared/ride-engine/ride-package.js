export const RIDE_PACKAGE_VERSION = "1.0.0";

const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const TELEMETRY_SUFFIX = ".ride.json";

export function validateRidePackage(manifest) {
  const errors = [];

  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return { valid: false, errors: ["Manifest must be an object"] };
  }

  if (manifest.packageVersion !== RIDE_PACKAGE_VERSION) {
    errors.push(`Unsupported packageVersion: ${manifest.packageVersion ?? "missing"}`);
  }

  if (typeof manifest.sessionID !== "string" || manifest.sessionID.length < 8) {
    errors.push("sessionID must be a string with at least 8 characters");
  }

  if (!manifest.telemetry || typeof manifest.telemetry !== "object") {
    errors.push("telemetry is required");
  } else {
    if (typeof manifest.telemetry.filename !== "string" || !manifest.telemetry.filename.endsWith(TELEMETRY_SUFFIX)) {
      errors.push(`telemetry.filename must end with ${TELEMETRY_SUFFIX}`);
    }
    if (manifest.telemetry.schemaVersion !== "2.0.0") {
      errors.push("telemetry.schemaVersion must be 2.0.0");
    }
    if (manifest.telemetry.sessionID !== manifest.sessionID) {
      errors.push("telemetry.sessionID must match package sessionID");
    }
  }

  if (!Array.isArray(manifest.media)) {
    errors.push("media must be an array");
  } else {
    const filenames = new Set();
    for (const [index, item] of manifest.media.entries()) {
      if (!item || typeof item !== "object") {
        errors.push(`media[${index}] must be an object`);
        continue;
      }
      if (!new Set(["video", "photo", "audio"]).has(item.kind)) {
        errors.push(`media[${index}].kind is invalid`);
      }
      if (typeof item.filename !== "string" || item.filename.length === 0) {
        errors.push(`media[${index}].filename is required`);
      } else if (filenames.has(item.filename)) {
        errors.push(`Duplicate media filename: ${item.filename}`);
      } else {
        filenames.add(item.filename);
      }
      if (item.sessionID !== manifest.sessionID) {
        errors.push(`media[${index}].sessionID must match package sessionID`);
      }
      if (!Number.isFinite(item.startOffsetSeconds)) {
        errors.push(`media[${index}].startOffsetSeconds must be finite`);
      }
    }
  }

  if (!manifest.integrity || manifest.integrity.algorithm !== "sha256") {
    errors.push("integrity.algorithm must be sha256");
  } else if (!manifest.integrity.files || typeof manifest.integrity.files !== "object") {
    errors.push("integrity.files is required");
  } else {
    const expectedFiles = [manifest.telemetry?.filename, ...(manifest.media ?? []).map((item) => item?.filename)]
      .filter(Boolean);
    for (const filename of expectedFiles) {
      const digest = manifest.integrity.files[filename];
      if (typeof digest !== "string" || !SHA256_PATTERN.test(digest)) {
        errors.push(`Missing or invalid SHA-256 for ${filename}`);
      }
    }
  }

  if (manifest.privacy) {
    if (!new Set(["private", "unlisted", "community"]).has(manifest.privacy.visibility)) {
      errors.push("privacy.visibility is invalid");
    }
    if (!new Set(["exact", "park", "hidden"]).has(manifest.privacy.locationPrecision)) {
      errors.push("privacy.locationPrecision is invalid");
    }
  }

  return { valid: errors.length === 0, errors };
}

export function createRidePackageManifest({
  sessionID,
  telemetryFilename,
  platform,
  media = [],
  integrityFiles,
  context = {},
  privacy = { visibility: "private", locationPrecision: "exact" },
  createdAt = new Date().toISOString(),
}) {
  const manifest = {
    packageVersion: RIDE_PACKAGE_VERSION,
    sessionID,
    createdAt,
    platform,
    telemetry: {
      filename: telemetryFilename,
      schemaVersion: "2.0.0",
      sessionID,
    },
    media: media.map((item) => ({ ...item, sessionID })),
    context,
    privacy,
    integrity: {
      algorithm: "sha256",
      files: integrityFiles,
    },
  };

  const result = validateRidePackage(manifest);
  if (!result.valid) {
    throw new Error(`Invalid RidePackage manifest: ${result.errors.join("; ")}`);
  }
  return manifest;
}
