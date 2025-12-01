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

  /** 小车速度（米/秒） */
  private speed = 8; // 建议真实速度 5–12 m/s

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

  /** 保存进度到 DB */
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

    // 恢复进度
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

  /** 当前状态（给前端可选使用） */
  getCurrentState() {
    const i = Math.max(0, Math.min(this.index, this.points.length - 1));
    return {
      index: i,
      total: this.points.length,
      position: this.points[i] || null,
      playing: this.isPlaying && !this.stopped,
    };
  }

  /** 推进位置 */
  private async nextTick() {
    if (!this.isPlaying || this.stopped) return;

    if (this.index >= this.points.length) {
      const final = this.points[this.points.length - 1] || null;

      // 广播最终位置
      this.broadcast({
        type: "location",
        finished: true,
        orderId: this.orderId,
        index: this.points.length - 1,
        total: this.points.length,
        position: final,
      });

      // 更新订单状态为 已送达
      await OrderModel.updateOne(
        { _id: this.orderId },
        { $set: { status: "已送达" },
          deliveredAt: Date.now()   // ⭐ 新增字段（用于计算配送时效） 
          }
      );

      console.log(`✔ 订单 ${this.orderId} 已送达`);

      await this.saveState();
      this.stopped = true;
      return;
    }

    const p = this.points[this.index];

    // 广播当前位置
    this.broadcast({
      type: "location",
      orderId: this.orderId,
      index: this.index,
      total: this.points.length,
      position: p,
      finished: false,
    });

    this.index++;

    // 每 5 个点保存一次
    if (this.index % 5 === 0) await this.saveState();

    setTimeout(() => this.nextTick(), 1000); // 每秒走一步（你可以改速度）
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

  /** 只推送给订阅该订单的客户端 */
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
