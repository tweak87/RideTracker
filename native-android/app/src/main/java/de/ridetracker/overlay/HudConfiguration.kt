package de.ridetracker.overlay

data class HudElementConfiguration(
    val visible: Boolean = true,
    val x: Double,
    val y: Double,
    val width: Double,
    val height: Double,
    val scale: Double = 1.0,
    val opacity: Double = 1.0,
    val fontScale: Double = 1.0,
)

data class HudProfileConfiguration(
    val panelOpacity: Double = 0.86,
    val globalOpacity: Double = 1.0,
    val fontScale: Double = 1.0,
    val fontFamily: String = "system",
    val elements: Map<String, HudElementConfiguration>,
)

data class HudWatermarkConfiguration(
    val enabled: Boolean = false,
    val imageFilename: String? = null,
    val x: Double = 0.82,
    val y: Double = 0.04,
    val width: Double = 0.14,
    val opacity: Double = 0.65,
)

data class HudConfiguration(
    val version: String = "1.0.0",
    val profiles: Map<String, HudProfileConfiguration>,
    val watermark: HudWatermarkConfiguration = HudWatermarkConfiguration(),
) {
    companion object {
        fun defaults(overlay: OverlayConfiguration): HudConfiguration {
            fun profile(layout: Map<String, List<Double>>) = HudProfileConfiguration(
                elements = layout.mapNotNull { (key, value) ->
                    if (value.size != 4) null else key to HudElementConfiguration(
                        x = value[0], y = value[1], width = value[2], height = value[3],
                    )
                }.toMap(),
            )
            return HudConfiguration(
                profiles = mapOf(
                    "landscape" to profile(overlay.layouts["landscape"].orEmpty()),
                    "portrait" to profile(overlay.layouts["portrait"].orEmpty()),
                )
            )
        }
    }
}
