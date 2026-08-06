package de.ridetracker.session

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.time.Instant

object RidePackageStore {
    fun save(
        context: Context,
        session: RideSessionDocument,
        telemetryFile: File,
    ): File {
        val media = JSONArray()
        val hashes = JSONObject()
        hashes.put(telemetryFile.name, sha256(telemetryFile))

        session.videoFilename?.let { filename ->
            val videoFile = File(context.filesDir, filename)
            val mediaEntry = JSONObject()
                .put("kind", "video")
                .put("filename", filename)
                .put("sessionID", session.id)
                .put("startOffsetSeconds", session.videoStartOffsetSeconds)
                .put("mimeType", if (filename.endsWith(".mov", true)) "video/quicktime" else "video/mp4")
            if (videoFile.exists()) {
                mediaEntry.put("sizeBytes", videoFile.length())
                hashes.put(filename, sha256(videoFile))
            }
            media.put(mediaEntry)
        }

        val manifest = JSONObject()
            .put("packageVersion", "1.0.0")
            .put("sessionID", session.id)
            .put("createdAt", Instant.now().toString())
            .put("platform", "android")
            .put("telemetry", JSONObject()
                .put("filename", telemetryFile.name)
                .put("schemaVersion", "2.0.0")
                .put("sessionID", session.id)
                .put("sampleCount", session.summary.sampleCount)
                .put("durationSeconds", session.summary.durationSeconds))
            .put("media", media)
            .put("context", JSONObject()
                .put("parkID", JSONObject.NULL)
                .put("rideID", JSONObject.NULL)
                .put("parkName", JSONObject.NULL)
                .put("rideName", JSONObject.NULL))
            .put("privacy", JSONObject()
                .put("visibility", "private")
                .put("locationPrecision", "exact"))
            .put("integrity", JSONObject()
                .put("algorithm", "sha256")
                .put("files", hashes))

        val packageFile = File(context.filesDir, telemetryFile.name.removeSuffix(".ride.json") + ".ride-package.json")
        packageFile.writeText(manifest.toString(2))
        return packageFile
    }

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            while (true) {
                val count = input.read(buffer)
                if (count <= 0) break
                digest.update(buffer, 0, count)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }
}
