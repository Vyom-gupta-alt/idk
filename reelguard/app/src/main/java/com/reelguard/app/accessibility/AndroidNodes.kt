package com.reelguard.app.accessibility

import android.view.accessibility.AccessibilityNodeInfo
import com.reelguard.app.detection.NodeQuery
import com.reelguard.app.detection.NodeView

/**
 * Adapters from the platform node API to the detector's content-free [NodeView].
 * Only the view id, selection state and visibility are read. Text is never accessed.
 */
internal class AndroidNodeView(private val node: AccessibilityNodeInfo) : NodeView {
    override val viewId: String? get() = node.viewIdResourceName
    override val isSelected: Boolean get() = node.isSelected
    override val isVisibleToUser: Boolean get() = node.isVisibleToUser
}

internal class AndroidNodeQuery(private val root: AccessibilityNodeInfo) : NodeQuery {
    override fun findByViewId(viewId: String): List<NodeView> =
        root.findAccessibilityNodeInfosByViewId(viewId).orEmpty().map(::AndroidNodeView)
}

/**
 * Developer inspector: lists the view ids (never text) present in Instagram's current
 * window, so rules can be updated after an Instagram release. Bounded breadth-first walk.
 */
internal object ViewIdInspector {
    private const val MAX_NODES = 800

    fun collect(root: AccessibilityNodeInfo): List<String> {
        val out = sortedSetOf<String>()
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)
        var visited = 0
        while (queue.isNotEmpty() && visited < MAX_NODES) {
            val node = queue.removeFirst()
            visited++
            node.viewIdResourceName?.let { id ->
                val flags = buildString {
                    if (node.isSelected) append(" [selected]")
                    if (!node.isVisibleToUser) append(" [hidden]")
                }
                out += id + flags
            }
            for (i in 0 until node.childCount) node.getChild(i)?.let(queue::add)
        }
        return out.toList()
    }
}
