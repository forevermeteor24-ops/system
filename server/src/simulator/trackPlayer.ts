import OrderModel from "../models/orderModel";
import { calcTotalDistance, calcETASeconds } from "../utils/calcETA";

export class TrackPlayer {
  private orderId: string;
  private wss: any;
  private points: { lng: number; lat: number }[] = [];
  private index = 0;
  private isPlaying = false;
  private stopped = false;
  
  // 🟢 修改 1: 模拟器实际运行速度 (28 m/s ≈ 100 km/h)
  // 这决定了前端倒计时的快慢，以及小车移动的速度
  private speed = 28; 

  constructor(orderId: string, wss: any) {
    this.orderId = orderId;
    this.wss = wss;
  }

  /**
   * 恢复状态逻辑
   * 从数据库读取进度，防止重启后从头开始
   */
  private async restoreState() {
    try {
      const order = await OrderModel.findById(this.orderId).select("trackState");
      
      // 检查是否有保存的进度
      if (order && order.trackState && typeof order.trackState.index === 'number') {
        // 确保索引不越界
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
   * 🟢 修改 2: 启动逻辑 (智能 ETA 版)
   * 只有在第一次发货时才计算并写入 ETA，后续恢复运行不修改 ETA
   */
  public async startWithPoints(points: { lng: number; lat: number }[]) {
    if (!points?.length) return;
    this.points = points;
    this.stopped = false;

    // 1. 先尝试恢复之前的进度
    await this.restoreState();

    // 2. 准备更新的数据
    const updateData: any = {
      status: "配送中",
      routePoints: points,
      "trackState.total": points.length
    };

    // 3. 核心逻辑：只在从头开始时计算 ETA
    if (this.index === 0) {
      // 🟢 设定计算 ETA 用的理想速度 (这里也设为 28，与实际速度一致)
      // 含义：承诺用户按 100km/h 的速度送达
      const idealSpeed = 28; 
      
      // 计算全程需要的秒数
      const idealSeconds = calcETASeconds(points, idealSpeed);
      
      // 写入数据库: ETA = 当前时间 + 理想耗时
      updateData.eta = Date.now() + idealSeconds * 1000;
      
      console.log(`[TrackPlayer] 首次发货，设定承诺 ETA: ${new Date(updateData.eta).toLocaleString()} (基于速度 ${idealSpeed}m/s)`);
    } else {
      // 如果不是从 0 开始（说明是中途恢复），绝对不要改 ETA！
      // 这样如果服务器停了一段时间，ETA 不变，就会自然导致超时
      console.log(`[TrackPlayer] 恢复运行，保留原始 ETA 不变`);
    }

    // 4. 更新数据库
    await OrderModel.updateOne({ _id: this.orderId }, { $set: updateData });

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
    // 这里使用的是 this.speed (28)，所以倒计时会按 100km/h 的速度递减
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
    
    // 每走 5 步存一次数据库
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