// 上下文清理大师 —— 浏览器半的纯函数 / 注册 / 渲染冒烟测试。
// 运行：npm test（node --test）
import assert from 'node:assert'
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8')

// ── 最小 React 替身：createElement 只产出普通对象，hooks 由测试按顺序注入 ──
let hookValues = []
let hookIndex = 0
const React = {
  Fragment: Symbol('Fragment'),
  createElement(type, props, ...children) {
    return { type, props: props || {}, children }
  },
  useState(initial) {
    const value = hookValues[hookIndex]
    hookIndex += 1
    if (value !== undefined) return [value, () => {}]
    return [typeof initial === 'function' ? initial() : initial, () => {}]
  },
  useEffect() {},
  useRef(initial) {
    return { current: initial }
  },
}

let plugin = null
const sandbox = {
  console,
  Intl,
  setTimeout,
  clearTimeout,
  performance: { now: () => 0 },
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
  window: {
    __ModuleLoader__: {
      load(definition) {
        assert.equal(definition.id, 'dsh-plugin-context-cleanup-master')
        plugin = definition.factory(sandbox.require)
      },
    },
    localStorage: { getItem: () => null, setItem: () => {} },
    innerWidth: 1400,
    innerHeight: 900,
    addEventListener() {},
    removeEventListener() {},
  },
}
sandbox.require = (name) => {
  if (name === 'react') return React
  throw new Error('unexpected require: ' + name)
}

vm.createContext(sandbox)
vm.runInContext(source, sandbox)
assert.ok(plugin, 'plugin was loaded')
assert.deepEqual(plugin.inject, ['slots', 'locale'])
const test = plugin.__test
assert.ok(test, '__test helpers are exposed')

// ── 纯函数 ────────────────────────────────────────────────────────────────
assert.equal(test.formatCount(1284392), '1,284,392')
assert.equal(test.formatGb(12.34), '12.3 GB')
assert.equal(test.tokenCount({ uncachedInputTokens: 10, outputTokens: 5, cacheReadTokens: 3, cacheWriteTokens: 2 }), 20)
assert.equal(test.tokenCount(undefined), 0)
assert.ok(test.formatCompact(881000000).length > 0)
assert.ok(test.healthScoreFromTokens(0) >= 61)
assert.ok(test.healthScoreFromTokens(1e9) < test.healthScoreFromTokens(1000))
assert.equal(test.easeOutCubic(0), 0)
assert.equal(test.easeOutCubic(1), 1)
assert.equal(test.cleanMessageKey(10), 'clean.msg.0')
assert.equal(test.cleanMessageKey(90), 'clean.msg.3')
assert.equal(test.clampBallPosition({ x: -10, y: 99999 }).x, 8)

const placement = test.panelPlacement({ x: 1200, y: 700 })
assert.ok(placement.left >= 12 && placement.left <= 1400 - 420)
assert.ok(placement.top >= 12)

// ── 真实统计聚合：只算非空、非子会话；四桶求和 ────────────────────────────
const listSnapshot = {
  ids: ['s3', 's2', 's1', 'blank1', 'child1'],
  byId: {
    s1: { id: 's1', displayTitle: 'Old session', blank: false, updatedAt: 100, projectionValues: { tokenUsage: { uncachedInputTokens: 100, outputTokens: 50, cacheReadTokens: 25, cacheWriteTokens: 5 } } },
    s2: { id: 's2', displayTitle: 'Middle', blank: false, updatedAt: 200, projectionValues: {} },
    s3: { id: 's3', displayTitle: 'Newest session', blank: false, updatedAt: 300, projectionValues: { tokenUsage: { uncachedInputTokens: 1000, outputTokens: 500 } } },
    blank1: { id: 'blank1', displayTitle: 'New Session', blank: true, updatedAt: 400 },
    child1: { id: 'child1', displayTitle: 'subagent', blank: false, origin: 'subagent', updatedAt: 500 },
  },
}
const stats = test.collectScanStats(() => ({ getSnapshot: () => listSnapshot }))
assert.equal(stats.count, 3)
assert.equal(stats.totalTokens, 1680)
assert.equal(stats.sessions.length, 2)
assert.equal(stats.sessions[0].title, 'Newest session')
assert.ok(stats.health >= 61 && stats.health <= 97)
assert.ok(stats.junkGb >= 6 && stats.junkGb <= 20)
assert.equal(test.collectScanStats(undefined).count, 0)

// ── apply：注册 shell.overlay 悬浮球，注入 t / 服务读取器 ────────────────────
let registered = null
const calls = {}
const mockSessions = { list: { getSnapshot: () => listSnapshot } }
const mockUiWorkspace = {
  startSession() {
    calls.startSession = (calls.startSession || 0) + 1
  },
}
const ctx = {
  effect(fn) {
    const dispose = fn()
    return () => {
      if (typeof dispose === 'function') dispose()
    }
  },
  locale: {
    register() {
      return () => {}
    },
    bind() {
      return (key, params) => key + (params ? ' ' + JSON.stringify(params) : '')
    },
  },
  slots: {
    inject(name, callback) {
      calls.injectedSlot = name
      return callback()
    },
    register(options, component) {
      registered = { options, component }
      return () => {}
    },
  },
  get(name) {
    if (name === 'sessions') return mockSessions
    if (name === 'uiWorkspace') return mockUiWorkspace
    return undefined
  },
}
plugin.apply(ctx)
assert.equal(calls.injectedSlot, 'shell.overlay')
assert.ok(registered)
assert.equal(registered.options.name, 'shell.overlay')
assert.equal(registered.options.id, 'context-cleanup-master')
const props = registered.options.inject()
assert.equal(typeof props.t, 'function')
assert.equal(props.getSessionsList(), mockSessions.list)
assert.equal(props.startNewSession(), true)
assert.equal(calls.startSession, 1)

// 缺少 uiWorkspace 时返回 false 而不是抛错
const noServiceCtx = { ...ctx, get: () => undefined }
plugin.apply(noServiceCtx)

// ── 渲染冒烟：闭球 / 扫描 / 报告 / 清理 / 完成 ─────────────────────────────
const mockStats = {
  count: 3,
  totalTokens: 1680,
  sessions: [
    { id: 's3', title: 'Newest session', tokens: 1500, known: true, updatedAt: 300 },
    { id: 's1', title: 'Old session', tokens: 180, known: true, updatedAt: 100 },
  ],
  junkFragments: 3000,
  junkGb: 12.4,
  health: 78,
}
function render(hookState) {
  hookValues = hookState
  hookIndex = 0
  return registered.component(Object.assign({}, props))
}
function walk(node, visit) {
  if (node === null || node === undefined) return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (typeof node !== 'object') return
  visit(node)
  if (node.children) for (const child of node.children) walk(child, visit)
}
function collectText(node) {
  const out = []
  walk(node, (element) => {
    if (element && element.children) {
      for (const child of element.children) {
        if (typeof child === 'string' || typeof child === 'number') out.push(String(child))
      }
    }
  })
  return out
}

// 闭球：只有悬浮球
const ballTree = render([false, 'scan', { x: 100, y: 200 }, false, null, 0, 0, 0])
assert.ok(ballTree.props.className.includes('ccm-anchor'))
assert.equal(ballTree.props.style.left, '100px')
assert.ok(String(ballTree.props['aria-label']).includes('ball.title'))
const confettiCount = () => {
  let count = 0
  walk(doneTree, (element) => {
    if (element && element.props && element.props.className === 'ccm-confetti') count += 1
  })
  return count
}

// 扫描页
const scanText = collectText(render([true, 'scan', { x: 100, y: 200 }, false, mockStats, 55, 0, 900]))
assert.ok(scanText.some((text) => text.includes('55%')))
assert.ok(scanText.some((text) => text.includes('scan.title')))

// 报告页
const reportText = collectText(render([true, 'report', { x: 100, y: 200 }, false, mockStats, 100, 0, 1680]))
assert.ok(reportText.some((text) => text.includes('78')), 'health score is rendered')
assert.ok(reportText.some((text) => text.includes('12.4 GB')), 'junk size is rendered')
assert.ok(reportText.some((text) => text.includes('Newest session')), 'real session row is rendered')
assert.ok(reportText.some((text) => text.includes('report.cta')), 'CTA is rendered')

// 清理页
const cleaningText = collectText(render([true, 'cleaning', { x: 100, y: 200 }, false, mockStats, 100, 40, 1680]))
assert.ok(cleaningText.some((text) => text.includes('40%')))
assert.ok(cleaningText.some((text) => text.includes('5.0 GB')), 'released size is rendered')

// 完成页
const doneTree = render([true, 'done', { x: 100, y: 200 }, false, mockStats, 100, 100, 1680])
const doneText = collectText(doneTree)
assert.ok(doneText.some((text) => text.includes('100')), 'done score is rendered')
assert.ok(doneText.some((text) => text.includes('12.4 GB')), 'freed size is rendered')
assert.equal(confettiCount(), 12, 'confetti pieces are rendered')

// 空报告
const emptyText = collectText(render([true, 'report', { x: 100, y: 200 }, false, { count: 0, totalTokens: 0, sessions: [], junkFragments: 1200, junkGb: 7, health: 97 }, 100, 0, 0]))
assert.ok(emptyText.length > 0)

console.log('context-cleanup-master: all checks passed')
