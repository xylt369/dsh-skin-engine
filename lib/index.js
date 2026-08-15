/**
 * Open Theme — node half.
 * 监听 host 侧 agent/status（idle ⇄ running），通过 webServer 暴露
 * GET /open-theme/agent-status → { running }，供浏览器半区轮询，
 * 驱动动态背景的「Agent 思考态」联动（透镜光环自动点亮/熄灭）。
 */
export function apply(ctx) {
  let running = false;
  // 兼容性：旧版 dsh 可能没有 agent/status 事件，缺失时静默降级（光环不自动联动）
  try {
    ctx.on('agent/status', (payload) => {
      running = !!(payload && payload.status === 'running');
    });
  } catch (e) {
    /* 事件不存在则跳过联动 */
  }
  const webServer = ctx.get('webServer');
  if (webServer) {
    try {
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/open-theme/agent-status',
        handler: (req, res) => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ running: running }));
        },
      }), 'open-theme: agent-status route');
    } catch (e) {
      /* 路由注册失败不阻塞插件 */
    }
  }
}
