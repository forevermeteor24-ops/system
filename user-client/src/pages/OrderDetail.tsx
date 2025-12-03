import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { fetchOrder, updateStatus, deleteOrder } from "../api/orders";
import { formatRemainingETA } from "../utils/formatETA";

// 声明 AMap 类型防止 TS 报错
declare const AMap: any;

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [order, setOrder] = useState<any>(null);
  const [remainingTime, setRemainingTime] = useState<string>("--");
  
  // 地图相关 Ref
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const polylineRef = useRef<any>(null);
  
  // WebSocket
  const wsRef = useRef<WebSocket | null>(null);

  // 状态
  const [markerReady, setMarkerReady] = useState(false); 

  /* ---------------- 1. 加载订单 & 初始化地图 ---------------- */
  useEffect(() => {
    if (!id) return;

    let mounted = true;

    (async () => {
      try {
        const o = await fetchOrder(id);
        if (!mounted) return;
        setOrder(o);

        // 等待 DOM 渲染
        if (!mapRef.current) return;

        // 初始化地图实例 (单例模式)
        if (!mapInstanceRef.current) {
          mapInstanceRef.current = new AMap.Map(mapRef.current, {
            zoom: 13,
            center: [121.47, 31.23], // 默认中心，稍后会被 fitView 覆盖
            viewMode: "3D", // 使用 3D 视图使旋转更自然
          });

          // 加载动画插件
          mapInstanceRef.current.plugin(["AMap.MoveAnimation", "AMap.ToolBar"], () => {
             mapInstanceRef.current.addControl(new AMap.ToolBar());
          });
        }

        const map = mapInstanceRef.current;
        const points = o.routePoints ?? [];

        // 清理旧覆盖物
        if (polylineRef.current) map.remove(polylineRef.current);
        if (markerRef.current) map.remove(markerRef.current);

        // 绘制路径
        if (points.length > 0) {
          const path = points.map((p: any) => new AMap.LngLat(p.lng, p.lat));
          
          // 绘制蓝色轨迹线
          const polyline = new AMap.Polyline({
            path,
            strokeWeight: 6,
            strokeColor: "#1890ff",
            lineJoin: 'round',
            showDir: true,
          });
          map.add(polyline);
          polylineRef.current = polyline;
          
          // 自动缩放视野以包含路径
          map.setFitView([polyline]);

          // 创建小车 Marker
          const startPos = o.trackState?.lastPosition 
            ? new AMap.LngLat(o.trackState.lastPosition.lng, o.trackState.lastPosition.lat)
            : path[0];

          const carIcon = new AMap.Icon({
            size: new AMap.Size(52, 26),
            image: "https://cdn-icons-png.flaticon.com/512/3097/3097136.png", // 这里的图标是俯视图小车，效果更好
            imageSize: new AMap.Size(52, 26),
            imageOffset: new AMap.Pixel(0, 0)
          });

          const marker = new AMap.Marker({
            position: startPos,
            icon: carIcon,
            offset: new AMap.Pixel(-26, -13), // 居中锚点
            angle: 0, 
            zIndex: 100,
          });

          map.add(marker);
          markerRef.current = marker;
          setMarkerReady(true);
        }

      } catch (err) {
        console.error("加载失败", err);
      }
    })();

    return () => { mounted = false; };
  }, [id]);

  /* ---------------- 2. WebSocket 实时追踪 ---------------- */
  useEffect(() => {
    // 只有在“配送中”且地图Marker准备好时才连接 WS
    if (!order || order.status !== "配送中" || !markerReady) return;

    // 清理旧连接
    if (wsRef.current) wsRef.current.close();

    const ws = new WebSocket("wss://system-backend.zeabur.app"); // 替换为你的真实地址
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("🔗 WS 已连接");
      ws.send(JSON.stringify({ type: "subscribe", orderId: order._id }));
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        
        // 处理位置更新
        if (msg.type === "location" && markerRef.current) {
          
          // 如果后端传来了 nextPosition 和 duration，说明可以进行平滑移动
          if (msg.nextPosition && msg.duration > 0) {
            const nextLngLat = new AMap.LngLat(msg.nextPosition.lng, msg.nextPosition.lat);
            
            // 核心动画：moveTo
            // autoRotation: true 会让车头自动对准路径方向
            markerRef.current.moveTo(nextLngLat, {
              duration: msg.duration, // 毫秒，与后端完全同步
              autoRotation: true,
            });

            // 可选：让地图中心跟随小车 (如果希望视角锁定)
            // mapInstanceRef.current.panTo(nextLngLat);
          } 
          // 兜底：如果是直接位置更新（无 duration）或已完成
          else if (msg.position) {
             const pos = new AMap.LngLat(msg.position.lng, msg.position.lat);
             markerRef.current.setPosition(pos);
          }

          if (msg.finished) {
            setOrder((prev: any) => ({ ...prev, status: "已送达" }));
          }
        }
      } catch (e) {
        console.error("WS 解析错误", e);
      }
    };

    return () => {
      if (ws.readyState === 1) ws.close();
    };
  }, [order?._id, order?.status, markerReady]);

  /* ---------------- 3. 辅助功能：倒计时与按钮 ---------------- */
  useEffect(() => {
    if (!order?.eta || ["已送达", "已完成", "商家已取消"].includes(order?.status)) {
      if (order?.status !== "配送中") setRemainingTime("已结束");
      return;
    }
    const timer = setInterval(() => {
      setRemainingTime(formatRemainingETA(order.eta));
    }, 1000);
    return () => clearInterval(timer);
  }, [order?.eta, order?.status]);

  const doAction = async (action: 'confirm' | 'cancel' | 'return' | 'delete') => {
    if (!order) return;
    try {
      if (action === 'confirm') {
        await updateStatus(order._id, "已完成");
        setOrder({ ...order, status: "已完成" });
      } else if (action === 'return') {
        if(!confirm("确认申请退货？")) return;
        await updateStatus(order._id, "用户申请退货");
        setOrder({ ...order, status: "用户申请退货" });
      } else if (action === 'delete') {
        if(!confirm("确认删除？")) return;
        await deleteOrder(order._id);
        navigate("/orders");
      }
    } catch(e) { alert("操作失败"); }
  };

  /* ---------------- 4. 渲染视图 ---------------- */
  return (
    <div style={styles.container}>
      {/* 顶部导航面包屑 */}
      <div style={styles.header}>
        <Link to="/orders" style={styles.backLink}>← 返回订单列表</Link>
        <span style={{color: '#999'}}> / 订单详情</span>
      </div>

      <div style={styles.content}>
        {/* 左侧：信息面板 */}
        <div style={styles.leftPanel}>
          {/* 状态卡片 */}
          <div style={styles.card}>
             <div style={styles.statusHeader}>
               <div style={{fontSize: '14px', color: '#666'}}>当前状态</div>
               <div style={{fontSize: '24px', fontWeight: 'bold', color: '#1890ff', margin: '5px 0'}}>
                 {order?.status || "加载中..."}
               </div>
               {order?.status === "配送中" && (
                 <div style={styles.etaBadge}>预计送达: {remainingTime}</div>
               )}
             </div>

             <div style={styles.divider} />

             {/* 订单信息 */}
             <div style={styles.infoRow}>
               <span style={styles.label}>商品</span>
               <span style={styles.value}>{order?.title}</span>
             </div>
             <div style={styles.infoRow}>
               <span style={styles.label}>金额</span>
               <span style={styles.value}>¥{order?.totalPrice || order?.price}</span>
             </div>
             <div style={styles.infoRow}>
               <span style={styles.label}>地址</span>
               <span style={styles.value}>{order?.address?.detail}</span>
             </div>
             
             {/* 按钮组 */}
             <div style={{marginTop: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
               {order?.status === "已送达" && (
                 <button style={styles.btnPrimary} onClick={() => doAction('confirm')}>确认收货</button>
               )}
               {(order?.status === "待发货" || order?.status === "配送中") && (
                 <button style={styles.btnDangerGhost} onClick={() => doAction('return')}>申请退货</button>
               )}
               {(order?.status === "已完成" || order?.status === "商家已取消") && (
                 <button style={styles.btnGhost} onClick={() => doAction('delete')}>删除订单</button>
               )}
             </div>
          </div>

          {/* 物流时间轴 */}
          <div style={{...styles.card, flex: 1}}>
            <h3 style={{margin: '0 0 15px 0', fontSize: '16px'}}>物流进度</h3>
            <Timeline status={order?.status} deliveredTime={order?.deliveredAt} />
          </div>
        </div>

        {/* 右侧：地图 */}
        <div style={styles.mapPanel}>
          <div ref={mapRef} style={{width: '100%', height: '100%', borderRadius: '12px'}} />
          {order?.status === "配送中" && (
            <div style={styles.mapOverlay}>
              <span className="pulse-dot"></span> 实时配送中
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 简单的 Timeline 组件
const Timeline = ({ status, deliveredTime }: { status: string, deliveredTime?: string }) => {
  const steps = [
    { key: "待发货", label: "商家接单", time: "" },
    { key: "配送中", label: "骑手配送中", time: "" },
    { key: "已送达", label: "送达目的地", time: deliveredTime ? new Date(deliveredTime).toLocaleTimeString() : "" },
    { key: "已完成", label: "订单完成", time: "" },
  ];
  
  // 简单的状态映射索引
  const statusIdx = steps.findIndex(s => s.key === status);
  const activeIdx = statusIdx === -1 ? (status === "商家已取消" ? -1 : 0) : statusIdx;

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: '20px'}}>
      {steps.map((step, idx) => {
        const isActive = idx <= activeIdx;
        const isCurrent = idx === activeIdx;
        return (
          <div key={step.key} style={{display: 'flex', gap: '12px'}}>
             <div style={{display:'flex', flexDirection:'column', alignItems:'center'}}>
                <div style={{
                  width: '12px', height: '12px', borderRadius: '50%', 
                  background: isActive ? '#1890ff' : '#eee',
                  border: isCurrent ? '3px solid #e6f7ff' : 'none'
                }} />
                {idx !== steps.length - 1 && <div style={{width: '2px', flex: 1, background: isActive ? '#1890ff' : '#eee', margin: '4px 0'}} />}
             </div>
             <div>
               <div style={{color: isActive ? '#333' : '#999', fontWeight: isActive ? 'bold' : 'normal'}}>
                 {step.label}
               </div>
               {step.time && <div style={{fontSize: '12px', color: '#999'}}>{step.time}</div>}
             </div>
          </div>
        )
      })}
    </div>
  )
}

// 样式对象
const styles: Record<string, any> = {
  container: { maxWidth: '1200px', margin: '0 auto', padding: '20px', fontFamily: "'Segoe UI', Roboto, sans-serif", minHeight: '100vh', boxSizing: 'border-box' },
  header: { marginBottom: '20px' },
  backLink: { textDecoration: 'none', color: '#1890ff', fontWeight: 500 },
  content: { display: 'flex', gap: '20px', height: 'calc(100vh - 100px)', flexWrap: 'wrap' },
  leftPanel: { flex: '1', minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '20px' },
  mapPanel: { flex: '2', minWidth: '400px', background: '#fff', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', position: 'relative' },
  card: { background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' },
  
  statusHeader: { textAlign: 'center', paddingBottom: '15px' },
  etaBadge: { display: 'inline-block', background: '#e6f7ff', color: '#1890ff', padding: '4px 10px', borderRadius: '20px', fontSize: '13px', fontWeight: 'bold' },
  divider: { height: '1px', background: '#f0f0f0', margin: '0 0 15px 0' },
  
  infoRow: { display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '14px' },
  label: { color: '#888' },
  value: { color: '#333', fontWeight: 500, textAlign: 'right', maxWidth: '60%' },
  
  btnPrimary: { background: "#1890ff", color: "white", border: "none", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", flex: 1 },
  btnDangerGhost: { background: "white", color: "#ff4d4f", border: "1px solid #ff4d4f", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", flex: 1 },
  btnGhost: { background: "white", color: "#666", border: "1px solid #ddd", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", flex: 1 },

  mapOverlay: { position: 'absolute', top: '20px', left: '20px', background: 'rgba(255,255,255,0.9)', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', boxShadow: '0 2px 5px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: '6px', color: '#1890ff' },
};