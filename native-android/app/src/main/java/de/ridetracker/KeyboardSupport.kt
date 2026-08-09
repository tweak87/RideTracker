package de.ridetracker

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardHide
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController

/** Always-visible escape from text editing for tablets and gesture-navigation devices. */
@Composable
fun KeyboardDismissButton() {
    val keyboard = LocalSoftwareKeyboardController.current
    val focusManager = LocalFocusManager.current
    IconButton(onClick = { focusManager.clearFocus(force = true); keyboard?.hide() }) {
        Icon(Icons.Filled.KeyboardHide, contentDescription = "Tastatur schließen")
    }
}
