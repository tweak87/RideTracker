package de.ridetracker.community

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RideCatalogTest {
    @Test
    fun `german catalog offers parks and selectable attractions`() {
        val parks = RideCatalog.parksForCountry("DE")
        assertTrue(parks.size >= 8)
        val europaPark = parks.first { it.id == "de-europa" }
        assertTrue(europaPark.attractions.any { it.name.contains("Silver Star") })
    }

    @Test
    fun `location ranks nearby catalog park without network`() {
        val nearest = RideCatalog.nearestPark(48.2662, 7.7218, 10_000.0)
        assertEquals("de-europa", nearest?.id)
    }

    @Test
    fun `official facts always retain a source`() {
        val facts = RideCatalog.findAttraction("de-europa-silver-star")?.second?.facts
        assertNotNull(facts)
        assertEquals(130.0, facts?.maxSpeedKmh ?: 0.0, 0.001)
        assertTrue(facts?.sourceUrl?.startsWith("https://") == true)
        assertTrue(facts?.verifiedAt?.isNotBlank() == true)
    }
}
