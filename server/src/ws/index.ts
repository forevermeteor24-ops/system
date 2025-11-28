// server/src/ws/index.ts
import * as ws from "ws";
import { TrackPlayer } from "../simulator/trackPlayer";

/**
 * 使用兼容写法：不直接依赖某个命名导出（避免不同 ws 版本的 TS 导出差异）
 * 在运行时使用 ws.Server，TS 层用 any 来避免声明问题。
 */

type WSAny = any; // 兼容各种 ws 类型声明
const WebSocketServer: any = (ws as any).Server || (ws as any).WebSocketServer || (ws as any).default?.Server;

const players = new Map<string, TrackPlayer>();
let wssGlobal: WSAny | null = null;

export function setupWS(server: any) {
  // 创建 server（兼容各种导出）
  const wss = new WebSocketServer({ server });
  wssGlobal = wss;

  console.log("🛰 WebSocket 服务已启动");

  wss.on("connection", (wsConn: WSAny) => {
    console.log("🌐 WS 客户端已连接");

    // 自定义字段，用于订阅某个订单
    wsConn.subscribedOrderId = null;

    wsConn.on("message", async (raw: any) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      // 订阅订单
      if (msg.type === "subscribe") {
        wsConn.subscribedOrderId = msg.orderId;
        return;
      }

      // 请求当前状态
      if (msg.type === "request-current") {
        const player = players.get(msg.orderId);

        if (!player) {
          wsConn.send(JSON.stringify({ type: "no-track", orderId: msg.orderId }));
          return;
        }

        wsConn.send(
          JSON.stringify({
            type: "current-state",
            orderId: msg.orderId,
            ...player.getCurrentState(),
          })
        );
        return;
      }

      // 启动轨迹（来自前端的控制）
      if (msg.type === "start-track") {
        let player = players.get(msg.orderId);

        if (!player && wssGlobal) {
          player = new TrackPlayer(msg.orderId, wssGlobal);
          players.set(msg.orderId, player);
        }

        await player?.startWithPoints(msg.points);
        return;
      }

      // 控制：pause / resume / stop
      if (msg.type === "track-control") {
        const player = players.get(msg.orderId);
        if (!player) return;

        if (msg.action === "pause") player.pause();
        if (msg.action === "resume") player.resume();
        if (msg.action === "stop") player.stop();

        return;
      }
    });

    wsConn.on("close", () => {
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
