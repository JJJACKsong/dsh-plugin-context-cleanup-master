/**
 * 上下文清理大师 — Host 半（空壳）。
 *
 * 这个插件全部活在浏览器里：只读会话列表里的 tokenUsage 投影做「扫描」统计、
 * 播放清理动画、最后调用 Client 的 `uiWorkspace.startSession()` 开一个新会话。
 *
 * Host 侧不发布 Cordis Service、不注册 Tool、不写会话日志、不发起任何模型请求，
 * 只需要一行 apply() 让 bundle 有一个可激活的宿主行。
 */
export function apply() {}
