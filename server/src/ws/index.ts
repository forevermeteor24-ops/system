// server/src/ws/index.ts
import { WebSocketServer } from "ws";
import { TrackPlayer } from "../simulator/trackPlayer";

interface StartTrackMessage {
  type: "start-track";
  orderId: string;
  points: { lng: number; lat: number }[];
}

interface ControlTrackMessage {
  type: "track-control";
  orderId: string;
  action: "pause" | "resume" | "stop";
}

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
      const msgStr = raw.toString();

      let msg: any;
      try {
        msg = JSON.parse(msgStr);
      } catch {
        return;
      }

      // request-current
      if (msg.type === "request-current") {
        const { orderId } = msg;

        const player = players.get(orderId);
        if (!player) {
          ws.send(JSON.stringify({ type: "no-track", orderId }));
          return;
        }

        const state = player.getCurrentState();
        ws.send(JSON.stringify({ type: "current-state", orderId, ...state }));
        return;
      }

      // start-track
      if (msg.type === "start-track") {
        const { orderId, points } = msg as StartTrackMessage;

        let player = players.get(orderId);
        if (!player) {
          player = new TrackPlayer(orderId, wss);
          players.set(orderId, player);
        }

        await player.startWithPoints(points);
        return;
      }

      // 控制
      if (msg.type === "track-control") {
        const { orderId, action } = msg as ControlTrackMessage;
        const player = players.get(orderId);
        if (!player) return;

        if (action === "pause") player.pause();
        if (action === "resume") player.resume();
        if (action === "stop") player.stop();
        return;
      }
    });

    ws.on("close", () => {
      console.log("❌ WS 客户端断开");
    });
  });

  return wss;
}

export function startTrack(orderId: string, points: { lng: number; lat: number }[]) {
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
