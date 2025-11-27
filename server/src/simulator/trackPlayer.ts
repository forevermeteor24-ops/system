// server/src/simulator/trackPlayer.ts
import { WebSocketServer } from "ws";
import TrackState from "../models/TrackState";

export class TrackPlayer {
  private orderId: string;
  private wss: WebSocketServer;

  private points: { lng: number; lat: number }[] = [];
  private index = 0;

  private isPlaying = false;
  private stopped = false;

  private speed = 900; // 稳定速度

  constructor(orderId: string, wss: WebSocketServer) {
    this.orderId = orderId;
    this.wss = wss;
  }

  /** 从数据库恢复 index */
  async restoreProgress(total: number) {
    const doc = await TrackState.findOne({ orderId: this.orderId });

    if (!doc) {
      await TrackState.create({
        orderId: this.orderId,
        index: 0,
        total,
      });
      this.index = 0;
      return;
    }

    // index 不超过 total
    this.index = Math.min(doc.index, total - 1);
  }

  /** 保存当前进度 */
  async saveProgress() {
    await TrackState.findOneAndUpdate(
      { orderId: this.orderId },
      { index: this.index, total: this.points.length },
      { upsert: true }
    );
  }

  /** 返回当前状态（前端刷新时使用） */
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

  /** 启动轨迹 */
  async startWithPoints(points: { lng: number; lat: number }[]) {
    if (!points || points.length === 0) {
      console.error(`❌ TrackPlayer(${this.orderId}) empty points`);
      return;
    }

    if (this.isPlaying && !this.stopped) {
      console.log(`⚠ TrackPlayer(${this.orderId}) already running`);
      return;
    }

    this.points = points;
    this.stopped = false;

    // ⭐ 恢复进度
    await this.restoreProgress(points.length);

    this.isPlaying = true;
    console.log(`🚚 TrackPlayer(${this.orderId}) start @ index=${this.index}`);

    this.nextTick();
  }

  /** 每一帧 */
  private async nextTick() {
    if (this.stopped || !this.isPlaying) return;
    if (!this.points.length) return;

    // 终点
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

      console.log(`✔ TrackPlayer(${this.orderId}) finished`);

      this.isPlaying = false;
      this.stopped = true;
      return;
    }

    // 推送正常位置
    const p = this.points[this.index];

    this.broadcast({
      type: "location",
      orderId: this.orderId,
      index: this.index,
      total: this.points.length,
      position: p,
      finished: false,
    });

    // ⭐ 保存进度
    await this.saveProgress();

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
  }

  resume() {
    if (this.stopped || this.isPlaying) return;

    this.isPlaying = true;

    this.broadcast({
      type: "route-resumed",
      orderId: this.orderId,
      index: this.index,
    });

    this.nextTick();
  }

  stop() {
    this.stopped = true;
    this.isPlaying = false;

    this.broadcast({
      type: "route-stopped",
      orderId: this.orderId,
    });
  }

  private broadcast(msg: any) {
    const data = JSON.stringify(msg);

    this.wss.clients.forEach((client: any) => {
      if (client.readyState === 1) client.send(data);
    });
  }
}
