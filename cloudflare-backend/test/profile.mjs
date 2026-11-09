// Optional, localhost-only DevTools CPU sampling. This is a diagnostic, not a
// simulation of Cloudflare's production CPU meter or a free-plan assertion.
export async function profileRequest(runtime, operation) {
  const inspector = await runtime.getInspectorURL();
  const discovery = new URL("/json/list", inspector);
  discovery.protocol = "http:";
  const targets = await (await fetch(discovery)).json();
  const target = targets.find(target => target.id.includes("core:user:"))
    ?? targets.find(target => target.webSocketDebuggerUrl);
  if (!target) throw new Error("No local user Worker inspector target");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (!pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  try {
    await command("Profiler.enable");
    await command("Profiler.setSamplingInterval", { interval: 1000 });
    await command("Profiler.start");
    const response = await operation();
    const { profile } = await command("Profiler.stop");
    const nodes = new Map(profile.nodes.map(node => [node.id, node]));
    let activeUs = 0;
    let idleUs = 0;
    for (let i = 0; i < (profile.samples?.length ?? 0); i++) {
      const name = nodes.get(profile.samples[i])?.callFrame.functionName;
      if (["(idle)", "(root)"].includes(name)) idleUs += profile.timeDeltas[i];
      else activeUs += profile.timeDeltas[i];
    }
    return { response, profile, summary: { activeSampleMs: activeUs / 1000, idleSampleMs: idleUs / 1000,
      limitation: "Local DevTools sampling includes profiling overhead; native/background CPU and production accounting can differ." } };
  } finally {
    socket.close();
  }
}
