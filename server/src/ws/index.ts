// server/src/ws/index.ts
import * as ws from "ws";
import { TrackPlayer } from "../simulator/trackPlayer";

/**
 * 使用兼容写法：不直接依赖某个命名导出（避免不同 ws 版本的 TS 导出差异）
 * 在运行时使用 ws.Server，TS 层用 any 来避免声明问题。
 */

type WSAny = any; // 兼容各种 ws 类型声明
const WebSocketServer: any = (ws as any).Server || (ws as any).WebSocketServer || (ws as any).default?.Server;

// 全局存储所有正在运行的轨迹播放器
// Key: orderId, Value: TrackPlayer 实例
const players = new Map<string, TrackPlayer>();
let wssGlobal: WSAny | null = null;

export function setupWS(server: any) {
  // 创建 server（兼容各种导出）
  const wss = new WebSocketServer({ server });
  wssGlobal = wss;

  console.log("🛰 WebSocket 服务已启动");

  wss.on("connection", (wsConn: WSAny) => {
    // console.log("🌐 WS 客户端已连接"); 

    // 自定义字段，用于订阅某个订单
    wsConn.subscribedOrderId = null;

    wsConn.on("message", async (raw: any) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      // ---------------------------------------------
      // 1. 订阅订单 (前端进入详情页时发送)
      // ---------------------------------------------
      if (msg.type === "subscribe") {
        wsConn.subscribedOrderId = msg.orderId;
        // 可以在这里立即把当前状态发回去（可选，但通常由 request-current 处理）
        return;
      }

      // ---------------------------------------------
      // 2. 请求当前状态 (核心逻辑：前端用来判断是否需要启动)
      // ---------------------------------------------
      if (msg.type === "request-current") {
        const player = players.get(msg.orderId);

        // 如果内存中没有这个 Player (说明服务器刚重启，或者还没发货)
        if (!player) {
          wsConn.send(JSON.stringify({ type: "no-track", orderId: msg.orderId }));
          return;
        }

        // 如果有，返回当前状态 (包含位置、是否在跑等)
        wsConn.send(
          JSON.stringify({
            type: "current-state",
            orderId: msg.orderId,
            ...player.getCurrentState(),
          })
        );
        return;
      }

      // ---------------------------------------------
      // 3. 启动轨迹 (前端收到 no-track 后发送，或者点击发货时发送)
      // ---------------------------------------------
      if (msg.type === "start-track") {
        let player = players.get(msg.orderId);

        // ✅ 防止重复启动：如果已经存在且正在播放，不要重新 start
        // 这样即使两个标签页同时打开，也只会有一个 Player 实例在跑
        if (player) {
          const state = player.getCurrentState();
          if (state.playing) {
            console.log(`[WS] 订单 ${msg.orderId} 已在运行中，跳过启动指令`);
            // 告诉当前客户端：已经在跑了，这是最新状态
            wsConn.send(JSON.stringify({
              type: "current-state",
              orderId: msg.orderId,
              ...state
            }));
            return;
          }
        }

        // 如果不存在，创建一个新的 Player
        if (!player && wssGlobal) {
          player = new TrackPlayer(msg.orderId, wssGlobal);
          players.set(msg.orderId, player);
        }

        // 启动 (TrackPlayer 内部会自动去数据库读取上次的进度)
        if (player) {
          console.log(`[WS] 启动订单追踪: ${msg.orderId}`);
          await player.startWithPoints(msg.points);
        }
        return;
      }

      // ---------------------------------------------
      // 4. 控制指令 (暂停/继续/停止)
      // ---------------------------------------------
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
      // 客户端断开不需要销毁 Player，因为小车是服务端模拟的，
      // 商家关掉网页，车也应该继续跑。
    });
  });

  return wss;
}

/**
 * 供 HTTP API 调用（例如商家点击“发货”按钮时调用）
 */
export function startTrack(orderId: string, points: any[]) {
  if (!wssGlobal) return;

  let player = players.get(orderId);
  if (!player) {
    player = new TrackPlayer(orderId, wssGlobal);
    players.set(orderId, player);
  }

  // 这里的调用也会触发内部的 restoreState，
  // 但如果是新发货，数据库里的 trackState 应该是空的或0，所以会从头开始
  player.startWithPoints(points);
}

/**
 * 获取某个订单的 Player 实例
 */
export function getPlayer(orderId: string) {
  return players.get(orderId) || null;
}