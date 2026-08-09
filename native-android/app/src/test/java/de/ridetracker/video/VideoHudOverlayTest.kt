package de.ridetracker.video

import org.junit.Assert.assertEquals
import org.junit.Test

class VideoHudOverlayTest {
    @Test
    fun `embedded HUD trail retains exactly the most recent three seconds`() {
        val history = VideoHudHistory()
        (0..50).forEach { index -> history.add(VideoHudSample(timestampMs = index * 100L, elapsedSeconds = index / 10.0)) }

        val snapshot = history.snapshot(5_000L)

        assertEquals(2_000L, snapshot.first().timestampMs)
        assertEquals(5_000L, snapshot.last().timestampMs)
        assertEquals(31, snapshot.size)
    }
}
