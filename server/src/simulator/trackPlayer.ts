import { WebSocketServer } from "ws";

export class TrackPlayer {
  private orderId: string;
  private wss: WebSocketServer;

  private points: { lng: number; lat: number }[] = [];
  private index = 0;

  private playing = false;
  private stopped = false;

  private speed = 1200; // Cloudflare/Ngrok 建议 >= 1000ms

  constructor(orderId: string, wss: WebSocketServer) {
    this.orderId = orderId;
    this.wss = wss;
  }

  /** ❗ 新增：给新客户端同步当前进度 */
  getCurrentState() {
    const p =
      this.points[this.index] || this.points[this.points.length - 1] || null;

    return {
      index: this.index,
      total: this.points.length,
      position: p,
    };
  }

  /** ===========================
   *   启动轨迹推送（不会重置 index）
   *  =========================== */
  startWithPoints(points: { lng: number; lat: number }[]) {
    if (!points || points.length === 0) {
      console.error(`❌ TrackPlayer(${this.orderId}) 启动失败：points 为空`);
      return;
    }

    this.points = points;

    // ❗ 注意：不重置 index（关键逻辑）
    this.playing = true;
    this.stopped = false;

    console.log(
      `🚚 TrackPlayer(${this.orderId}) continue from index ${this.index}/${points.length}`
    );

    this.nextTick();
  }

  /** ===========================
   *   推送下一帧（单步）
   *  =========================== */
  private nextTick(): void {
    if (this.stopped || !this.playing) return;

    if (this.index >= this.points.length) {
      this.stopped = true;
      this.broadcast({
        type: "route-finished",
        orderId: this.orderId,
      });
      console.log(`✔ TrackPlayer(${this.orderId}) finished`);
      return;
    }

    const p = this.points[this.index];

    if (!p || isNaN(p.lng) || isNaN(p.lat)) {
      console.warn(`⚠ 跳过无效坐标 index=${this.index}`, p);
      this.index++;
      return void this.nextTick();
    }

    this.broadcast({
      type: "location",
      orderId: this.orderId,
      index: this.index,
      total: this.points.length,
      position: { lng: p.lng, lat: p.lat },
    });

    this.index++;

    setTimeout(() => this.nextTick(), this.speed);
  }

  pause() {
    if (this.stopped || !this.playing) return;
    this.playing = false;

    this.broadcast({
      type: "route-paused",
      orderId: this.orderId,
      index: this.index,
    });

    console.log(`⏸ TrackPlayer(${this.orderId}) paused at ${this.index}`);
  }

  resume() {
    if (this.stopped || this.playing) return;

    this.playing = true;

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
    this.playing = false;

    this.broadcast({
      type: "route-stopped",
      orderId: this.orderId,
    });

    console.log(`■ TrackPlayer(${this.orderId}) stopped`);
  }

  private broadcast(msg: any) {
    const str = JSON.stringify(msg);

    this.wss.clients.forEach((client: any) => {
      try {
        if (client.readyState === 1) {
          client.send(str);
        }
      } catch (err) {
        console.error("WS send error:", err);
      }
    });
  }
}
