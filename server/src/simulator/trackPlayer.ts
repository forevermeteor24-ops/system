// server/src/simulator/trackPlayer.ts
import OrderModel from "../models/orderModel";
import { calcTotalDistance, calcETASeconds } from "../utils/calcETA";

export class TrackPlayer {
  private orderId: string;
  private wss: any;
  private points: { lng: number; lat: number }[] = [];
  private index = 0;
  private isPlaying = false;
  private stopped = false;
  
  // 小车速度（米/秒）- 可调快一点测试效果，比如 20
  private speed = 20; 

  constructor(orderId: string, wss: any) {
    this.orderId = orderId;
    this.wss = wss;
  }

  // ... restoreState 和 saveState 保持不变 ...
  // ... startWithPoints 和 getCurrentState 保持不变 ...
  
  // 必须把 restoreState, saveState, startWithPoints, getCurrentState 等代码保留
  // 这里只展示修改后的 nextTick 和 broadcast 逻辑

  private async restoreState() {
     const order = await OrderModel.findById(this.orderId).select("trackState");
     if (order?.trackState) {
       this.index = Math.min(order.trackState.index, Math.max(0, (order.trackState.total || 1) - 1));
     } else {
       this.index = 0;
     }
  }

  private async saveState() {
    const i = Math.max(0, Math.min(this.index, this.points.length - 1));
    await OrderModel.updateOne(
      { _id: this.orderId },
      { $set: { "trackState": { index: i, total: this.points.length, lastPosition: this.points[i] || null } } }
    );
  }

  public async startWithPoints(points: { lng: number; lat: number }[]) {
    if (!points?.length) return;
    this.points = points;
    this.stopped = false;
    await this.restoreState();

    const etaSeconds = calcETASeconds(points, this.speed);
    const etaTime = Date.now() + etaSeconds * 1000;

    await OrderModel.updateOne({ _id: this.orderId }, {
      $set: { eta: etaTime, status: "配送中", routePoints: points, "trackState.total": points.length }
    });

    this.isPlaying = true;
    this.nextTick();
  }
  
  public getCurrentState() {
    const i = Math.max(0, Math.min(this.index, this.points.length - 1));
    return {
      index: i,
      total: this.points.length,
      position: this.points[i] || null,
      playing: this.isPlaying && !this.stopped,
    };
  }

  /** 核心修改：逐步推进 */
  private async nextTick() {
    if (!this.isPlaying || this.stopped) return;

    // 1. 判断是否已送达
    if (this.index >= this.points.length - 1) {
      const final = this.points[this.points.length - 1];
      
      this.broadcast({
        type: "location",
        finished: true,
        orderId: this.orderId,
        index: this.points.length - 1,
        position: final,
        nextPosition: final, // 终点
        duration: 0
      });

      await OrderModel.updateOne({ _id: this.orderId }, { $set: { status: "已送达", deliveredAt: Date.now() } });
      await this.saveState();
      this.stopped = true;
      return;
    }

    // 2. 获取当前点和下一点
    const currentPoint = this.points[this.index];
    const nextPoint = this.points[this.index + 1];

    // ============================================
    // ⭐ 新增：计算剩下所有路程还需要多少秒 ⭐
    // ============================================
    // 截取从当前位置到终点的路径点
    const remainingRoute = this.points.slice(this.index);
    // 重新计算剩余时间
    const remainingSeconds = calcETASeconds(remainingRoute, this.speed);
    // ============================================

    // 3. 计算距离和时间
    let distance = calcTotalDistance([currentPoint, nextPoint]);
    if (!distance || distance < 0.1) distance = 1;
    
    // 动画时长(ms) = (距离 / 速度) * 1000
    const duration = (distance / this.speed) * 1000;

    // 4. 广播：告诉前端“我现在在 A，要在 T毫秒 内移动到 B”
    this.broadcast({
      type: "location",
      finished: false,
      orderId: this.orderId,
      index: this.index,
      position: currentPoint, // 当前起点
      nextPosition: nextPoint, // 目标点
      duration: duration, // 前端动画时间需严格等于这个值
      remainingSeconds: remainingSeconds // <--- 把实时剩余时间发给前端
    });

    // 5. 推进索引并等待
    this.index++;
    if (this.index % 5 === 0) await this.saveState();

    // 等待时间与动画时间一致
    setTimeout(() => this.nextTick(), duration);
  }
  
  // ... pause, resume, stop, broadcast 保持不变 ...
  public pause() { if (!this.isPlaying || this.stopped) return; this.isPlaying = false; }
  public resume() { if (this.stopped || this.isPlaying) return; this.isPlaying = true; this.nextTick(); }
  public stop() { this.isPlaying = false; this.stopped = true; }

  private broadcast(msg: any) {
    if (!this.wss?.clients) return;
    const data = JSON.stringify(msg);
    for (const client of this.wss.clients as Set<any>) {
      if (client.readyState === 1 && client.subscribedOrderId === this.orderId) {
        client.send(data);
      }
    }
  }
}