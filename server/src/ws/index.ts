import { WebSocketServer } from "ws";
import { TrackPlayer } from "../simulator/trackPlayer";

const players = new Map<string, TrackPlayer>();
let wssGlobal: WebSocketServer | null = null;

export function setupWS(server: any) {
  const wss = new WebSocketServer({ server });
  wssGlobal = wss;

  console.log("🛰 WebSocket 服务已启动");

  wss.on("connection", (ws: any) => {
    console.log("🌐 WS 客户端已连接");
    ws.subscribedOrderId = null;

    ws.on("message", async (raw: any) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      // ---------------------------
      // 订阅
      // ---------------------------
      if (msg.type === "subscribe") {
        ws.subscribedOrderId = msg.orderId;
        return;
      }

      // ---------------------------
      // 请求当前状态
      // ---------------------------
      if (msg.type === "request-current") {
        const player = players.get(msg.orderId);

        if (!player) {
          ws.send(JSON.stringify({ type: "no-track", orderId: msg.orderId }));
          return;
        }

        ws.send(
          JSON.stringify({
            type: "current-state",
            orderId: msg.orderId,
            ...player.getCurrentState(),
          })
        );
        return;
      }

      // ---------------------------
      // 启动轨迹
      // ---------------------------
      if (msg.type === "start-track") {
        let player = players.get(msg.orderId);

        if (!player && wssGlobal) {
          player = new TrackPlayer(msg.orderId, wssGlobal);
          players.set(msg.orderId, player);
        }

        await player?.startWithPoints(msg.points);
        return;
      }

      // ---------------------------
      // 控制
      // ---------------------------
      if (msg.type === "track-control") {
        const player = players.get(msg.orderId);
        if (!player) return;

        if (msg.action === "pause") player.pause?.();
        else if (msg.action === "resume") player.resume?.();
        else if (msg.action === "stop") player.stop();

        return;
      }
    });

    ws.on("close", () => {
      console.log("❌ WS 客户端断开");
    });
  });

  return wss;
}

export function startTrack(orderId: string, points: any[]) {
  if (!wssGlobal) return;

  let player = players.get(orderId);
  if (!player) {
    player = new TrackPlayer(orderId, wssGlobal);
    players.set(orderId, player);
  }
  player.startWithPoints(points);
}

export function getPlayer(orderId: string) {
  return players.get(orderId) || null;
}
