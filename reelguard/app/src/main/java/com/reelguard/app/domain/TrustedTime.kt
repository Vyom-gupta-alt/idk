package com.reelguard.app.domain

import java.time.Instant
import java.time.ZoneId
import kotlinx.serialization.Serializable
import kotlin.math.abs

/**
 * A point in time captured from both clocks.
 *
 * [elapsedMs] is `SystemClock.elapsedRealtime()`: monotonic, counts deep sleep, cannot be
 * changed by the user, and resets on reboot. [bootCount] tells us whether two stamps share a boot.
 * [wallMs] is the user-adjustable wall clock.
 */
@Serializable
data class TimeStamp(val wallMs: Long, val elapsedMs: Long, val bootCount: Int)

interface Clock {
    fun now(): TimeStamp
    fun zone(): ZoneId
}

/**
 * A deadline that survives wall-clock manipulation: within the same boot it is measured on
 * the monotonic clock; after a reboot it falls back to the wall clock (a documented limitation).
 */
@Serializable
data class Deadline(val wallMs: Long, val elapsedMs: Long, val bootCount: Int) {
    fun remainingMs(now: TimeStamp): Long {
        val sameBoot = bootCount >= 0 && now.bootCount == bootCount
        val remaining = if (sameBoot) elapsedMs - now.elapsedMs else wallMs - now.wallMs
        return remaining.coerceAtLeast(0)
    }

    fun isActive(now: TimeStamp): Boolean = remainingMs(now) > 0

    companion object {
        fun after(now: TimeStamp, durationMs: Long) =
            Deadline(now.wallMs + durationMs, now.elapsedMs + durationMs, now.bootCount)
    }
}

object TrustedTime {
    /** Differences below this are treated as ordinary NTP corrections, not manipulation. */
    const val CLOCK_TOLERANCE_MS = 5 * 60_000L

    /**
     * Wall time we believe, given an [anchor] captured earlier in the same boot. If the wall
     * clock moved away from what the monotonic clock predicts, trust the monotonic estimate.
     */
    fun trustedWallMs(anchor: TimeStamp?, now: TimeStamp): Long {
        if (anchor != null && anchor.bootCount >= 0 && anchor.bootCount == now.bootCount) {
            val estimate = anchor.wallMs + (now.elapsedMs - anchor.elapsedMs)
            if (abs(now.wallMs - estimate) > CLOCK_TOLERANCE_MS) return estimate
        }
        return now.wallMs
    }

    fun dayKey(wallMs: Long, zone: ZoneId): String =
        Instant.ofEpochMilli(wallMs).atZone(zone).toLocalDate().toString()

    fun minuteOfDay(wallMs: Long, zone: ZoneId): Int {
        val t = Instant.ofEpochMilli(wallMs).atZone(zone).toLocalTime()
        return t.hour * 60 + t.minute
    }
}
