package com.reelguard.app.blocking

import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.reelguard.app.container
import com.reelguard.app.detection.DetectionRules
import com.reelguard.app.domain.BlockReason
import com.reelguard.app.domain.BlockRequest
import com.reelguard.app.domain.FalsePositiveReport
import com.reelguard.app.domain.OverrideAvailability
import com.reelguard.app.domain.OverrideManager
import com.reelguard.app.domain.PolicyResolver
import com.reelguard.app.domain.ReelOrigin
import com.reelguard.app.domain.ScreenState
import com.reelguard.app.domain.UsageLogic
import com.reelguard.app.domain.UsageState
import com.reelguard.app.domain.UserSettings
import com.reelguard.app.ui.components.OverrideFlow
import com.reelguard.app.ui.components.rememberTicker
import com.reelguard.app.domain.BlockAction
import com.reelguard.app.ui.theme.ReelGuardTheme
import kotlinx.coroutines.launch

/**
 * Full-screen block screen, started by the accessibility service (an AccessibilityService
 * is exempt from background-activity-start restrictions). Runs in its own task and is
 * excluded from Recents, so it never becomes part of Instagram's back stack.
 */
class BlockActivity : ComponentActivity() {

    private var request by mutableStateOf<BlockRequest?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        request = intent.toRequest()
        val c = container

        setContent {
            ReelGuardTheme {
                val settings by c.settings.settings.collectAsStateWithLifecycle(UserSettings())
                val usage by c.usage.usage.collectAsStateWithLifecycle(UsageState())
                val rules by c.rules.rules.collectAsStateWithLifecycle(DetectionRules.DEFAULT)
                var showOverride by rememberSaveable { mutableStateOf(false) }
                var reportSaved by rememberSaveable(request) { mutableStateOf(false) }
                val req = request ?: BlockRequest(BlockReason.REELS_FEED, BlockAction.NONE, ScreenState.UNKNOWN, null, 0)

                val now by rememberTicker(c.clock)
                val policy = PolicyResolver.resolve(settings)
                val copy = BlockCopyFactory.create(req.reason, policy, UsageLogic.rollover(usage, now, c.clock.zone()), now)

                BackHandler {
                    when {
                        showOverride -> showOverride = false
                        copy.canReturnToInstagram -> finish()
                        else -> goHome()
                    }
                }

                if (showOverride) {
                    val availability = OverrideManager.availability(settings.overrides, usage, now, c.clock.zone())
                    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.surface) {
                        OverrideFlow(
                            availability = availability,
                            settings = settings.overrides,
                            onGrant = { minutes ->
                                c.appScope.launch {
                                    c.usage.update {
                                        OverrideManager.grant(settings.overrides, it, c.clock.now(), c.clock.zone(), minutes) ?: it
                                    }
                                }
                                finish()
                            },
                            onCancel = { showOverride = false },
                            modifier = Modifier
                                .safeDrawingPadding()
                                .verticalScroll(rememberScrollState())
                                .padding(24.dp),
                        )
                    }
                } else {
                    BlockScreen(
                        copy = copy,
                        overrideOffered = settings.overrides.enabled &&
                            OverrideManager.availability(settings.overrides, usage, now, c.clock.zone()) !is OverrideAvailability.Disabled,
                        reportSaved = reportSaved,
                        onGoBack = { finish() },
                        onCloseInstagram = { goHome() },
                        onOverride = { showOverride = true },
                        onReportMistake = {
                            reportSaved = true
                            val report = FalsePositiveReport(
                                wallMs = System.currentTimeMillis(),
                                reason = req.reason,
                                screen = req.screen,
                                origin = req.origin,
                                reelsSeen = req.reelsSeen,
                                rulesVersion = rules.version,
                            )
                            c.appScope.launch { c.usage.update { UsageLogic.addReport(it, report) } }
                        },
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        request = intent.toRequest()
    }

    private fun goHome() {
        startActivity(
            Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
        finish()
    }

    companion object {
        private const val EXTRA_REASON = "reason"
        private const val EXTRA_SCREEN = "screen"
        private const val EXTRA_ORIGIN = "origin"
        private const val EXTRA_REELS_SEEN = "reels_seen"

        fun intent(context: Context, request: BlockRequest): Intent =
            Intent(context, BlockActivity::class.java)
                .putExtra(EXTRA_REASON, request.reason.name)
                .putExtra(EXTRA_SCREEN, request.screen.name)
                .putExtra(EXTRA_ORIGIN, request.origin?.name)
                .putExtra(EXTRA_REELS_SEEN, request.reelsSeen)
                .addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP,
                )

        fun launch(context: Context, request: BlockRequest) {
            context.startActivity(intent(context, request))
        }

        private fun Intent.toRequest(): BlockRequest = BlockRequest(
            reason = enumOrNull<BlockReason>(getStringExtra(EXTRA_REASON)) ?: BlockReason.REELS_FEED,
            action = BlockAction.NONE,
            screen = enumOrNull<ScreenState>(getStringExtra(EXTRA_SCREEN)) ?: ScreenState.UNKNOWN,
            origin = enumOrNull<ReelOrigin>(getStringExtra(EXTRA_ORIGIN)),
            reelsSeen = getIntExtra(EXTRA_REELS_SEEN, 0),
        )

        private inline fun <reified T : Enum<T>> enumOrNull(name: String?): T? =
            name?.let { n -> enumValues<T>().firstOrNull { it.name == n } }
    }
}
