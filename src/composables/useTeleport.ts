import { tryOnScopeDispose } from '@vueuse/core'
import {
  defineComponent,
  h,
  nextTick,
  render,
  Teleport,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type TeleportProps,
  type VNode,
} from 'vue'

const TeleportWrapperComponent = defineComponent({
  setup: (props: { to: TeleportProps['to']; renderFn: () => VNode }) => {
    return () => {
      return h(Teleport, { to: props.to }, props.renderFn())
    }
  },
  props: ['to', 'renderFn'],
})

/**
 * useTeleport
 *
 * 在组合式 API 中以编程方式渲染 Teleport 内容。
 *
 * @param to Teleport 的目标节点，可以是响应式或静态值
 * @param renderFn 返回 VNode 的渲染函数
 * @returns stop 方法，可手动释放 Teleport
 */
export function useTeleport(to: MaybeRefOrGetter<TeleportProps['to']>, renderFn: () => VNode) {
  let vnode: VNode | null = null
  let container: HTMLElement | null = null

  /**
   * 清理 Teleport 渲染内容和容器
   */
  const cleanup = () => {
    if (container) {
      render(null, container)
      // container 不插入 DOM，仅作为 render 的挂载点，Teleport 会将内容挂载到 to 指定的目标节点
      container.remove()
      vnode = null
      container = null
    }
  }

  const stopWatch = watch(
    () => toValue(to),
    (target) => {
      // 使用 nextTick 确保在 DOM 更新后再进行渲染和清理，避免副作用和渲染顺序问题。
      // 尤其在循环渲染多个 Teleport 时，nextTick 能保证所有渲染和 ref 绑定在同一微任务后统一完成，
      // 避免如 ref 数组等副作用在循环中被逐步修改，确保拿到的是最终完整的结果。
      nextTick(() => {
        cleanup()

        if (!target) return

        container = document.createElement('div')
        // container 仅作为 render 的挂载点，无需插入到 document 中。
        // Teleport 组件会自动将其子节点渲染到目标节点（to），
        // container 本身不会出现在页面结构中，这样可以避免无用的 DOM 节点。
        vnode = h(TeleportWrapperComponent, { to: target, renderFn: renderFn })
        render(vnode, container)
      })
    },
    { immediate: true },
  )

  /**
   * 停止 Teleport 并清理资源
   */
  const stop = () => {
    stopWatch()
    // 使用 nextTick 确保在 DOM 更新后再进行清理，保证渲染和销毁顺序一致。
    // 循环销毁多个 Teleport 时，也能保证副作用在同一微任务后统一处理。
    nextTick(() => {
      cleanup()
    })
  }

  tryOnScopeDispose(stop)

  // 返回 stop 方法，便于手动释放
  return { stop }
}
