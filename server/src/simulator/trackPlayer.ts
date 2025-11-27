// server/src/simulator/TrackPlayer.ts
import { WebSocketServer } from "ws";
import OrderModel from "../models/orderModel";

export class TrackPlayer {
  private orderId: string;
  private wss: WebSocketServer;

  private points: { lng: number; lat: number }[] = [];
  private index = 0;

  private isPlaying = false;
  private stopped = false;

  private speed = 900; // Cloudflare / Zeabur 最稳

  constructor(orderId: string, wss: WebSocketServer) {
    this.orderId = orderId;
    this.wss = wss;
  }

  /** ⭐恢复进度（从数据库） */
  private async restoreState() {
    const order = await OrderModel.findById(this.orderId).select("trackState");

    if (order?.trackState) {
      const { index, total } = order.trackState;
      this.index = Math.min(index, total - 1);
      console.log(`♻ 恢复轨迹 index=${this.index}`);
    } else {
      this.index = 0;
    }
  }

  /** ⭐保存进度（到数据库） */
  private async saveState() {
    const safeIndex = Math.min(this.index, this.points.length - 1);

    await OrderModel.updateOne(
      { _id: this.orderId },
      {
        $set: {
          trackState: {
            index: safeIndex,
            total: this.points.length,
            lastPosition: this.points[safeIndex],
          },
        },
      }
    );
  }

  /** ⭐给前端恢复用 */
  getCurrentState() {
    const safeIndex = Math.min(this.index, this.points.length - 1);

    return {
      index: safeIndex,
      total: this.points.length,
      position: this.points[safeIndex] || null,
      playing: this.isPlaying && !this.stopped,
    };
  }

  /** ⭐启动 + 恢复 */
  async startWithPoints(points: { lng: number; lat: number }[]) {
    if (!points?.length) return;

    this.points = points;
    this.stopped = false;

    await this.restoreState(); // ← 恢复进度

    this.isPlaying = true;
    console.log(`▶ 开始播放 from index ${this.index}`);

    this.nextTick();
  }

  /** ⭐逐帧推进 */
  private async nextTick() {
    if (!this.isPlaying || this.stopped) return;

    // 播放结束
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

      await this.saveState();
      this.stopped = true;

      console.log(`✔ 订单 ${this.orderId} 轨迹完毕`);
      return;
    }

    // 正常推送
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

    // 每 5 帧保存一次，降低数据库压力
    if (this.index % 5 === 0) {
      await this.saveState();
    }

    setTimeout(() => this.nextTick(), this.speed);
  }

  /** ⭐暂停 */
  pause() {
    if (!this.isPlaying || this.stopped) return;
    this.isPlaying = false;
    console.log(`⏸ 暂停轨迹 ${this.orderId}`);
  }

  /** ⭐恢复 */
  resume() {
    if (this.stopped || this.isPlaying) return;
    this.isPlaying = true;
    console.log(`▶ 恢复轨迹 ${this.orderId}`);
    this.nextTick();
  }

  /** ⭐停止 */
  stop() {
    this.isPlaying = false;
    this.stopped = true;
    console.log(`■ 停止轨迹 ${this.orderId}`);
  }

  /** ⭐只推送给订阅了该订单 ID 的客户端 */
  private broadcast(msg: any) {
    const data = JSON.stringify(msg);

    this.wss.clients.forEach((client: any) => {
      if (
        client.readyState === 1 &&
        client.subscribedOrderId === this.orderId
      ) {
        client.send(data);
      }
    });
  }
}
