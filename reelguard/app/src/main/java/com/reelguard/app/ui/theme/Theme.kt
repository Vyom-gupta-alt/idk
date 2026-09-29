package com.reelguard.app.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

private val LightColors = lightColorScheme(
    primary = Color(0xFF2F6A4F),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFB2F1CF),
    onPrimaryContainer = Color(0xFF002113),
    secondary = Color(0xFF4D6357),
    secondaryContainer = Color(0xFFCFE9D9),
    tertiary = Color(0xFF3D6373),
    tertiaryContainer = Color(0xFFC1E8FB),
    background = Color(0xFFF6FBF5),
    surface = Color(0xFFF6FBF5),
    surfaceVariant = Color(0xFFDCE5DC),
    error = Color(0xFFBA1A1A),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF96D5B4),
    onPrimary = Color(0xFF003824),
    primaryContainer = Color(0xFF125138),
    onPrimaryContainer = Color(0xFFB2F1CF),
    secondary = Color(0xFFB4CCBE),
    secondaryContainer = Color(0xFF354B40),
    tertiary = Color(0xFFA5CCDE),
    tertiaryContainer = Color(0xFF244C5B),
    background = Color(0xFF0F1511),
    surface = Color(0xFF0F1511),
    surfaceVariant = Color(0xFF404943),
    error = Color(0xFFFFB4AB),
)

/** Status colors that stay meaningful in both themes (not derived from dynamic color). */
@Immutable
data class StatusColors(val good: Color, val warn: Color, val bad: Color)

val LocalStatusColors = staticCompositionLocalOf {
    StatusColors(good = Color(0xFF2E7D32), warn = Color(0xFFB26A00), bad = Color(0xFFC62828))
}

@Composable
fun ReelGuardTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = true,
    content: @Composable () -> Unit,
) {
    val colors = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val ctx = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(ctx) else dynamicLightColorScheme(ctx)
        }
        darkTheme -> DarkColors
        else -> LightColors
    }
    val status = if (darkTheme) {
        StatusColors(good = Color(0xFF81C784), warn = Color(0xFFFFB74D), bad = Color(0xFFEF9A9A))
    } else {
        StatusColors(good = Color(0xFF2E7D32), warn = Color(0xFFB26A00), bad = Color(0xFFC62828))
    }
    androidx.compose.runtime.CompositionLocalProvider(LocalStatusColors provides status) {
        MaterialTheme(colorScheme = colors, content = content)
    }
}
