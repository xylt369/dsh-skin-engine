/**
 * Open Theme — node half.
 * 监听 host 侧 agent/status（idle ⇄ running），通过 webServer 暴露
 * GET /open-theme/agent-status → { running }，供浏览器半区轮询，
 * 驱动动态背景的「Agent 思考态」联动（透镜光环自动点亮/熄灭）。
 */
export function apply(ctx) {
  let running = false;
  ctx.on('agent/status', (payload) => {
    running = !!(payload && payload.status === 'running');
  });
  const webServer = ctx.get('webServer');
  if (webServer) {
    ctx.effect(() => webServer.register({
      kind: 'exact',
      path: '/open-theme/agent-status',
      handler: (req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ running: running }));
      },
    }), 'open-theme: agent-status route');
  }
}
