package com.reelguard.app.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.produceState
import com.reelguard.app.domain.Clock
import com.reelguard.app.domain.TimeStamp
import kotlinx.coroutines.delay

/** Current time, refreshed every [periodMs] while the composable is on screen (UI only). */
@Composable
fun rememberTicker(clock: Clock, periodMs: Long = 1_000L): State<TimeStamp> =
    produceState(clock.now(), clock) {
        while (true) {
            value = clock.now()
            delay(periodMs)
        }
    }
