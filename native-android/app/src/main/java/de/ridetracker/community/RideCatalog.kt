package de.ridetracker.community

import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

data class CatalogCountry(
    val code: String,
    val name: String,
)

data class OfficialRideFacts(
    val maxSpeedKmh: Double? = null,
    val heightM: Double? = null,
    val lengthM: Double? = null,
    val durationSeconds: Double? = null,
    val inversions: Int? = null,
    val publishedMaxG: Double? = null,
    val sourceTitle: String,
    val sourceUrl: String,
    val verifiedAt: String = "2026-08-09",
)

data class CatalogAttraction(
    val id: String,
    val name: String,
    val type: String = "Achterbahn",
    val manufacturer: String? = null,
    val facts: OfficialRideFacts? = null,
)

data class CatalogPark(
    val id: String,
    val name: String,
    val countryCode: String,
    val latitude: Double,
    val longitude: Double,
    val attractions: List<CatalogAttraction>,
)

/**
 * Small offline-first seed catalog. It deliberately contains only stable identity data and a
 * curated subset of official figures. Missing figures stay null instead of being guessed.
 * Online/OSM discoveries are merged by AndroidRideContextStore at runtime.
 */
object RideCatalog {
    val countries = listOf(
        CatalogCountry("AT", "Österreich"),
        CatalogCountry("BE", "Belgien"),
        CatalogCountry("DK", "Dänemark"),
        CatalogCountry("DE", "Deutschland"),
        CatalogCountry("FR", "Frankreich"),
        CatalogCountry("IT", "Italien"),
        CatalogCountry("JP", "Japan"),
        CatalogCountry("NL", "Niederlande"),
        CatalogCountry("PL", "Polen"),
        CatalogCountry("ES", "Spanien"),
        CatalogCountry("SE", "Schweden"),
        CatalogCountry("CH", "Schweiz"),
        CatalogCountry("AE", "Vereinigte Arabische Emirate"),
        CatalogCountry("GB", "Vereinigtes Königreich"),
        CatalogCountry("US", "USA"),
    ).sortedBy { it.name }

    val parks: List<CatalogPark> = listOf(
        park("de-europa", "Europa-Park", "DE", 48.2660, 7.7220,
            ride("de-europa-silver-star", "Silver Star", "Bolliger & Mabillard", speed = 130.0, height = 73.0, duration = 180.0, maxG = 4.0, source = "Europa-Park · Silver Star", url = "https://www.europapark.de/de/freizeitpark/attraktionen/silver-star"),
            ride("de-europa-voltron", "Voltron Nevera powered by Rimac", "MACK Rides", speed = 100.0, height = 32.5, length = 1385.0, duration = 180.0, inversions = 7, maxG = 4.0, source = "Europa-Park · Voltron Nevera", url = "https://www.europapark.de/de/freizeitpark/attraktionen/voltron-nevera-powered-rimac"),
            ride("de-europa-blue-fire", "blue fire Megacoaster", "MACK Rides", speed = 100.0, height = 38.0, length = 1000.0, duration = 140.0, inversions = 4, maxG = 3.8, source = "Europa-Park · blue fire", url = "https://www.europapark.de/de/freizeitpark/attraktionen/blue-fire-megacoaster"),
        ),
        park("de-phantasialand", "Phantasialand", "DE", 50.8002, 6.8792,
            ride("de-phantasialand-taron", "Taron", "Intamin", source = "Phantasialand · Taron", url = "https://www.phantasialand.de/de/themenpark/einzigartige-attraktionen/taron/"),
            ride("de-phantasialand-fly", "F.L.Y.", "Vekoma", source = "Phantasialand · F.L.Y.", url = "https://www.phantasialand.de/de/themenpark/einzigartige-attraktionen/fly/"),
            ride("de-phantasialand-black-mamba", "Black Mamba", "Bolliger & Mabillard"),
        ),
        park("de-heide-park", "Heide Park Resort", "DE", 53.0257, 9.8796,
            ride("de-heide-colossos", "Colossos – Kampf der Giganten", "Intamin", speed = 110.0, height = 60.0, length = 1500.0, duration = 164.0, source = "Heide Park · Colossos", url = "https://www.heide-park.de/entdecken/attraktionen-shows-entertainment/rides-attractions/colossos-kampf-der-giganten/"),
            ride("de-heide-daemonen", "Flug der Dämonen", "Bolliger & Mabillard"),
            ride("de-heide-krake", "Krake", "Bolliger & Mabillard"),
        ),
        park("de-hansa", "Hansa-Park", "DE", 54.0760, 10.7782,
            ride("de-hansa-kaernan", "Der Schwur des Kärnan", "Gerstlauer"),
            ride("de-hansa-novgorod", "Flucht von Novgorod", "Gerstlauer"),
        ),
        park("de-movie", "Movie Park Germany", "DE", 51.6206, 6.9727,
            ride("de-movie-star-trek", "Star Trek: Operation Enterprise", "MACK Rides"),
            ride("de-movie-bandit", "Bandit", "RCCA"),
        ),
        park("de-holiday", "Holiday Park", "DE", 49.3187, 8.2944,
            ride("de-holiday-geforce", "Expedition GeForce", "Intamin"),
            ride("de-holiday-sky-scream", "Sky Scream", "Premier Rides"),
        ),
        park("de-tripsdrill", "Erlebnispark Tripsdrill", "DE", 49.0355, 9.0568,
            ride("de-tripsdrill-karacho", "Karacho", "Gerstlauer"),
            ride("de-tripsdrill-hals", "Hals-über-Kopf", "Vekoma"),
        ),
        park("de-legoland", "LEGOLAND Deutschland", "DE", 48.4245, 10.2996,
            ride("de-legoland-feuerdrache", "Feuerdrache", "Zierer"),
            ride("de-legoland-maximus", "MAXIMUS – Der Flug des Wächters", "Bolliger & Mabillard"),
        ),
        park("nl-efteling", "Efteling", "NL", 51.6505, 5.0490,
            ride("nl-efteling-baron", "Baron 1898", "Bolliger & Mabillard"),
            ride("nl-efteling-python", "Python", "Vekoma"),
            ride("nl-efteling-jdv", "Joris en de Draak", "Great Coasters International"),
        ),
        park("nl-toverland", "Toverland", "NL", 51.3969, 5.9868,
            ride("nl-toverland-troy", "Troy", "Great Coasters International"),
            ride("nl-toverland-fenix", "Fēnix", "Bolliger & Mabillard"),
        ),
        park("nl-walibi", "Walibi Holland", "NL", 52.4386, 5.7624,
            ride("nl-walibi-untamed", "Untamed", "Rocky Mountain Construction"),
            ride("nl-walibi-goliath", "Goliath", "Intamin"),
        ),
        park("be-plopsaland", "Plopsaland De Panne", "BE", 51.0809, 2.5961,
            ride("be-plopsaland-ride-happiness", "The Ride to Happiness", "MACK Rides"),
            ride("be-plopsaland-anubis", "Anubis The Ride", "Gerstlauer"),
        ),
        park("be-walibi", "Walibi Belgium", "BE", 50.6972, 4.5906,
            ride("be-walibi-kondaa", "Kondaa", "Intamin"),
            ride("be-walibi-pulsar", "Pulsar", "MACK Rides"),
        ),
        park("fr-asterix", "Parc Astérix", "FR", 49.1340, 2.5712,
            ride("fr-asterix-toutatis", "Toutatis", "Intamin"),
            ride("fr-asterix-oziris", "OzIris", "Bolliger & Mabillard"),
        ),
        park("fr-disneyland", "Disneyland Paris", "FR", 48.8722, 2.7758,
            ride("fr-disneyland-hyperspace", "Star Wars Hyperspace Mountain", "Vekoma"),
            ride("fr-disneyland-crush", "Crush’s Coaster", "Maurer"),
        ),
        park("es-portaventura", "PortAventura World", "ES", 41.0878, 1.1575,
            ride("es-portaventura-shambhala", "Shambhala", "Bolliger & Mabillard"),
            ride("es-portaventura-furius", "Furius Baco", "Intamin"),
            ride("es-portaventura-red-force", "Red Force", "Intamin"),
        ),
        park("it-gardaland", "Gardaland", "IT", 45.4550, 10.7146,
            ride("it-gardaland-raptor", "Raptor", "Bolliger & Mabillard"),
            ride("it-gardaland-oblivion", "Oblivion – The Black Hole", "Bolliger & Mabillard"),
        ),
        park("pl-energylandia", "Energylandia", "PL", 49.9990, 19.4090,
            ride("pl-energylandia-zadra", "Zadra", "Rocky Mountain Construction"),
            ride("pl-energylandia-hyperion", "Hyperion", "Intamin"),
        ),
        park("at-familypark", "Familypark", "AT", 47.8028, 16.6483,
            ride("at-familypark-goetterblitz", "Götterblitz", "MACK Rides"),
        ),
        park("ch-connyland", "Conny-Land", "CH", 47.6157, 9.0555,
            ride("ch-connyland-cobra", "Cobra", "PAX"),
        ),
        park("dk-djurs", "Djurs Sommerland", "DK", 56.4258, 10.5500,
            ride("dk-djurs-piraten", "Piraten", "Intamin"),
            ride("dk-djurs-juvelen", "Juvelen", "Intamin"),
        ),
        park("se-liseberg", "Liseberg", "SE", 57.6954, 11.9925,
            ride("se-liseberg-helix", "Helix", "MACK Rides"),
            ride("se-liseberg-valkyria", "Valkyria", "Bolliger & Mabillard"),
        ),
        park("gb-alton", "Alton Towers", "GB", 52.9875, -1.8920,
            ride("gb-alton-smiler", "The Smiler", "Gerstlauer"),
            ride("gb-alton-nemesis", "Nemesis Reborn", "Bolliger & Mabillard"),
        ),
        park("gb-thorpe", "Thorpe Park", "GB", 51.4050, -0.5132,
            ride("gb-thorpe-hyperia", "Hyperia", "MACK Rides"),
            ride("gb-thorpe-stealth", "Stealth", "Intamin"),
        ),
        park("us-cedar", "Cedar Point", "US", 41.4822, -82.6835,
            ride("us-cedar-steel-vengeance", "Steel Vengeance", "Rocky Mountain Construction"),
            ride("us-cedar-millennium", "Millennium Force", "Intamin"),
        ),
        park("us-ioa", "Universal Islands of Adventure", "US", 28.4717, -81.4725,
            ride("us-ioa-velocicoaster", "Jurassic World VelociCoaster", "Intamin"),
            ride("us-ioa-hagrid", "Hagrid’s Magical Creatures Motorbike Adventure", "Intamin"),
        ),
        park("jp-fujiq", "Fuji-Q Highland", "JP", 35.4870, 138.7806,
            ride("jp-fujiq-fujiyama", "Fujiyama", "Togo"),
            ride("jp-fujiq-eejanaika", "Eejanaika", "S&S"),
        ),
        park("ae-ferrari", "Ferrari World Abu Dhabi", "AE", 24.4836, 54.6070,
            ride("ae-ferrari-formula-rossa", "Formula Rossa", "Intamin"),
            ride("ae-ferrari-flying-aces", "Flying Aces", "Intamin"),
        ),
    )

    fun parksForCountry(countryCode: String): List<CatalogPark> =
        parks.filter { it.countryCode == countryCode.uppercase() }.sortedBy { it.name }

    /** Offline fallback for automatic country preselection when reverse geocoding is unavailable. */
    fun countryCodeForLocation(latitude: Double, longitude: Double): String? {
        val boxes = listOf(
            CountryBox("GB", 49.8, 60.9, -8.8, 2.1),
            CountryBox("AE", 22.5, 26.3, 51.4, 56.6),
            CountryBox("JP", 24.0, 46.0, 122.0, 146.0),
            CountryBox("US", 24.0, 50.0, -125.0, -66.0),
        )
        return boxes.firstOrNull { latitude in it.minLatitude..it.maxLatitude && longitude in it.minLongitude..it.maxLongitude }?.code
            ?: parks.minByOrNull { distanceMeters(latitude, longitude, it.latitude, it.longitude) }
                ?.takeIf { distanceMeters(latitude, longitude, it) <= 450_000.0 }
                ?.countryCode
    }

    fun findPark(id: String?): CatalogPark? = parks.firstOrNull { it.id == id }

    fun findAttraction(id: String?): Pair<CatalogPark, CatalogAttraction>? = parks.firstNotNullOfOrNull { park ->
        park.attractions.firstOrNull { it.id == id }?.let { park to it }
    }

    fun findAttractionByName(name: String?, parkId: String? = null): Pair<CatalogPark, CatalogAttraction>? {
        val normalized = name?.let(::normalizeName)?.takeIf { it.isNotBlank() } ?: return null
        return parks.asSequence()
            .filter { parkId == null || it.id == parkId }
            .mapNotNull { park -> park.attractions.firstOrNull { normalizeName(it.name) == normalized }?.let { park to it } }
            .firstOrNull()
    }

    fun nearestPark(latitude: Double, longitude: Double, maximumDistanceM: Double = 75_000.0): CatalogPark? =
        parks.map { it to distanceMeters(latitude, longitude, it.latitude, it.longitude) }
            .filter { it.second <= maximumDistanceM }
            .minByOrNull { it.second }
            ?.first

    fun distanceMeters(latitude: Double, longitude: Double, park: CatalogPark): Double =
        distanceMeters(latitude, longitude, park.latitude, park.longitude)

    private fun distanceMeters(latA: Double, lonA: Double, latB: Double, lonB: Double): Double {
        val earthRadiusM = 6_371_000.0
        val latitudeDelta = Math.toRadians(latB - latA)
        val longitudeDelta = Math.toRadians(lonB - lonA)
        val firstLatitude = Math.toRadians(latA)
        val secondLatitude = Math.toRadians(latB)
        val a = sin(latitudeDelta / 2) * sin(latitudeDelta / 2) +
            cos(firstLatitude) * cos(secondLatitude) * sin(longitudeDelta / 2) * sin(longitudeDelta / 2)
        return earthRadiusM * 2 * atan2(sqrt(a), sqrt(1 - a))
    }

    private fun normalizeName(value: String) = value.lowercase().replace(Regex("[^a-z0-9äöüß]+"), "")

    private fun park(id: String, name: String, country: String, lat: Double, lon: Double, vararg rides: CatalogAttraction) =
        CatalogPark(id, name, country, lat, lon, rides.sortedBy { it.name })

    private data class CountryBox(
        val code: String,
        val minLatitude: Double,
        val maxLatitude: Double,
        val minLongitude: Double,
        val maxLongitude: Double,
    )

    private fun ride(
        id: String,
        name: String,
        manufacturer: String,
        speed: Double? = null,
        height: Double? = null,
        length: Double? = null,
        duration: Double? = null,
        inversions: Int? = null,
        maxG: Double? = null,
        source: String? = null,
        url: String? = null,
    ) = CatalogAttraction(
        id = id,
        name = name,
        manufacturer = manufacturer,
        facts = if (source != null && url != null) OfficialRideFacts(speed, height, length, duration, inversions, maxG, source, url) else null,
    )
}
