package com.reelguard.app

import android.app.Application
import android.content.Context
import android.os.SystemClock
import android.provider.Settings
import androidx.datastore.preferences.preferencesDataStore
import com.reelguard.app.data.RulesRepository
import com.reelguard.app.data.SettingsRepository
import com.reelguard.app.data.UsageRepository
import com.reelguard.app.domain.Clock
import com.reelguard.app.domain.TimeStamp
import java.time.ZoneId
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.Dispatchers

private val Context.store by preferencesDataStore(name = "reelguard")

/** Real clocks: wall time, monotonic elapsed time, and the boot counter. */
class AndroidClock(private val context: Context) : Clock {
    override fun now(): TimeStamp = TimeStamp(
        wallMs = System.currentTimeMillis(),
        elapsedMs = SystemClock.elapsedRealtime(),
        bootCount = runCatching {
            Settings.Global.getInt(context.contentResolver, Settings.Global.BOOT_COUNT, -1)
        }.getOrDefault(-1),
    )

    override fun zone(): ZoneId = ZoneId.systemDefault()
}

/** Manual dependency container; the app is small enough not to need a DI framework. */
class AppContainer(context: Context) {
    private val app = context.applicationContext
    val clock: Clock = AndroidClock(app)
    val settings = SettingsRepository(app.store)
    val usage = UsageRepository(app.store)
    val rules = RulesRepository(app.store)

    /** For writes that must complete even if the screen that started them goes away. */
    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
}

class ReelGuardApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}

val Context.container: AppContainer get() = (applicationContext as ReelGuardApp).container
