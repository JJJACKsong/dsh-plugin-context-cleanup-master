/**
 * 上下文清理大师 — 浏览器半（手写 bundle，无构建步骤）。
 *
 * 仿老式电脑管家/手机管家的「一键清理」：右下角常驻悬浮球（可拖动、位置记在
 * localStorage），点开从球边弹出一张管家卡片：先做一次「深度扫描」——扫描数据
 * 是真的，从宿主会话目录快照里读最近会话的 tokenUsage 投影，汇总近期会话消耗
 * 的 token 量，并据此算一个「上下文健康度」；然后播一段纯表演的清理动画，最后
 * 调 uiWorkspace.startSession() 开一个全新会话。
 *
 * 边界：
 *   - 不调模型、不写会话日志、不改任何会话数据；
 *   - 唯一的真实副作用是「新建会话」；
 *   - 「垃圾体积 / 释放空间」是演出数字，token、会话数、健康度由真数据推出来。
 *
 * 文案走 ctx.locale（中英字典内联在下面），locale/*.json 只给 Plugin Manager
 * 的 meta。样式走注入的 <style>，配色是作品自己的管家风，不消费宿主主题。
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-context-cleanup-master',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    // ── 身份与常量 ──────────────────────────────────────────────────────────
    const NS = 'contextCleanupMaster'
    const SLOT_ID = 'context-cleanup-master'
    const LS_POSITION = 'ccm.ball.position.v1'
    const BALL_SIZE = 58
    const BALL_MARGIN = 22
    const PANEL_W = 420
    const PANEL_EST_H = 486
    const PANEL_GAP = 14
    const PANEL_MARGIN = 12
    const SCAN_DURATION_MS = 2100
    const CLEAN_DURATION_MS = 1900
    const LAUNCH_DELAY_MS = 1300
    const RECENT_SESSION_LIMIT = 8
    const REPORT_SESSION_LIMIT = 3

    // ── 字典 ────────────────────────────────────────────────────────────────
    /** 简体中文（key 集合的基准）。 */
    const zh = {
      'ball.title': '上下文清理大师',
      'ball.action': '一键清理',
      'ball.badge': '!',
      'aria.close': '关闭',
      'panel.version': 'v9.9.9 极速版',
      'panel.slogan': '安全 · 无广告 · 不伤数据',
      'scan.center': '扫描中',
      'scan.title': '正在深度扫描',
      'scan.msg': '正在检测上下文健康度…',
      'scan.item.fragments': '无效上下文碎片',
      'scan.item.cache': '重复会话缓存',
      'scan.item.index': '过期注意力索引',
      'scan.found': '已发现 {n} 个冗余片段',
      'report.center': '健康度',
      'report.title': '扫描完成',
      'report.sub': '{n} 个近期会话参与检测',
      'report.chip.sessions': '近期会话',
      'report.chip.tokens': '累计 tokens',
      'report.chip.junk': '可清理垃圾',
      'report.detail': '消耗最多的近期会话',
      'report.noSessions': '暂无可统计的会话上下文',
      'report.cta': '一键清理',
      'report.cancel': '暂不清理',
      'report.tip': '安全清理 · 不伤数据 · 已有 1,284,392 位用户使用',
      'clean.center': '清理中',
      'clean.title': '正在清理',
      'clean.msg.0': '正在清理会话缓存…',
      'clean.msg.1': '正在释放上下文空间…',
      'clean.msg.2': '正在优化注意力索引…',
      'clean.msg.3': '即将完成…',
      'clean.freed': '已释放 {size}',
      'clean.safe': '安全清理中，请勿关闭页面',
      'done.title': '清理完成',
      'done.freed': '已释放 {size} 空间',
      'done.sub': '本次清理未产生任何副作用',
      'done.launch': '正在为您开启全新上下文…',
    }

    /** English dictionary. */
    const en = {
      'ball.title': 'Context Cleanup Master',
      'ball.action': 'One-click clean',
      'ball.badge': '!',
      'aria.close': 'Close',
      'panel.version': 'v9.9.9 Turbo',
      'panel.slogan': 'Safe · No ads · No data loss',
      'scan.center': 'Scanning',
      'scan.title': 'Deep scan in progress',
      'scan.msg': 'Checking your context health…',
      'scan.item.fragments': 'Orphaned context fragments',
      'scan.item.cache': 'Duplicate session caches',
      'scan.item.index': 'Stale attention indexes',
      'scan.found': '{n} redundant fragments found',
      'report.center': 'Health',
      'report.title': 'Scan complete',
      'report.sub': 'Based on {n} recent sessions',
      'report.chip.sessions': 'Recent sessions',
      'report.chip.tokens': 'Total tokens',
      'report.chip.junk': 'Junk found',
      'report.detail': 'Sessions using the most context',
      'report.noSessions': 'No session context to measure yet',
      'report.cta': 'Clean now',
      'report.cancel': 'Not now',
      'report.tip': 'Safe cleanup · No data loss · 1,284,392 users',
      'clean.center': 'Cleaning',
      'clean.title': 'Cleaning up',
      'clean.msg.0': 'Clearing session caches…',
      'clean.msg.1': 'Releasing context space…',
      'clean.msg.2': 'Optimizing attention indexes…',
      'clean.msg.3': 'Almost done…',
      'clean.freed': '{size} released',
      'clean.safe': 'Safe cleanup in progress, keep this page open',
      'done.title': 'Cleanup complete',
      'done.freed': '{size} released',
      'done.sub': 'This cleanup produced no side effects',
      'done.launch': 'Opening a fresh context for you…',
    }

    // ── 样式 ────────────────────────────────────────────────────────────────
    const CSS = [
      // 悬浮球
      '.ccm-anchor{position:fixed;z-index:1200;width:58px;height:58px;pointer-events:auto;cursor:grab;user-select:none;-webkit-user-select:none;touch-action:none;',
      'animation:ccm-bob 3.6s ease-in-out infinite;outline:none}',
      '.ccm-anchor:hover,.ccm-anchor:focus-visible{animation-play-state:paused}',
      '.ccm-anchor:active{cursor:grabbing}',
      '.ccm-ball{position:absolute;inset:0;border-radius:50%;corner-shape:round;display:flex;align-items:center;justify-content:center;',
      'background:radial-gradient(circle at 31% 24%,#9cfade 0%,#22d3a4 46%,#09b4c9 100%);',
      'box-shadow:0 10px 26px rgba(3,132,104,.4),inset 0 1px 2px rgba(255,255,255,.75),inset 0 -2px 6px rgba(3,96,80,.28),0 0 0 2px rgba(255,255,255,.55);',
      'transition:transform 150ms cubic-bezier(.2,.9,.3,1.2),box-shadow 150ms ease}',
      '.ccm-anchor:hover .ccm-ball,.ccm-anchor:focus-visible .ccm-ball{transform:scale(1.06);box-shadow:0 14px 32px rgba(3,132,104,.48),inset 0 1px 2px rgba(255,255,255,.8),inset 0 -2px 6px rgba(3,96,80,.28),0 0 0 2px rgba(255,255,255,.7)}',
      '.ccm-anchor:active .ccm-ball{transform:scale(.97)}',
      '.ccm-anchor:focus-visible .ccm-ball{outline:3px solid rgba(72,240,190,.75);outline-offset:3px}',
      '.ccm-halo{position:absolute;inset:-9px;border-radius:50%;corner-shape:round;border:2px solid rgba(46,228,174,.42);animation:ccm-halo 2.8s ease-out infinite;pointer-events:none}',
      '.ccm-badge{position:absolute;top:-3px;right:-3px;min-width:15px;height:15px;border-radius:999px;corner-shape:round;display:flex;align-items:center;justify-content:center;',
      'padding:0 3px;background:linear-gradient(135deg,#ff8a4c,#ff3d5a);color:#fff;font-weight:800;font-size:9.5px;line-height:1;',
      'box-shadow:0 2px 6px rgba(255,61,90,.42);border:1px solid rgba(255,255,255,.85);animation:ccm-badge 2.6s ease-in-out infinite;pointer-events:none}',
      '.ccm-tip{position:absolute;right:calc(100% + 12px);top:50%;transform:translateY(-50%) translateX(4px);white-space:nowrap;',
      'background:rgba(9,52,43,.95);color:#d9fff2;font-size:12px;line-height:1.2;padding:7px 11px;border-radius:9px;letter-spacing:.02em;',
      'opacity:0;pointer-events:none;transition:opacity 140ms ease,transform 140ms ease;box-shadow:0 6px 16px rgba(0,0,0,.22)}',
      '.ccm-tip:after{content:"";position:absolute;left:100%;top:50%;transform:translateY(-50%);border:5px solid transparent;border-left-color:rgba(9,52,43,.95)}',
      '.ccm-anchor:hover .ccm-tip,.ccm-anchor:focus-visible .ccm-tip{opacity:1;transform:translateY(-50%) translateX(0)}',

      // 页面遮罩与扫描线
      '.ccm-scrim{position:fixed;inset:0;z-index:1500;background:rgba(4,20,16,.2);animation:ccm-fade 180ms ease both;cursor:default}',
      '.ccm-scanline{position:fixed;left:0;right:0;height:2px;z-index:1501;pointer-events:none;',
      'background:linear-gradient(90deg,transparent,rgba(72,244,190,.55) 22%,rgba(120,255,214,.9) 50%,rgba(72,244,190,.55) 78%,transparent);',
      'box-shadow:0 0 18px rgba(72,244,190,.55);animation:ccm-sweep 1.7s cubic-bezier(.4,.08,.6,.92) both}',

      // 面板
      '.ccm-panel{position:fixed;z-index:1502;width:420px;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);overflow:auto;',
      'background:linear-gradient(180deg,#ffffff 0%,#f4fcf9 70%,#ecf9f3 100%);border-radius:22px;',
      'box-shadow:0 26px 64px rgba(3,38,30,.38),0 4px 14px rgba(3,38,30,.14),inset 0 1px 0 rgba(255,255,255,.9);',
      'border:1px solid rgba(255,255,255,.6);font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif;',
      'color:#123f35;animation:ccm-pop 260ms cubic-bezier(.2,.95,.3,1.16) both;scrollbar-width:none}',
      '.ccm-panel::-webkit-scrollbar{display:none}',

      // 头部渐变
      '.ccm-head{position:relative;display:flex;align-items:center;gap:11px;padding:15px 16px 14px;border-radius:22px 22px 0 0;overflow:hidden;',
      'background:linear-gradient(118deg,#10d49b 0%,#0bb8cd 58%,#0a9fd9 100%);color:#fff}',
      '.ccm-head:after{content:"";position:absolute;inset:0;pointer-events:none;opacity:.5;',
      'background-image:radial-gradient(rgba(255,255,255,.32) 1px,transparent 1.2px);background-size:13px 13px;mask-image:linear-gradient(120deg,transparent 35%,#000 100%);-webkit-mask-image:linear-gradient(120deg,transparent 35%,#000 100%)}',
      '.ccm-logo{position:relative;z-index:1;flex:none;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;',
      'background:rgba(255,255,255,.22);box-shadow:inset 0 1px 2px rgba(255,255,255,.55),0 4px 12px rgba(0,60,50,.2)}',
      '.ccm-headText{position:relative;z-index:1;display:flex;flex-direction:column;gap:3px;min-width:0}',
      '.ccm-titleRow{display:flex;align-items:center;gap:8px;min-width:0}',
      '.ccm-title{font-size:15.5px;font-weight:800;letter-spacing:.01em;white-space:nowrap}',
      '.ccm-ver{flex:none;font-size:9.5px;font-weight:600;letter-spacing:.04em;padding:2px 6px;border-radius:999px;corner-shape:round;background:rgba(255,255,255,.22);color:#eafff8}',
      '.ccm-slogan{font-size:10.5px;color:rgba(255,255,255,.86);letter-spacing:.03em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.ccm-close{position:relative;z-index:2;margin-left:auto;flex:none;width:27px;height:27px;border:none;border-radius:50%;corner-shape:round;cursor:pointer;',
      'display:flex;align-items:center;justify-content:center;padding:0;background:rgba(255,255,255,.18);color:#fff;font-size:16px;line-height:1;transition:background 140ms ease}',
      '.ccm-close:hover{background:rgba(255,255,255,.32)}',

      // 面板主体
      '.ccm-body{padding:14px 16px 16px;display:flex;flex-direction:column;gap:12px}',
      '.ccm-hero{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;padding-top:2px}',
      '.ccm-ringWrap{position:relative;width:132px;height:132px;display:flex;align-items:center;justify-content:center}',
      '.ccm-ring{position:absolute;inset:0;transform:rotate(-90deg);filter:drop-shadow(0 4px 10px rgba(9,180,142,.18))}',
      '.ccm-ring circle{fill:none;stroke-linecap:round}',
      '.ccm-ring .ccm-track{stroke:#e2f2eb;stroke-width:9}',
      '.ccm-ring .ccm-progress{stroke-width:9;transition:stroke-dashoffset 160ms linear,stroke 240ms ease}',
      '.ccm-ring .ccm-spin{stroke-width:2;stroke-dasharray:3 8;opacity:.65;transform-origin:66px 66px;animation:ccm-spin 7s linear infinite}',
      '.ccm-ringCenter{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;min-height:76px}',
      '.ccm-ringBig{font-size:31px;font-weight:800;line-height:1;color:#0c6f5a;font-variant-numeric:tabular-nums;letter-spacing:-.02em}',
      '.ccm-ringBig.is-warn{color:#e08a1e}',
      '.ccm-ringSmall{font-size:10px;color:#7aa79a;letter-spacing:.1em;font-weight:600}',
      '.ccm-ringCheck{margin-bottom:1px}',
      '.ccm-heroTitle{font-size:14.5px;font-weight:800;color:#0d4437;text-align:center;margin-top:2px}',
      '.ccm-heroSub{font-size:11px;color:#6f9c8e;text-align:center}',

      // 报告页
      '.ccm-chips{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}',
      '.ccm-chip{display:flex;flex-direction:column;align-items:center;gap:2px;padding:9px 4px 8px;border-radius:13px;',
      'background:linear-gradient(180deg,#ffffff,#f3fbf7);border:1px solid #dcefe7;box-shadow:0 2px 6px rgba(15,110,87,.05)}',
      '.ccm-chipValue{font-size:15.5px;font-weight:800;color:#0b6f5a;font-variant-numeric:tabular-nums;letter-spacing:-.02em}',
      '.ccm-chipLabel{font-size:10px;color:#7aa79a;letter-spacing:.02em;white-space:nowrap}',
      '.ccm-chip.is-warn{background:linear-gradient(180deg,#fff9f1,#fff3e3);border-color:#f6dfc0}',
      '.ccm-chip.is-warn .ccm-chipValue{color:#d97c13}',
      '.ccm-sectionTitle{font-size:10.5px;color:#84ad9f;letter-spacing:.1em;font-weight:600;margin:0 0 -4px 2px}',
      '.ccm-rows{display:flex;flex-direction:column;gap:6px}',
      '.ccm-row{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:10px;font-size:12px;color:#2c5f52;',
      'background:#ffffff;border:1px solid #e3f1eb;box-shadow:0 1px 3px rgba(15,110,87,.04)}',
      '.ccm-rowDot{flex:none;width:7px;height:7px;border-radius:50%;corner-shape:round;background:linear-gradient(135deg,#2fe0a6,#0bb4c6);box-shadow:0 0 0 3px rgba(43,214,168,.14)}',
      '.ccm-rowTitle{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.ccm-rowToken{flex:none;font-weight:700;color:#0b7a61;font-variant-numeric:tabular-nums;font-size:11.5px}',
      '.ccm-row.is-empty{justify-content:center;color:#84ad9f;font-size:11px;border-style:dashed;background:transparent;box-shadow:none}',
      '.ccm-actions{display:flex;flex-direction:column;gap:6px;margin-top:2px}',
      '.ccm-cta{position:relative;width:100%;height:46px;border:none;border-radius:15px;cursor:pointer;overflow:hidden;',
      'background:linear-gradient(135deg,#16d395 0%,#0bb4c6 60%,#0a9fd9 100%);color:#fff;font-size:15px;font-weight:800;letter-spacing:.08em;',
      'box-shadow:0 10px 24px rgba(9,170,140,.36),inset 0 1px 0 rgba(255,255,255,.4);transition:transform 120ms ease,box-shadow 120ms ease}',
      '.ccm-cta:after{content:"";position:absolute;top:-60%;bottom:-60%;left:-30%;width:26%;transform:rotate(18deg);',
      'background:linear-gradient(90deg,transparent,rgba(255,255,255,.26),transparent);animation:ccm-shine 3.2s ease-in-out infinite}',
      '.ccm-cta:hover{transform:translateY(-1px);box-shadow:0 13px 28px rgba(9,170,140,.44),inset 0 1px 0 rgba(255,255,255,.4)}',
      '.ccm-cta:active{transform:translateY(0) scale(.995)}',
      '.ccm-ghost{width:100%;height:28px;border:none;border-radius:9px;corner-shape:round;background:transparent;color:#76a496;font-size:11.5px;cursor:pointer}',
      '.ccm-ghost:hover{color:#2f6b5c;background:rgba(16,170,130,.07)}',
      '.ccm-tipLine{text-align:center;font-size:9.5px;color:#9dbdb2;letter-spacing:.02em}',
      '.ccm-note{text-align:center;font-size:10.5px;color:#8ab0a4}',

      // 扫描页
      '.ccm-scanList{display:flex;flex-direction:column;gap:7px}',
      '.ccm-scanItem{display:flex;align-items:center;gap:9px;font-size:12.5px;color:#4a776b;opacity:.2;transform:translateY(3px);transition:opacity 200ms ease,transform 200ms ease}',
      '.ccm-scanItem.is-on{opacity:1;transform:none}',
      '.ccm-scanDot{flex:none;width:17px;height:17px;border-radius:50%;corner-shape:round;background:#e2f2eb;color:#fff;font-size:10.5px;line-height:17px;text-align:center;font-weight:800}',
      '.ccm-scanItem.is-on .ccm-scanDot{background:linear-gradient(160deg,#33e6a8,#0bbf9b);box-shadow:0 2px 6px rgba(17,190,153,.32)}',
      '.ccm-scanText{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.ccm-found{font-size:10.5px;color:#84ad9f;text-align:right;font-variant-numeric:tabular-nums;margin-top:-2px}',
      '.ccm-bar{height:7px;border-radius:99px;corner-shape:round;background:#e5f3ed;overflow:hidden;box-shadow:inset 0 1px 2px rgba(9,90,70,.07)}',
      '.ccm-barFill{height:100%;border-radius:99px;corner-shape:round;background:linear-gradient(90deg,#2ee0a4,#12b7d3);transition:width 120ms linear}',
      '.ccm-cleanPct{text-align:center;font-size:12px;color:#6f9c8e;font-variant-numeric:tabular-nums;margin-top:-4px}',
      '.ccm-cleanMsg{text-align:center;font-size:12.5px;color:#3f7264;font-weight:600}',
      '.ccm-cleanFreed{text-align:center;font-size:11px;color:#84ad9f;font-variant-numeric:tabular-nums}',

      // 完成页
      '.ccm-done{margin-top:-2px}',
      '.ccm-confettiLayer{position:absolute;inset:0;pointer-events:none;overflow:visible}',
      '.ccm-confetti{position:absolute;left:50%;top:46%;width:7px;height:7px;border-radius:2px;background:var(--ccm-c,#2ee0a4);opacity:0;',
      'animation:ccm-burst .95s cubic-bezier(.15,.7,.3,1) forwards;animation-delay:var(--ccm-d,0s)}',

      // 关键帧
      '@keyframes ccm-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}',
      '@keyframes ccm-halo{0%{transform:scale(.9);opacity:.7}70%{transform:scale(1.17);opacity:0}100%{transform:scale(1.17);opacity:0}}',
      '@keyframes ccm-badge{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}',
      '@keyframes ccm-fade{from{opacity:0}to{opacity:1}}',
      '@keyframes ccm-pop{from{opacity:0;transform:scale(.93) translateY(10px)}to{opacity:1;transform:none}}',
      '@keyframes ccm-sweep{0%{top:-3px;opacity:0}8%{opacity:1}92%{opacity:1}100%{top:100vh;opacity:0}}',
      '@keyframes ccm-spin{to{transform:rotate(360deg)}}',
      '@keyframes ccm-shine{0%,55%{left:-30%}85%,100%{left:118%}}',
      '@keyframes ccm-burst{0%{opacity:1;transform:translate(0,0) scale(1)}100%{opacity:0;transform:translate(var(--ccm-x,0),var(--ccm-y,-40px)) scale(.5) rotate(160deg)}}',
      '@media (prefers-reduced-motion: reduce){.ccm-anchor,.ccm-halo,.ccm-badge,.ccm-scanline,.ccm-ring .ccm-spin{animation:none}.ccm-panel{animation-duration:1ms}.ccm-confetti{animation-duration:1ms}}',
    ].join('')

    // ── 纯工具 ──────────────────────────────────────────────────────────────
    /** 缓出曲线，计数类动画用。 */
    function easeOutCubic(value) {
      const p = Math.min(1, Math.max(0, value))
      return 1 - Math.pow(1 - p, 3)
    }

    /** 千分位数字。 */
    function formatCount(value) {
      const n = Math.max(0, Math.round(Number(value) || 0))
      return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    }

    /** 紧凑数字：跟随系统语言（中文出「亿/万」，英文出 K/M）。 */
    function formatCompact(value) {
      const n = Math.max(0, Math.round(Number(value) || 0))
      try {
        return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 2 }).format(n)
      } catch (error) {
        return formatCount(n)
      }
    }

    /** GB 展示（一位小数）。 */
    function formatGb(value) {
      const n = Math.max(0, Number(value) || 0)
      return n.toFixed(1) + ' GB'
    }

    /** tokenUsage 投影的四个桶求和。 */
    function tokenCount(usage) {
      if (usage === null || typeof usage !== 'object') return 0
      return (usage.uncachedInputTokens || 0) +
        (usage.outputTokens || 0) +
        (usage.cacheReadTokens || 0) +
        (usage.cacheWriteTokens || 0)
    }

    /** 由真实 token 总量推一个「上下文健康度」：越重分越低。 */
    function healthScoreFromTokens(total) {
      const n = Math.max(0, Number(total) || 0)
      const score = Math.round(100 - Math.log10(n + 10) * 4)
      return Math.max(61, Math.min(97, score))
    }

    /** 视口内夹住一个球坐标。 */
    function clampBallPosition(position) {
      if (typeof window === 'undefined') return { x: BALL_MARGIN, y: BALL_MARGIN }
      const maxX = Math.max(0, window.innerWidth - BALL_SIZE - 8)
      const maxY = Math.max(0, window.innerHeight - BALL_SIZE - 8)
      const x = Math.min(maxX, Math.max(8, Number(position && position.x)))
      const y = Math.min(maxY, Math.max(8, Number(position && position.y)))
      return { x: Number.isFinite(x) ? x : BALL_MARGIN, y: Number.isFinite(y) ? y : BALL_MARGIN }
    }

    /** 默认位置：右下角。 */
    function defaultBallPosition() {
      return clampBallPosition({
        x: (typeof window === 'undefined' ? 900 : window.innerWidth) - BALL_SIZE - BALL_MARGIN,
        y: (typeof window === 'undefined' ? 700 : window.innerHeight) - BALL_SIZE - BALL_MARGIN,
      })
    }

    /** 读回上次拖放的位置。 */
    function readBallPosition() {
      try {
        const raw = window.localStorage.getItem(LS_POSITION)
        if (raw !== null && raw !== '') {
          const parsed = JSON.parse(raw)
          if (parsed && Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
            return clampBallPosition(parsed)
          }
        }
      } catch (error) {
        // localStorage 不可用时退回默认位置
      }
      return defaultBallPosition()
    }

    /** 记住位置。 */
    function saveBallPosition(position) {
      try {
        window.localStorage.setItem(LS_POSITION, JSON.stringify({ x: position.x, y: position.y }))
      } catch (error) {
        // 忽略：只是位置记忆
      }
    }

    /** 面板相对球的位置：优先放在球上方，放不下就放下方，左右夹在视口内。 */
    function panelPlacement(position) {
      if (typeof window === 'undefined') return { left: PANEL_MARGIN, top: PANEL_MARGIN, origin: 'top right' }
      const vw = window.innerWidth
      const vh = window.innerHeight
      const width = Math.min(PANEL_W, vw - PANEL_MARGIN * 2)
      const left = Math.min(Math.max(PANEL_MARGIN, position.x + BALL_SIZE - width), vw - width - PANEL_MARGIN)
      const above = position.y - PANEL_GAP - PANEL_EST_H
      const top = above >= PANEL_MARGIN ? above : Math.min(position.y + BALL_SIZE + PANEL_GAP, Math.max(PANEL_MARGIN, vh - PANEL_EST_H - PANEL_MARGIN))
      return { left, top, origin: above >= PANEL_MARGIN ? 'bottom right' : 'top right' }
    }

    /**
     * 汇总近期会话的真实统计。
     *
     * 数据来自宿主 `sessions.list` 快照：最近会话的 tokenUsage 投影（未缓存输入、
     * 输出、缓存读、缓存写四个桶）本来就是会话列表行携带的 summary 投影，不需要
     * 打开任何会话历史。会话数、token、健康度都是真数据；junk 相关数字是演出。
     */
    function collectScanStats(getSessionsList) {
      const stats = {
        count: 0,
        totalTokens: 0,
        sessions: [],
        junkFragments: 0,
        junkGb: 0,
        health: 0,
      }
      try {
        const store = typeof getSessionsList === 'function' ? getSessionsList() : undefined
        const snapshot = store && typeof store.getSnapshot === 'function' ? store.getSnapshot() : undefined
        const ids = snapshot && Array.isArray(snapshot.ids) ? snapshot.ids : []
        const byId = snapshot && snapshot.byId && typeof snapshot.byId === 'object' ? snapshot.byId : {}
        const rows = []
        for (const id of ids) {
          const row = byId[id]
          if (!row || row.blank === true || row.origin === 'subagent') continue
          const usage = row.projectionValues && row.projectionValues.tokenUsage
          const known = usage !== null && usage !== undefined
          rows.push({
            id,
            title: typeof row.displayTitle === 'string' && row.displayTitle !== '' ? row.displayTitle
              : (typeof row.title === 'string' && row.title !== '' ? row.title : id),
            tokens: known ? tokenCount(usage) : 0,
            known,
            updatedAt: Number.isFinite(row.updatedAt) ? row.updatedAt : 0,
          })
        }
        rows.sort((left, right) => right.updatedAt - left.updatedAt)
        const recent = rows.slice(0, RECENT_SESSION_LIMIT)
        stats.count = recent.length
        for (const row of recent) if (row.known) stats.totalTokens += row.tokens
        stats.sessions = recent
          .filter((row) => row.known && row.tokens > 0)
          .slice(0, REPORT_SESSION_LIMIT)
      } catch (error) {
        console.warn('[context-cleanup-master] scan failed:', error)
      }
      stats.health = healthScoreFromTokens(stats.totalTokens)
      // 演出数字：碎片数与「垃圾体积」只影响动画文案，不参与任何真实操作。
      stats.junkFragments = 1200 + Math.floor(Math.random() * 3600) + stats.count * 37
      stats.junkGb = Math.round((6 + Math.random() * 14) * 10) / 10
      return stats
    }

    // ── 图标 ────────────────────────────────────────────────────────────────
    /** 品牌图标：绿球上的小扫帚 + 星点。 */
    function BrandIcon(size) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true,
      },
      h('path', { d: 'M15.4 3.6 11.2 11.1', stroke: '#fff', strokeWidth: 2, strokeLinecap: 'round' }),
      h('path', { d: 'M9.2 10.2 12.2 13.2 9.4 15.6 4.6 20.4 3.6 16.6 6.4 11.6Z', fill: '#fff', opacity: '.96' }),
      h('path', { d: 'M5.6 16.2 10.4 12.6', stroke: '#0ba98a', strokeWidth: 1.1, strokeLinecap: 'round', opacity: '.5' }),
      h('path', { d: 'M7.6 18.4 11.4 14.8', stroke: '#0ba98a', strokeWidth: 1.1, strokeLinecap: 'round', opacity: '.5' }),
      h('path', { d: 'M18.9 5.1l.45 1.3 1.3.45-1.3.45-.45 1.3-.45-1.3-1.3-.45 1.3-.45z', fill: '#fff' }),
      )
    }

    /** 完成对勾。 */
    function CheckIcon(size) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M5 12.6l4.2 4.2L19 7.2', stroke: '#0bb88f', strokeWidth: 2.8, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      )
    }

    /** 清理扫描文案：进度映射到固定的四句。 */
    function cleanMessageKey(progress) {
      if (progress < 26) return 'clean.msg.0'
      if (progress < 52) return 'clean.msg.1'
      if (progress < 78) return 'clean.msg.2'
      return 'clean.msg.3'
    }

    /** 完成页的彩纸：固定 12 个方向，颜色和延迟错开。 */
    const CONFETTI = [
      ['-46px', '-40px', '#2ee0a4', '0ms'], ['-22px', '-56px', '#ffd166', '40ms'],
      ['0px', '-60px', '#4cc9f0', '0ms'], ['22px', '-54px', '#ff8fab', '60ms'],
      ['44px', '-38px', '#2ee0a4', '20ms'], ['54px', '-10px', '#f5a623', '80ms'],
      ['50px', '18px', '#4cc9f0', '10ms'], ['30px', '40px', '#ff8fab', '70ms'],
      ['2px', '50px', '#2ee0a4', '30ms'], ['-26px', '42px', '#ffd166', '90ms'],
      ['-48px', '20px', '#4cc9f0', '50ms'], ['-54px', '-12px', '#f5a623', '100ms'],
    ]

    /** 环形进度环。 */
    function ScoreRing(props) {
      const radius = 52
      const circumference = 2 * Math.PI * radius
      const progress = Math.max(0, Math.min(100, Number(props.progress) || 0))
      const tone = props.tone === 'warn' ? '#f0a029' : props.tone === 'cyan' ? '#20bcd9' : '#11c89a'
      const offset = circumference * (1 - progress / 100)
      return h('div', { className: 'ccm-ringWrap' },
        h('svg', { className: 'ccm-ring', width: 132, height: 132, viewBox: '0 0 132 132', 'aria-hidden': true },
          h('circle', { className: 'ccm-track', cx: 66, cy: 66, r: radius }),
          h('circle', {
            className: 'ccm-progress',
            cx: 66, cy: 66, r: radius,
            stroke: tone,
            strokeDasharray: circumference,
            strokeDashoffset: offset,
          }),
          props.spinning ? h('circle', { className: 'ccm-spin', cx: 66, cy: 66, r: radius - 9, stroke: tone }) : null,
        ),
        h('div', { className: 'ccm-ringCenter' },
          props.check ? h('span', { className: 'ccm-ringCheck' }, CheckIcon(20)) : null,
          h('span', { className: 'ccm-ringBig' + (props.tone === 'warn' ? ' is-warn' : '') }, props.big),
          h('span', { className: 'ccm-ringSmall' }, props.small),
        ),
      )
    }

    // ── 组件 ────────────────────────────────────────────────────────────────
    /**
     * 悬浮球 + 清理面板。
     *
     * 注入的 props：
     *   - t：locale 绑定后的翻译函数；
     *   - getSessionsList：惰性取宿主 `sessions.list` 快照 store；
     *   - startNewSession：惰性调用 `uiWorkspace.startSession()`。
     * 其余标准 props（useSessions 等）不使用。
     */
    function CleanupMaster(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key
      const getSessionsList = props.getSessionsList
      const startNewSession = props.startNewSession

      const [open, setOpen] = React.useState(false)
      const [phase, setPhase] = React.useState('scan')
      const [position, setPosition] = React.useState(readBallPosition)
      const [dragging, setDragging] = React.useState(false)
      const [stats, setStats] = React.useState(null)
      const [scanProgress, setScanProgress] = React.useState(0)
      const [cleanProgress, setCleanProgress] = React.useState(0)
      const [displayTokens, setDisplayTokens] = React.useState(0)

      const positionRef = React.useRef(position)
      positionRef.current = position
      const dragRef = React.useRef(null)
      const launchedRef = React.useRef(false)
      const suppressClickRef = React.useRef(false)

      // 视口变化时把球夹回可视区
      React.useEffect(() => {
        if (typeof window === 'undefined') return undefined
        const onResize = () => setPosition((current) => clampBallPosition(current))
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
      }, [])

      const closePanel = () => {
        setOpen(false)
        setPhase('scan')
      }

      const openPanel = () => {
        if (open) return
        launchedRef.current = false
        setStats(collectScanStats(getSessionsList))
        setScanProgress(0)
        setCleanProgress(0)
        setDisplayTokens(0)
        setPhase('scan')
        setOpen(true)
      }

      // 扫描阶段：计数与进度
      React.useEffect(() => {
        if (!open || phase !== 'scan' || stats === null) return undefined
        const startedAt = (typeof performance !== 'undefined' ? performance.now() : Date.now())
        const duration = SCAN_DURATION_MS - 140
        let frame = 0
        const tick = (now) => {
          const p = Math.min(1, Math.max(0, (now - startedAt) / duration))
          const eased = easeOutCubic(p)
          setScanProgress(Math.round(eased * 100))
          setDisplayTokens(Math.round(stats.totalTokens * eased))
          if (p < 1) frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(frame)
      }, [open, phase, stats])

      // 扫描阶段：到点切到报告
      React.useEffect(() => {
        if (!open || phase !== 'scan' || stats === null) return undefined
        const timer = setTimeout(() => {
          setScanProgress(100)
          setDisplayTokens(stats.totalTokens)
          setPhase('report')
        }, SCAN_DURATION_MS)
        return () => clearTimeout(timer)
      }, [open, phase, stats])

      // 清理阶段：进度
      React.useEffect(() => {
        if (!open || phase !== 'cleaning') return undefined
        const startedAt = (typeof performance !== 'undefined' ? performance.now() : Date.now())
        const duration = CLEAN_DURATION_MS - 120
        let frame = 0
        const tick = (now) => {
          const p = Math.min(1, Math.max(0, (now - startedAt) / duration))
          setCleanProgress(Math.round(easeOutCubic(p) * 100))
          if (p < 1) frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(frame)
      }, [open, phase])

      // 清理阶段：到点切到完成
      React.useEffect(() => {
        if (!open || phase !== 'cleaning') return undefined
        const timer = setTimeout(() => {
          setCleanProgress(100)
          setPhase('done')
        }, CLEAN_DURATION_MS)
        return () => clearTimeout(timer)
      }, [open, phase])

      // 完成阶段：短暂停留后开启新会话
      React.useEffect(() => {
        if (!open || phase !== 'done') return undefined
        const timer = setTimeout(() => {
          if (!launchedRef.current) {
            launchedRef.current = true
            try {
              if (typeof startNewSession === 'function') startNewSession()
            } catch (error) {
              console.warn('[context-cleanup-master] failed to start a new session:', error)
            }
          }
          setOpen(false)
          setPhase('scan')
        }, LAUNCH_DELAY_MS)
        return () => clearTimeout(timer)
      }, [open, phase, startNewSession])

      // ESC 随时可退出（清理中退出则不会开新会话）
      React.useEffect(() => {
        if (!open || typeof window === 'undefined') return undefined
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            setOpen(false)
            setPhase('scan')
          }
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
      }, [open])

      // ── 拖动 ─────────────────────────────────────────────────────────────
      const onBallPointerDown = (event) => {
        if (event.button !== 0) return
        const target = event.currentTarget
        dragRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          originX: position.x,
          originY: position.y,
          moved: false,
          target,
        }
        try { target.setPointerCapture(event.pointerId) } catch (error) { /* 忽略 */ }
        setDragging(true)
      }

      const onBallPointerMove = (event) => {
        const drag = dragRef.current
        if (!drag || drag.pointerId !== event.pointerId) return
        const dx = event.clientX - drag.startX
        const dy = event.clientY - drag.startY
        if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true
        if (!drag.moved) return
        const next = clampBallPosition({ x: drag.originX + dx, y: drag.originY + dy })
        positionRef.current = next
        setPosition(next)
      }

      const finishDrag = (event, cancelled) => {
        const drag = dragRef.current
        if (!drag || drag.pointerId !== event.pointerId) return
        dragRef.current = null
        setDragging(false)
        try { drag.target.releasePointerCapture(event.pointerId) } catch (error) { /* 忽略 */ }
        if (drag.moved) {
          suppressClickRef.current = true
          saveBallPosition(positionRef.current)
          return
        }
        if (!cancelled) openPanel()
      }

      // ── 渲染 ─────────────────────────────────────────────────────────────
      const renderBall = () => h('div', {
        className: 'ccm-anchor',
        style: { left: position.x + 'px', top: position.y + 'px' },
        role: 'button',
        tabIndex: 0,
        'aria-label': t('ball.title') + ' · ' + t('ball.action'),
        title: t('ball.title'),
        onPointerDown: onBallPointerDown,
        onPointerMove: onBallPointerMove,
        onPointerUp: (event) => finishDrag(event, false),
        onPointerCancel: (event) => finishDrag(event, true),
        onClick: () => {
          if (suppressClickRef.current) { suppressClickRef.current = false; return }
          if (dragRef.current === null) openPanel()
        },
        onKeyDown: (event) => {
          if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
            event.preventDefault()
            openPanel()
          }
        },
      },
      h('span', { className: 'ccm-halo', 'aria-hidden': true }),
      h('div', { className: 'ccm-ball' }, BrandIcon(27)),
      h('span', { className: 'ccm-badge', 'aria-hidden': true }, t('ball.badge')),
      h('span', { className: 'ccm-tip' }, t('ball.action')),
      )

      const renderScan = () => {
        const scanItems = ['scan.item.fragments', 'scan.item.cache', 'scan.item.index']
        const found = stats === null ? 0 : Math.round(stats.junkFragments * (scanProgress / 100))
        return h(React.Fragment, null,
          h('div', { className: 'ccm-hero' },
            ScoreRing({ progress: scanProgress, big: scanProgress + '%', small: t('scan.center'), tone: 'cyan', spinning: true }),
            h('div', { className: 'ccm-heroTitle' }, t('scan.title')),
            h('div', { className: 'ccm-heroSub' }, t('scan.msg')),
          ),
          h('div', { className: 'ccm-scanList' }, scanItems.map((key, index) => {
            const revealed = scanProgress >= (index + 1) * 24
            return h('div', { key, className: 'ccm-scanItem' + (revealed ? ' is-on' : '') },
              h('span', { className: 'ccm-scanDot' }, revealed ? '✓' : ''),
              h('span', { className: 'ccm-scanText' }, t(key)),
            )
          })),
          h('div', { className: 'ccm-found' }, t('scan.found', { n: formatCompact(found) })),
          h('div', { className: 'ccm-bar' }, h('div', { className: 'ccm-barFill', style: { width: scanProgress + '%' } })),
        )
      }

      const renderReport = () => {
        const junkGb = stats === null ? 0 : stats.junkGb
        const health = stats === null ? 0 : stats.health
        const rows = stats === null ? [] : stats.sessions
        return h(React.Fragment, null,
          h('div', { className: 'ccm-hero' },
            ScoreRing({ progress: health, big: String(health), small: t('report.center'), tone: health < 80 ? 'warn' : 'ok' }),
            h('div', { className: 'ccm-heroTitle' }, t('report.title')),
            h('div', { className: 'ccm-heroSub' }, t('report.sub', { n: formatCount(stats === null ? 0 : stats.count) })),
          ),
          h('div', { className: 'ccm-chips' },
            h('div', { className: 'ccm-chip' },
              h('span', { className: 'ccm-chipValue' }, formatCount(stats === null ? 0 : stats.count)),
              h('span', { className: 'ccm-chipLabel' }, t('report.chip.sessions')),
            ),
            h('div', { className: 'ccm-chip' },
              h('span', { className: 'ccm-chipValue' }, formatCompact(stats === null ? 0 : stats.totalTokens)),
              h('span', { className: 'ccm-chipLabel' }, t('report.chip.tokens')),
            ),
            h('div', { className: 'ccm-chip is-warn' },
              h('span', { className: 'ccm-chipValue' }, formatGb(junkGb)),
              h('span', { className: 'ccm-chipLabel' }, t('report.chip.junk')),
            ),
          ),
          h('div', { className: 'ccm-sectionTitle' }, t('report.detail')),
          h('div', { className: 'ccm-rows' },
            rows.length === 0
              ? h('div', { className: 'ccm-row is-empty' }, t('report.noSessions'))
              : rows.map((row) => h('div', { key: row.id, className: 'ccm-row' },
                h('span', { className: 'ccm-rowDot', 'aria-hidden': true }),
                h('span', { className: 'ccm-rowTitle', title: row.title }, row.title),
                h('span', { className: 'ccm-rowToken' }, formatCompact(row.tokens)),
              )),
          ),
          h('div', { className: 'ccm-actions' },
            h('button', {
              type: 'button',
              className: 'ccm-cta',
              onClick: () => {
                setCleanProgress(0)
                setPhase('cleaning')
              },
            }, t('report.cta')),
            h('button', { type: 'button', className: 'ccm-ghost', onClick: closePanel }, t('report.cancel')),
          ),
          h('div', { className: 'ccm-tipLine' }, t('report.tip')),
        )
      }

      const renderCleaning = () => {
        const junkGb = stats === null ? 0 : stats.junkGb
        return h(React.Fragment, null,
          h('div', { className: 'ccm-hero' },
            ScoreRing({ progress: cleanProgress, big: cleanProgress + '%', small: t('clean.center'), tone: 'ok', spinning: true }),
            h('div', { className: 'ccm-heroTitle' }, t('clean.title')),
            h('div', { className: 'ccm-cleanPct' }, t(cleanMessageKey(cleanProgress))),
          ),
          h('div', { className: 'ccm-bar' }, h('div', { className: 'ccm-barFill', style: { width: cleanProgress + '%' } })),
          h('div', { className: 'ccm-cleanFreed' }, t('clean.freed', { size: formatGb((junkGb * cleanProgress) / 100) })),
          h('div', { className: 'ccm-note' }, t('clean.safe')),
        )
      }

      const renderDone = () => {
        const junkGb = stats === null ? 0 : stats.junkGb
        return h(React.Fragment, null,
          h('div', { className: 'ccm-hero' },
            ScoreRing({ progress: 100, big: '100', small: t('report.center'), tone: 'ok', check: true }),
            h('div', { className: 'ccm-confettiLayer', 'aria-hidden': true },
              CONFETTI.map(([x, y, color, delay], index) => h('span', {
                key: index,
                className: 'ccm-confetti',
                style: { '--ccm-x': x, '--ccm-y': y, '--ccm-c': color, '--ccm-d': delay },
              })),
            ),
            h('div', { className: 'ccm-heroTitle' }, t('done.title')),
            h('div', { className: 'ccm-heroSub' }, t('done.freed', { size: formatGb(junkGb) })),
          ),
          h('div', { className: 'ccm-note' }, t('done.sub')),
          h('div', { className: 'ccm-cleanMsg' }, t('done.launch')),
        )
      }

      const renderBody = () => {
        if (phase === 'report') return renderReport()
        if (phase === 'cleaning') return renderCleaning()
        if (phase === 'done') return renderDone()
        return renderScan()
      }

      const renderPanel = () => {
        const placement = panelPlacement(position)
        const closable = phase === 'scan' || phase === 'report'
        return h('div', { className: 'ccm-panelLayer', style: { position: 'fixed', inset: 0, zIndex: 1500, pointerEvents: 'none' } },
          h('div', {
            className: 'ccm-scrim',
            style: { pointerEvents: 'auto' },
            onClick: () => { if (closable) closePanel() },
          }),
          phase === 'scan' ? h('div', { className: 'ccm-scanline', 'aria-hidden': true }) : null,
          h('div', {
            className: 'ccm-panel',
            style: { left: placement.left + 'px', top: placement.top + 'px', transformOrigin: placement.origin, pointerEvents: 'auto' },
            role: 'region',
            'aria-label': t('ball.title'),
          },
          h('div', { className: 'ccm-head' },
            h('span', { className: 'ccm-logo' }, BrandIcon(23)),
            h('div', { className: 'ccm-headText' },
              h('div', { className: 'ccm-titleRow' },
                h('strong', { className: 'ccm-title' }, t('ball.title')),
                h('span', { className: 'ccm-ver' }, t('panel.version')),
              ),
              h('div', { className: 'ccm-slogan' }, t('panel.slogan')),
            ),
            closable
              ? h('button', {
                type: 'button',
                className: 'ccm-close',
                'aria-label': t('aria.close'),
                onClick: closePanel,
              }, '×')
              : null,
          ),
          h('div', { className: 'ccm-body' }, renderBody()),
          ),
        )
      }

      return open ? renderPanel() : renderBall()
    }

    // ── 安装 ────────────────────────────────────────────────────────────────
    /** 把作品样式挂到 <head>，卸载时移除。 */
    function installStyles() {
      if (typeof document === 'undefined') return () => {}
      const tagId = 'dsh-plugin-context-cleanup-master/context-cleanup-master.css'
      const existing = document.querySelector('style[data-plugin-css="' + tagId + '"]')
      if (existing !== null) {
        return () => {
          if (existing.parentNode !== null) existing.parentNode.removeChild(existing)
        }
      }
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-plugin-context-cleanup-master'
      tag.dataset.pluginCss = tagId
      tag.textContent = CSS
      document.head.appendChild(tag)
      return () => {
        if (tag.parentNode !== null) tag.parentNode.removeChild(tag)
      }
    }

    /** 浏览器服务：槽位注册与文案。 */
    const inject = ['slots', 'locale']

    /**
     * 浏览器半入口：装字典、装样式、在 shell.overlay 注册悬浮球。
     * @param {object} ctx - Client root context.
     * @returns {void}
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'context-cleanup-master: dictionaries')
      ctx.effect(() => installStyles(), 'context-cleanup-master: styles')

      let translate
      try {
        translate = ctx.locale.bind(NS)
      } catch (error) {
        translate = (key) => zh[key] || key
      }

      /** 惰性取会话列表 store：服务可能晚于本插件激活。 */
      const getSessionsList = () => {
        try {
          const sessions = ctx.get('sessions')
          return sessions && sessions.list ? sessions.list : undefined
        } catch (error) {
          return undefined
        }
      }

      /**
       * 打开一个全新会话（与侧栏 New Session 同一入口）。
       * 不发送任何消息、不修改任何已有会话。
       */
      const startNewSession = () => {
        try {
          const uiWorkspace = ctx.get('uiWorkspace')
          if (uiWorkspace && typeof uiWorkspace.startSession === 'function') {
            uiWorkspace.startSession()
            return true
          }
        } catch (error) {
          console.warn('[context-cleanup-master] startSession failed:', error)
        }
        return false
      }

      const injected = () => ({ t: translate, getSessionsList, startNewSession })

      ctx.effect(
        () => ctx.slots.inject('shell.overlay', () => ctx.slots.register(
          { name: 'shell.overlay', id: SLOT_ID, order: 900, inject: injected },
          CleanupMaster,
        )),
        'context-cleanup-master: floating ball',
      )
    }

    // 供单元测试使用的纯函数出口（模块加载器只读 inject / apply，额外字段无副作用）。
    const __test = {
      collectScanStats,
      formatCount,
      formatCompact,
      formatGb,
      tokenCount,
      clampBallPosition,
      easeOutCubic,
      cleanMessageKey,
      healthScoreFromTokens,
      panelPlacement,
    }

    return { inject, apply, __test }
  },
})
