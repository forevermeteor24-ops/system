import { WebSocketServer } from "ws";

/**
 * ⭐ 最稳定、无跳动、支持刷新恢复、支持多客户端同时连接的版本
 * ⭐ 已完全按方案 A 修复（仅推送给订阅当前 orderId 的客户端）
 */
export class TrackPlayer {
  private orderId: string;
  private wss: WebSocketServer;

  private points: { lng: number; lat: number }[] = [];
  private index = 0;

  private isPlaying = false;
  private stopped = false;

  /** 
   * ⭐ 速度减到 900ms
   */
  private speed = 900;

  constructor(orderId: string, wss: WebSocketServer) {
    this.orderId = orderId;
    this.wss = wss;
  }

  /** ⭐ 当前播放状态（给刷新时恢复用） */
  getCurrentState() {
    if (!this.points.length) {
      return {
        index: 0,
        total: 0,
        position: null,
        playing: false,
      };
    }

    const safeIndex = Math.min(this.index, this.points.length - 1);

    return {
      index: safeIndex,
      total: this.points.length,
      position: this.points[safeIndex],
      playing: this.isPlaying && !this.stopped,
    };
  }

  /** ============================
   *    启动播放（不会重复）
   * ============================ */
  startWithPoints(points: { lng: number; lat: number }[]) {
    if (!points || points.length === 0) {
      console.error(`❌ TrackPlayer(${this.orderId}) 启动失败：空 points`);
      return;
    }

    /** ⭐ 正在播就拒绝重复 start */
    if (this.isPlaying && !this.stopped) {
      console.log(`⚠ TrackPlayer(${this.orderId}) 已在播放，忽略重复 start`);
      return;
    }

    /** ⭐ 刷新恢复越界修复 */
    if (this.index >= points.length) {
      this.index = points.length - 1;
    }

    this.points = points;
    this.stopped = false;
    this.isPlaying = true;

    console.log(
      `🚚 TrackPlayer(${this.orderId}) start @ index ${this.index}/${points.length}`
    );

    this.nextTick();
  }

  /** ============================
   *       推送下一帧
   * ============================ */
  private nextTick() {
    if (this.stopped || !this.isPlaying) return;
    if (!this.points.length) return;

    // ⭐ 到终点
    if (this.index >= this.points.length) {
      const final = this.points[this.points.length - 1];

      this.broadcast({
        type: "location",
        orderId: this.orderId,
        finished: true,
        index: this.points.length - 1,
        total: this.points.length,
        position: final,
      });

      console.log(`✔ TrackPlayer(${this.orderId}) 到达终点`);

      this.isPlaying = false;
      this.stopped = true;
      return;
    }

    /** ⭐ 正常推送位置 */
    const p = this.points[this.index];

    this.broadcast({
      type: "location",
      orderId: this.orderId,
      index: this.index,
      total: this.points.length,
      position: p,
      finished: false,
    });

    this.index++;

    setTimeout(() => this.nextTick(), this.speed);
  }

  pause() {
    if (!this.isPlaying || this.stopped) return;

    this.isPlaying = false;

    this.broadcast({
      type: "route-paused",
      orderId: this.orderId,
      index: this.index,
    });

    console.log(`⏸ TrackPlayer(${this.orderId}) paused`);
  }

  resume() {
    if (this.stopped || this.isPlaying) return;

    this.isPlaying = true;

    this.broadcast({
      type: "route-resumed",
      orderId: this.orderId,
      index: this.index,
    });

    console.log(`▶ TrackPlayer(${this.orderId}) resumed`);
    this.nextTick();
  }

  stop() {
    if (this.stopped) return;

    this.stopped = true;
    this.isPlaying = false;

    this.broadcast({
      type: "route-stopped",
      orderId: this.orderId,
    });

    console.log(`■ TrackPlayer(${this.orderId}) stopped`);
  }

  /** ===================================================
   *  ⭐ 修复重点：仅发送给订阅了当前 orderId 的客户端
   * =================================================== */
  private broadcast(msg: any) {
    const data = JSON.stringify(msg);

    this.wss.clients.forEach((client: any) => {
      if (
        client.readyState === 1 &&
        client.subscribedOrderId === this.orderId // ←⭐ 关键判断（方案 A 核心）
      ) {
        client.send(data);
      }
    });
  }
}
