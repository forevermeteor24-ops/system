// server/src/simulator/trackPlayer.ts
import OrderModel from "../models/orderModel";
import { calcTotalDistance, calcETASeconds } from "../utils/calcETA";

/**
 * TrackPlayer: 小车轨迹模拟器（可脱离前端独立运行）
 */
export class TrackPlayer {
  private orderId: string;
  private wss: any;

  private points: { lng: number; lat: number }[] = [];
  private index = 0;

  private isPlaying = false;
  private stopped = false;

  /** 小车速度（米/秒）*/
  private speed = 8;

  constructor(orderId: string, wss: any) {
    this.orderId = orderId;
    this.wss = wss;
  }

  /** 从 DB 恢复进度 */
  private async restoreState() {
    const order = await OrderModel.findById(this.orderId).select("trackState");
    if (order?.trackState) {
      this.index = Math.min(
        order.trackState.index,
        Math.max(0, (order.trackState.total || 1) - 1)
      );
      console.log(`♻ 恢复轨迹 index=${this.index}`);
    } else {
      this.index = 0;
    }
  }

  /** 保存进度 */
  private async saveState() {
    const i = Math.max(0, Math.min(this.index, this.points.length - 1));
    await OrderModel.updateOne(
      { _id: this.orderId },
      {
        $set: {
          trackState: {
            index: i,
            total: this.points.length,
            lastPosition: this.points[i] || null,
          },
        },
      }
    );
  }

  /** 启动轨迹（自动计算 ETA） */
  async startWithPoints(points: { lng: number; lat: number }[]) {
    if (!points?.length) return;

    this.points = points;
    this.stopped = false;

    await this.restoreState();

    // 计算 ETA（秒）
    const etaSeconds = calcETASeconds(points, this.speed);
    const etaTime = Date.now() + etaSeconds * 1000;

    await OrderModel.updateOne(
      { _id: this.orderId },
      {
        $set: {
          eta: etaTime,
          status: "配送中",
          routePoints: points,
          "trackState.total": points.length,
        },
      }
    );

    console.log(
      `📦 ETA 计算完成：${Math.floor(
        etaSeconds / 3600
      )} 小时，预计到达时间戳 = ${etaTime}`
    );

    this.isPlaying = true;
    this.nextTick();
  }

  /** 当前状态（可选） */
  getCurrentState() {
    const i = Math.max(0, Math.min(this.index, this.points.length - 1));
    return {
      index: i,
      total: this.points.length,
      position: this.points[i] || null,
      playing: this.isPlaying && !this.stopped,
    };
  }

  /** 逐步推进 */
  private async nextTick() {
    if (!this.isPlaying || this.stopped) return;

    // 已送达
    if (this.index >= this.points.length) {
      const final = this.points[this.points.length - 1] || null;

      this.broadcast({
        type: "location",
        finished: true,
        orderId: this.orderId,
        index: this.points.length - 1,
        total: this.points.length,
        position: final,
      });

      await OrderModel.updateOne(
        { _id: this.orderId },
        {
          $set: { status: "已送达", deliveredAt: Date.now() }
        }
      );

      console.log(`✔ 订单 ${this.orderId} 已送达`);

      await this.saveState();
      this.stopped = true;
      return;
    }

    // 当前点
    const p = this.points[this.index];

    // 广播前端
    this.broadcast({
      type: "location",
      orderId: this.orderId,
      index: this.index,
      total: this.points.length,
      position: p,
      finished: false,
    });

    // 计算下一段距离（米）
    let distanceToNext = 0;
    if (this.index < this.points.length - 1) {
      distanceToNext = calcTotalDistance([
        this.points[this.index],
        this.points[this.index + 1],
      ]);
    }

    // 防止 0 距离异常
    if (!distanceToNext || distanceToNext < 0.1) {
      distanceToNext = 1;
    }

    // 计算下一跳时间 = 距离（米）/ 速度（米/秒）
    const delay = (distanceToNext / this.speed) * 1000;

    this.index++;

    // 每 5 步保存一次
    if (this.index % 5 === 0) await this.saveState();

    setTimeout(() => this.nextTick(), delay);
  }

  pause() {
    if (!this.isPlaying || this.stopped) return;
    this.isPlaying = false;
  }

  resume() {
    if (this.stopped || this.isPlaying) return;
    this.isPlaying = true;
    this.nextTick();
  }

  stop() {
    this.isPlaying = false;
    this.stopped = true;
  }

  /** 推送给订阅客户端 */
  private broadcast(msg: any) {
    if (!this.wss?.clients) return;

    const data = JSON.stringify(msg);
    for (const client of this.wss.clients as Set<any>) {
      if (
        client.readyState === 1 &&
        client.subscribedOrderId === this.orderId
      ) {
        client.send(data);
      }
    }
  }
}
