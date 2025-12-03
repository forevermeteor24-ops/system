import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
// 注意：这里引用的 API 同样适用，只要你的 token 是商家 token
import { fetchOrder, updateStatus, shipOrder, deleteOrder } from "../api/orders"; 
import { formatRemainingETA } from "../utils/formatETA";

// 声明 AMap 防止报错
declare const AMap: any;

export default function MerchantOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [order, setOrder] = useState<any>(null);
  const [remainingTime, setRemainingTime] = useState<string>("--");

  // ⭐ 新增：实时倒计时状态
  const [realtimeLabel, setRealtimeLabel] = useState<string>("")
  
  // 地图相关 Ref (完全复用)
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const polylineRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [markerReady, setMarkerReady] = useState(false); 

  /* ---------------- 1. 加载数据 & 地图 (逻辑完全一致，直接复用) ---------------- */
  useEffect(() => {
    if (!id) return;
    let mounted = true;

    (async () => {
      try {
        const o = await fetchOrder(id);
        if (!mounted) return;
        setOrder(o);

        if (!mapRef.current) return;

        if (!mapInstanceRef.current) {
          mapInstanceRef.current = new AMap.Map(mapRef.current, {
            zoom: 13,
            center: [121.47, 31.23],
            viewMode: "3D",
          });
          mapInstanceRef.current.plugin(["AMap.MoveAnimation", "AMap.ToolBar"], () => {
             mapInstanceRef.current.addControl(new AMap.ToolBar());
          });
        }

        const map = mapInstanceRef.current;
        const points = o.routePoints ?? [];

        if (polylineRef.current) map.remove(polylineRef.current);
        if (markerRef.current) map.remove(markerRef.current);

        if (points.length > 0) {
          const path = points.map((p: any) => new AMap.LngLat(p.lng, p.lat));
          const polyline = new AMap.Polyline({
            path,
            strokeWeight: 6,
            strokeColor: "#1890ff",
            lineJoin: 'round',
            showDir: true,
          });
          map.add(polyline);
          polylineRef.current = polyline;
          map.setFitView([polyline]);

          const startPos = (o as any).trackState?.lastPosition 
            ? new AMap.LngLat((o as any).trackState.lastPosition.lng, (o as any).trackState.lastPosition.lat)
            : path[0];

          // 商家端可以用不同颜色的车，或者保持一致
          const carIcon = new AMap.Icon({
            size: new AMap.Size(52, 26),
            image: "https://cdn-icons-png.flaticon.com/512/3097/3097136.png", 
            imageSize: new AMap.Size(52, 26),
            imageOffset: new AMap.Pixel(0, 0)
          });

          const marker = new AMap.Marker({
            position: startPos,
            icon: carIcon,
            offset: new AMap.Pixel(-26, -13),
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

  /* ---------------- 2. WebSocket (逻辑完全一致，直接复用) ---------------- */
  useEffect(() => {
    if (!order || order.status !== "配送中" || !markerReady) return;

    if (wsRef.current) wsRef.current.close();
    const ws = new WebSocket("wss://system-backend.zeabur.app");
    wsRef.current = ws;

    ws.onopen = () => {
      // 商家订阅同一个 orderId，也能收到位置更新
      ws.send(JSON.stringify({ type: "subscribe", orderId: order._id }));
      if (order.status === "配送中"
      ) {
            console.log("正在尝试恢复轨迹...");
        // 发送 start-track 命令。
        // 后端逻辑是：如果 player 不存在会新建；如果存在会复用；
        // 并且会调用 restoreState 从数据库读取进度，不会从头开始，而是从断点继续。
        ws.send(JSON.stringify({ 
          type: "start-track", 
          orderId: order._id,
          points: order.routePoints // 必须把路径再次传给后端，防止后端重启丢失路径数据
        }));
        }
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        // ⭐ 处理剩余时间更新
        if (msg.remainingSeconds !== undefined) {
          // 将秒转换为友好格式 (如: 1小时 5分钟)
          const hrs = Math.floor(msg.remainingSeconds / 3600);
          const mins = Math.floor((msg.remainingSeconds % 3600) / 60);
          const secs = Math.floor(msg.remainingSeconds % 60);
          
          let label = "";
          if (hrs > 0) label += `${hrs}小时 `;
          if (mins > 0 || hrs > 0) label += `${mins}分钟 `;
          label += `${secs}秒`;
          
          setRealtimeLabel(label);
       }
        if (msg.type === "location" && markerRef.current) {
          if (msg.nextPosition && msg.duration > 0) {
            const nextLngLat = new AMap.LngLat(msg.nextPosition.lng, msg.nextPosition.lat);
            markerRef.current.moveTo(nextLngLat, {
              duration: msg.duration,
              autoRotation: true,
            });
          } else if (msg.position) {
             const pos = new AMap.LngLat(msg.position.lng, msg.position.lat);
             markerRef.current.setPosition(pos);
          }
          if (msg.finished) {
            setOrder((prev: any) => ({ ...prev, status: "已送达" }));
          }
        }
      } catch (e) { console.error(e); }
    };

    return () => { if (ws.readyState === 1) ws.close(); };
  }, [order?._id, order?.status, markerReady]);

  /* ---------------- 3. 辅助功能 (倒计时) ---------------- */
  useEffect(() => {
    if (!order?.eta || ["已送达", "已完成", "商家已取消"].includes(order?.status)) {
      setRemainingTime("配送结束");
      return;
    }
    const timer = setInterval(() => {
      setRemainingTime(formatRemainingETA(order.eta));
    }, 1000);
    return () => clearInterval(timer);
  }, [order?.eta, order?.status]);

  /* ---------------- 4. 商家专属操作逻辑 (!!! 这里是主要区别 !!!) ---------------- */
  const doMerchantAction = async (action: 'ship' | 'cancel' | 'agree_return' | 'delete') => {
    if (!order) return;
    try {
      if (action === 'ship') {
        if(!confirm("确认立即发货？(这将启动小车模拟)")) return;
        await shipOrder(order._id); // 调用发货接口
        // 重新加载以获取最新状态
        const newOrder = await fetchOrder(order._id);
        setOrder(newOrder);
      } 
      else if (action === 'cancel') {
        if(!confirm("确认取消此订单？用户将收到退款。")) return;
        await updateStatus(order._id, "商家已取消");
        setOrder({ ...order, status: "商家已取消" });
      }
      else if (action === 'agree_return') {
        if(!confirm("同意用户退货并退款？")) return;
        await updateStatus(order._id, "商家已取消"); // 或其他完结状态
        setOrder({ ...order, status: "商家已取消" });
      } 
      else if (action === 'delete') {
        if(!confirm("确认删除记录？")) return;
        await deleteOrder(order._id);
        navigate("/merchant"); // 返回商家首页
      }
    } catch(e) { alert("操作失败"); }
  };

  /* ---------------- 5. 渲染视图 ---------------- */
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        {/* 返回链接改为商家首页 */}
        <Link to="/merchant" style={styles.backLink}>← 返回商家工作台</Link>
        <span style={{color: '#999'}}> / 订单详情 (商家版)</span>
      </div>

      <div style={styles.content}>
        <div style={styles.leftPanel}>
          <div style={styles.card}>
             <div style={styles.statusHeader}>
               <div style={{fontSize: '14px', color: '#666'}}>当前订单状态</div>
               <div style={{fontSize: '24px', fontWeight: 'bold', color: '#1890ff', margin: '5px 0'}}>
                 {order?.status || "加载中..."}
               </div>

               {/* ⭐ 修改这里：优先显示实时计算的时间 */}
               {order?.status === "配送中" && (
                 <div style={styles.etaBadge}>
                   预计送达: {realtimeLabel || remainingTime}
                 </div>
               )}
               </div>
          

             <div style={styles.divider} />

             {/* 订单信息展示 (复用) */}
             <div style={styles.infoRow}>
               <span style={styles.label}>客户ID</span>
               <span style={styles.value}>{order?.userId}</span>
             </div>
             <div style={styles.infoRow}>
               <span style={styles.label}>商品</span>
               <span style={styles.value}>{order?.title}</span>
             </div>
             <div style={styles.infoRow}>
               <span style={styles.label}>总金额</span>
               <span style={styles.value}>¥{order?.totalPrice || order?.price}</span>
             </div>
             <div style={styles.infoRow}>
               <span style={styles.label}>配送地址</span>
               <span style={styles.value}>{order?.address?.detail}</span>
             </div>
             
             {/* === 商家操作按钮组 === */}
             <div style={{marginTop: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
               
               {/* 待发货：显示发货按钮 */}
               {order?.status === "待发货" && (
                 <>
                    <button style={styles.btnPrimary} onClick={() => doMerchantAction('ship')}>立即发货</button>
                 </>
               )}

               {/* 用户申请退货：显示同意按钮 */}
               {order?.status === "用户申请退货" && (
                 <button style={styles.btnDanger} onClick={() => doMerchantAction('agree_return')}>同意退款</button>
               )}

               {/* 已完成/已取消：显示删除 */}
               {(order?.status === "已完成" || order?.status === "商家已取消") && (
                 <button style={styles.btnGhost} onClick={() => doMerchantAction('delete')}>删除记录</button>
               )}

                {/* 配送中：商家通常只能看，不能操作，或许可以加个"联系骑手"的空按钮 */}
                {order?.status === "配送中" && (
                 <button style={{...styles.btnGhost, cursor: 'not-allowed', opacity: 0.6}} disabled>配送中...</button>
               )}

             </div>
          </div>

          <div style={{...styles.card, flex: 1}}>
            <h3 style={{margin: '0 0 15px 0', fontSize: '16px'}}>物流监控</h3>
            {/* 时间轴复用之前的组件 */}
            <Timeline status={order?.status} deliveredTime={order?.deliveredAt} />
          </div>
        </div>

        {/* 地图面板 (复用) */}
        <div style={styles.mapPanel}>
          <div ref={mapRef} style={{width: '100%', height: '100%', borderRadius: '12px'}} />
          {order?.status === "配送中" && (
            <div style={styles.mapOverlay}>
               <span style={{width:'8px', height:'8px', background:'green', borderRadius:'50%', display:'inline-block'}}></span>
               车辆实时监控中
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 复用之前的 Timeline 组件
const Timeline = ({ status, deliveredTime }: { status: string, deliveredTime?: string }) => {
  const steps = [
    { key: "待发货", label: "等待发货", time: "" },
    { key: "配送中", label: "配送途中", time: "" },
    { key: "已送达", label: "已送达", time: deliveredTime ? new Date(deliveredTime).toLocaleTimeString() : "" },
    { key: "已完成", label: "订单完成", time: "" },
  ];
  
  const statusIdx = steps.findIndex(s => s.key === status);
  const activeIdx = statusIdx === -1 ? (status === "商家已取消" ? -1 : 0) : statusIdx;

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: '20px'}}>
      {steps.map((step, idx) => {
        const isActive = idx <= activeIdx;
        return (
          <div key={step.key} style={{display: 'flex', gap: '12px'}}>
             <div style={{display:'flex', flexDirection:'column', alignItems:'center'}}>
                <div style={{
                  width: '12px', height: '12px', borderRadius: '50%', 
                  background: isActive ? '#1890ff' : '#eee'
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

// 样式复用，稍微改一点点颜色区分
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
  
  // 按钮样式
  btnPrimary: { background: "#1890ff", color: "white", border: "none", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", flex: 1 },
  btnDanger: { background: "#ff4d4f", color: "white", border: "none", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", flex: 1 },
  btnDangerGhost: { background: "white", color: "#ff4d4f", border: "1px solid #ff4d4f", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", flex: 1 },
  btnGhost: { background: "white", color: "#666", border: "1px solid #ddd", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", flex: 1 },

  mapOverlay: { position: 'absolute', top: '20px', left: '20px', background: 'rgba(255,255,255,0.95)', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', boxShadow: '0 2px 5px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: '6px', color: '#333' },
};