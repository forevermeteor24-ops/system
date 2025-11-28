// server/src/simulator/trackPlayer.ts
import OrderModel from "../models/orderModel";

/**
 * TrackPlayer: 以最低耦合方式实现轨迹播放（避免依赖 ws 的类型导出）
 * 构造时接受 orderId 与 wss 实例（any）
 */

export class TrackPlayer {
  private orderId: string;
  private wss: any; // 使用 any，避免 ws 版本或类型差异导致编译错误

  private points: { lng: number; lat: number }[] = [];
  private index = 0;

  private isPlaying = false;
  private stopped = false;

  private speed = 900;

  constructor(orderId: string, wss: any) {
    this.orderId = orderId;
    this.wss = wss;
  }

  /** 从 DB 恢复进度 */
  private async restoreState() {
    const order = await OrderModel.findById(this.orderId).select("trackState");
    if (order?.trackState) {
      const { index, total } = order.trackState;
      this.index = Math.min(index, Math.max(0, (total || 1) - 1));
      console.log(`♻ 恢复轨迹 index=${this.index}`);
    } else {
      this.index = 0;
    }
  }

  /** 保存进度到 DB */
  private async saveState() {
    const safeIndex = Math.max(0, Math.min(this.index, this.points.length - 1));
    await OrderModel.updateOne(
      { _id: this.orderId },
      {
        $set: {
          trackState: {
            index: safeIndex,
            total: this.points.length,
            lastPosition: this.points[safeIndex] || null,
          },
        },
      }
    );
  }

  /** 给前端用的当前状态 */
  getCurrentState() {
    const safeIndex = Math.max(0, Math.min(this.index, this.points.length - 1));
    return {
      index: safeIndex,
      total: this.points.length,
      position: this.points[safeIndex] || null,
      playing: this.isPlaying && !this.stopped,
    };
  }

  /** 启动轨迹并恢复 */
  async startWithPoints(points: { lng: number; lat: number }[]) {
    if (!points || !points.length) return;
    this.points = points;
    this.stopped = false;

    await this.restoreState();

    this.isPlaying = true;
    console.log(`▶ TrackPlayer ${this.orderId} start from index ${this.index}`);
    this.nextTick();
  }

  /** 推进一帧 */
  private async nextTick() {
    if (!this.isPlaying || this.stopped) return;

    if (this.index >= this.points.length) {
      const final = this.points[this.points.length - 1] || null;
      this.broadcast({
        type: "location",
        orderId: this.orderId,
        finished: true,
        index: this.points.length - 1,
        total: this.points.length,
        position: final,
      });

      await this.saveState();
      this.stopped = true;
      console.log(`✔ TrackPlayer ${this.orderId} finished`);
      return;
    }

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

    if (this.index % 5 === 0) {
      await this.saveState();
    }

    setTimeout(() => this.nextTick(), this.speed);
  }

  pause() {
    if (!this.isPlaying || this.stopped) return;
    this.isPlaying = false;
    console.log(`⏸ TrackPlayer ${this.orderId} paused`);
  }

  resume() {
    if (this.stopped || this.isPlaying) return;
    this.isPlaying = true;
    console.log(`▶ TrackPlayer ${this.orderId} resume`);
    this.nextTick();
  }

  stop() {
    this.isPlaying = false;
    this.stopped = true;
    console.log(`■ TrackPlayer ${this.orderId} stop`);
  }

  /** 只广播给订阅了当前 orderId 的客户端 */
  private broadcast(msg: any) {
    const data = JSON.stringify(msg);
    if (!this.wss || !this.wss.clients) return;

    // wss.clients 是一个 Set
    try {
      for (const client of this.wss.clients as Set<any>) {
        if (client && client.readyState === 1 && client.subscribedOrderId === this.orderId) {
          client.send(data);
        }
      }
    } catch (err) {
      // 容错：任何 send 错误都不应破坏播放
      console.error("broadcast error:", err);
    }
  }
}
