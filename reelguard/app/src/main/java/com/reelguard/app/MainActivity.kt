package com.reelguard.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import com.reelguard.app.ui.AppRoot
import com.reelguard.app.ui.MainViewModel
import com.reelguard.app.ui.theme.ReelGuardTheme

class MainActivity : ComponentActivity() {
    private val vm: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            ReelGuardTheme {
                AppRoot(vm)
            }
        }
    }
}
