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

// 保存所有 TrackPlayer（每个订单一个）
const players = new Map<string, TrackPlayer>();

// 全局 WebSocketServer 实例引用
let wssGlobal: WebSocketServer | null = null;

/**
 * 初始化 WebSocket 服务并绑定到传入的 HTTP server
 * 返回创建的 wss（同时会将实例保存在 wssGlobal）
 */
export function setupWS(server: any) {
  const wss = new WebSocketServer({ server });
  wssGlobal = wss;

  console.log("🛰 WebSocket 服务已启动");

  wss.on("connection", (ws: any) => {
    console.log("🌐 WS 客户端已连接");

    // -----------------------------
    // 每个客户端记录其订阅的订单 ID
    // -----------------------------
    ws.subscribedOrderId = null;

    ws.on("message", (raw: any) => {
      const msgStr = raw.toString();

      // ping / pong
      try {
        const pingMsg = JSON.parse(msgStr);
        if (pingMsg && pingMsg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        }
      } catch {}

      let msg: any;
      try {
        msg = JSON.parse(msgStr);
      } catch (err) {
        console.warn("❌ 非 JSON 消息:", msgStr);
        return;
      }

      // -------------------------
      // 客户端订阅某个订单（方案 A 核心）
      // -------------------------
      if (msg.type === "subscribe") {
        if (!msg.orderId) {
          ws.send(JSON.stringify({ type: "error", message: "missing orderId in subscribe" }));
          return;
        }

        ws.subscribedOrderId = msg.orderId;
        console.log(`📌 客户端订阅订单: ${ws.subscribedOrderId}`);

        return;
      }

      // -------------------------
      // request-current
      // -------------------------
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

      // -------------------------
      // start-track
      // -------------------------
      if (msg.type === "start-track") {
        const { orderId, points } = msg as StartTrackMessage;
        if (!orderId || !Array.isArray(points) || points.length === 0) {
          console.warn("start-track: invalid payload");
          return;
        }

        console.log(`🚚 start-track (client) order=${orderId} points=${points.length}`);

        let player = players.get(orderId);
        if (!player) {
          if (!wssGlobal) {
            return console.error("start-track: wssGlobal not ready");
          }
          player = new TrackPlayer(orderId, wssGlobal);
          players.set(orderId, player);
        }

        player.startWithPoints(points);
        return;
      }

      // -------------------------
      // track-control
      // -------------------------
      if (msg.type === "track-control") {
        const { orderId, action } = msg as ControlTrackMessage;
        const player = players.get(orderId);
        if (!player) return;

        if (action === "pause") player.pause();
        if (action === "resume") player.resume();
        if (action === "stop") {
          player.stop();
          players.delete(orderId);
        }
        return;
      }
    });

    ws.on("close", () => {
      console.log("❌ WS 客户端断开");
    });
  });

  return wss;
}

// 后台路由触发播放
export function startTrack(orderId: string, points: { lng: number; lat: number }[]) {
  if (!wssGlobal || !orderId || !points || points.length === 0) return;

  let player = players.get(orderId);
  if (player) {
    player.startWithPoints(points);
  } else {
    player = new TrackPlayer(orderId, wssGlobal);
    players.set(orderId, player);
    player.startWithPoints(points);
  }
}

// 导出供其他模块使用
export function getWss() {
  return wssGlobal;
}

export function getPlayer(orderId: string) {
  return players.get(orderId) || null;
}
