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
  
  // 小车速度（米/秒）- 可以根据需要调整
  private speed = 20; 

  constructor(orderId: string, wss: any) {
    this.orderId = orderId;
    this.wss = wss;
  }

  /**
   * ✅ 修复 1: 恢复状态逻辑
   * 从数据库读取进度，防止重启后从头开始
   */
  private async restoreState() {
    try {
      const order = await OrderModel.findById(this.orderId).select("trackState");
      
      // 检查是否有保存的进度
      if (order && order.trackState && typeof order.trackState.index === 'number') {
        // 确保索引不越界 (不能小于0，也不能超过当前路径总长度)
        const safeIndex = Math.min(order.trackState.index, (this.points.length || 1) - 1);
        this.index = Math.max(0, safeIndex);
        
        if (this.index > 0) {
          console.log(`[TrackPlayer] 订单 ${this.orderId} 恢复进度: 第 ${this.index}/${this.points.length} 点`);
        }
      } else {
        this.index = 0;
      }
    } catch (error) {
      console.error("恢复进度失败:", error);
      this.index = 0;
    }
  }

  /**
   * 保存当前进度到数据库
   * 每走几步存一次，防止服务器崩溃数据丢失
   */
  private async saveState() {
    const i = Math.max(0, Math.min(this.index, this.points.length - 1));
    await OrderModel.updateOne(
      { _id: this.orderId },
      { 
        $set: { 
          "trackState": { 
            index: i, 
            total: this.points.length, 
            lastPosition: this.points[i] || null 
          } 
        } 
      }
    );
  }

  /**
   * ✅ 修复 2: 启动逻辑
   * 必须在 restoreState 之后，基于【剩余路径】计算 ETA
   */
  public async startWithPoints(points: { lng: number; lat: number }[]) {
    if (!points?.length) return;
    this.points = points;
    this.stopped = false;

    // 1. 先尝试恢复之前的进度
    await this.restoreState();

    // 2. ⭐ 关键修复：只计算剩余路程的时间 ⭐
    // 如果是从第 500 个点开始跑，ETA 应该只包含从 500 到终点的时间
    const remainingPoints = this.points.slice(this.index);
    const remainingSeconds = calcETASeconds(remainingPoints, this.speed);
    
    // 3. 更新预计到达时间 (当前时间 + 剩余时间)
    const etaTime = Date.now() + remainingSeconds * 1000;

    // 4. 更新数据库
    // 注意：不要覆盖 trackState.index，因为我们刚恢复了它
    await OrderModel.updateOne({ _id: this.orderId }, {
      $set: { 
        eta: etaTime, 
        status: "配送中", 
        routePoints: points, 
        "trackState.total": points.length 
      }
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
        nextPosition: final, 
        duration: 0,
        remainingSeconds: 0
      });

      await OrderModel.updateOne({ _id: this.orderId }, { $set: { status: "已送达", deliveredAt: Date.now() } });
      await this.saveState();
      this.stopped = true;
      return;
    }

    // 2. 获取当前点和下一点
    const currentPoint = this.points[this.index];
    const nextPoint = this.points[this.index + 1];

    // 3. 实时计算剩余时间 (用于前端倒计时修正)
    const remainingRoute = this.points.slice(this.index);
    const remainingSeconds = calcETASeconds(remainingRoute, this.speed);

    // 4. 计算这一步的距离和动画时间
    let distance = calcTotalDistance([currentPoint, nextPoint]);
    if (!distance || distance < 0.1) distance = 1;
    
    const duration = (distance / this.speed) * 1000;

    // 5. 广播位置更新
    this.broadcast({
      type: "location",
      finished: false,
      orderId: this.orderId,
      index: this.index,
      position: currentPoint,
      nextPosition: nextPoint,
      duration: duration,
      remainingSeconds: remainingSeconds // 发送给前端
    });

    // 6. 推进索引
    this.index++;
    
    // 每走 5 步存一次数据库，避免 I/O 过于频繁
    if (this.index % 5 === 0) await this.saveState();

    // 递归调用下一步
    setTimeout(() => this.nextTick(), duration);
  }
  
  public pause() { if (!this.isPlaying || this.stopped) return; this.isPlaying = false; }
  public resume() { if (this.stopped || this.isPlaying) return; this.isPlaying = true; this.nextTick(); }
  public stop() { this.isPlaying = false; this.stopped = true; }

  private broadcast(msg: any) {
    if (!this.wss?.clients) return;
    const data = JSON.stringify(msg);
    for (const client of this.wss.clients as Set<any>) {
      // 只有订阅了该订单 ID 的客户端才接收消息
      if (client.readyState === 1 && client.subscribedOrderId === this.orderId) {
        client.send(data);
      }
    }
  }
}