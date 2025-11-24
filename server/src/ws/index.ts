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

let wssGlobal: WebSocketServer | null = null;

export function setupWS(server: any) {
  const wss = new WebSocketServer({ server });
  wssGlobal = wss;

  console.log("🛰 WebSocket 服务已启动");

  wss.on("connection", (ws) => {
    console.log("🌐 WS 客户端已连接");

    ws.on("message", (raw) => {
      const msgStr = raw.toString();

      /** ============================
       *  ⭐ 处理 ping → 防止 ngrok 断开
       * ============================ */
      try {
        const pingMsg = JSON.parse(msgStr);
        if (pingMsg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        }
      } catch {
        /* ignore */
      }

      /** ============================
       *    解析消息
       * ============================ */
      let msg: any;
      try {
        msg = JSON.parse(msgStr);
      } catch (err) {
        console.warn("❌ 非 JSON:", msgStr);
        return;
      }

      /** ============================
       *   ⭐ 新客户端刷新后请求状态
       * ============================ */
      if (msg.type === "request-current") {
        const { orderId } = msg;

        const player = players.get(orderId);
        if (!player) {
          // 当前没有播放该订单
          ws.send(
            JSON.stringify({
              type: "no-track",
              orderId,
            })
          );
          return;
        }

        // 返回当前 index + 坐标
        const state = player.getCurrentState();
        ws.send(
          JSON.stringify({
            type: "current-state",
            orderId,
            ...state,
          })
        );
        return;
      }

      /** ============================
       *   ⭐ start-track：启动轨迹（继续跑）
       * ============================ */
      if (msg.type === "start-track") {
        const { orderId, points } = msg as StartTrackMessage;

        if (!points || points.length === 0) {
          console.log("❌ start-track：points 空");
          return;
        }

        console.log(`🚚 start-track: ${orderId}, ${points.length} points`);

        // 若已存在 → 继续播放而不是 reset
        let player = players.get(orderId);

        if (!player) {
          // 第一次创建
          player = new TrackPlayer(orderId, wss);
          players.set(orderId, player);
        }

        player.startWithPoints(points); // ⭐ 不会重置 index（TrackPlayer 已增强）
      }

      /** ============================
       *   ⭐ track-control: pause / resume / stop
       * ============================ */
      if (msg.type === "track-control") {
        const { orderId, action } = msg as ControlTrackMessage;

        const player = players.get(orderId);
        if (!player) {
          console.log("❌ 未找到 TrackPlayer:", orderId);
          return;
        }

        if (action === "pause") player.pause();
        if (action === "resume") player.resume();
        if (action === "stop") {
          player.stop();
          players.delete(orderId);
        }
      }
    });

    ws.on("close", () => {
      console.log("❌ WS 客户端断开");
    });
  });

  return wss;
}

export function getWss() {
  return wssGlobal;
}
