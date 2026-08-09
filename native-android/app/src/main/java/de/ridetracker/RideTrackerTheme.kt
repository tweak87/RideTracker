package de.ridetracker

import android.app.Activity
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.matchParentSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat

val RideMidnight = Color(0xFF030B14)
val RideSurface = Color(0xFF081726)
val RideSurfaceHigh = Color(0xFF10283A)
val RideCyan = Color(0xFF5FD0FF)
val RideGreen = Color(0xFF5EE0A0)
val RideAmber = Color(0xFFFFD166)
val RideRose = Color(0xFFFF5D78)
val RideText = Color(0xFFF4FAFF)
val RideMuted = Color(0xFF9AB1C5)

private val RideTrackerColors = darkColorScheme(
    primary = RideCyan,
    onPrimary = Color(0xFF001923),
    primaryContainer = Color(0xFF0C3B53),
    onPrimaryContainer = Color(0xFFD1F1FF),
    secondary = RideGreen,
    onSecondary = Color(0xFF002116),
    secondaryContainer = Color(0xFF164C3B),
    onSecondaryContainer = Color(0xFFC6F7DE),
    tertiary = RideAmber,
    onTertiary = Color(0xFF2A1D00),
    error = RideRose,
    onError = Color.White,
    errorContainer = Color(0xFF61192A),
    onErrorContainer = Color(0xFFFFD9DF),
    background = RideMidnight,
    onBackground = RideText,
    surface = RideSurface,
    onSurface = RideText,
    surfaceVariant = RideSurfaceHigh,
    onSurfaceVariant = RideMuted,
    outline = Color(0xFF33566F),
    outlineVariant = Color(0xFF1D394C),
)

private val RideTrackerTypography = Typography(
    headlineLarge = Typography().headlineLarge.copy(fontSize = 31.sp),
    headlineMedium = Typography().headlineMedium.copy(fontSize = 25.sp),
    titleLarge = Typography().titleLarge.copy(fontSize = 21.sp),
    titleMedium = Typography().titleMedium.copy(fontSize = 17.sp),
)

private val RideTrackerShapes = Shapes(
    small = RoundedCornerShape(11.dp),
    medium = RoundedCornerShape(17.dp),
    large = RoundedCornerShape(25.dp),
)

@Composable
fun RideTrackerTheme(content: @Composable () -> Unit) {
    val view = LocalView.current
    if (!view.isInEditMode) SideEffect {
        val window = (view.context as? Activity)?.window ?: return@SideEffect
        WindowCompat.getInsetsController(window, view).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }
    }
    MaterialTheme(
        colorScheme = RideTrackerColors,
        typography = RideTrackerTypography,
        shapes = RideTrackerShapes,
        content = content,
    )
}

@Composable
fun RideTrackerLogo(modifier: Modifier = Modifier) {
    Box(
        modifier
            .size(42.dp)
            .background(Brush.linearGradient(listOf(Color(0xFF12364B), Color(0xFF07131F))), RoundedCornerShape(14.dp)),
    ) {
        Canvas(Modifier.matchParentSize()) {
            val stroke = size.minDimension * .085f
            val bounds = Rect(size.width * .18f, size.height * .21f, size.width * .82f, size.height * .79f)
            drawArc(RideCyan, 205f, 244f, false, topLeft = bounds.topLeft, size = bounds.size, style = Stroke(stroke, cap = StrokeCap.Round))
            drawArc(RideGreen, 25f, 218f, false, topLeft = bounds.topLeft, size = bounds.size, style = Stroke(stroke, cap = StrokeCap.Round))
            drawCircle(RideRose, size.minDimension * .075f, Offset(size.width * .76f, size.height * .30f))
        }
    }
}
