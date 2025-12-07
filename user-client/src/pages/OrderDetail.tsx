import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { fetchOrder, updateStatus, deleteOrder } from "../api/orders";
import { formatRemainingETA } from "../utils/formatETA";

// 声明 AMap 类型防止 TS 报错
declare const AMap: any;

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // --- 状态管理 ---
  const [order, setOrder] = useState<any>(null);
  const [remainingTime, setRemainingTime] = useState<string>("--");
  const [realtimeLabel, setRealtimeLabel] = useState<string>("");
  const [markerReady, setMarkerReady] = useState(false); 
  
  // 搜索框状态
  const [searchId, setSearchId] = useState("");

  // --- Refs ---
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const polylineRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);

  /* ---------------- 0. 搜索处理函数 ---------------- */
  const handleSearch = () => {
    if (!searchId.trim()) return;
    navigate(`/orders/${searchId.trim()}`);
    setSearchId(""); 
  };

  /* ---------------- 1. 加载订单 & 初始化地图 ---------------- */
  useEffect(() => {
    if (!id) return;

    let mounted = true;
    
    // 切换订单时重置状态
    setOrder(null);
    setRemainingTime("--");
    setRealtimeLabel("");
    setMarkerReady(false);

    (async () => {
      try {
        // ⭐ 后端已包含自动结算逻辑，返回的 status 是准确的
        const o = await fetchOrder(id);
        if (!mounted) return;
        setOrder(o);

        // 等待 DOM 渲染
        if (!mapRef.current) return;

        // 初始化地图实例 (单例模式)
        if (!mapInstanceRef.current) {
          mapInstanceRef.current = new AMap.Map(mapRef.current, {
            zoom: 13,
            center: [121.47, 31.23], 
            viewMode: "3D", 
            mapStyle: "amap://styles/whitesmoke", 
          });

          mapInstanceRef.current.plugin(["AMap.MoveAnimation", "AMap.ToolBar", "AMap.Scale"], () => {
             mapInstanceRef.current.addControl(new AMap.ToolBar({ position: 'RB' }));
             mapInstanceRef.current.addControl(new AMap.Scale());
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
          
          const polyline = new AMap.Polyline({
            path,
            strokeWeight: 6,
            strokeColor: "#1890ff",
            lineJoin: 'round',
            showDir: true,
          });
          map.add(polyline);
          polylineRef.current = polyline;
          
          map.setFitView([polyline], true, [60, 60, 60, 60]);

          // ========================= 🟢 逻辑简化 =========================
          // 不再需要前端猜测是否超时，直接信赖后端状态
          let startPos;
          const hasTrackData = (o as any).trackState?.lastPosition;

          // 1. 状态是“已送达/已完成” -> 终点
          if (["已送达", "已完成"].includes(o.status)) {
             startPos = path[path.length - 1]; 
             setRemainingTime("已送达");
          } 
          // 2. 状态是“配送中”且有位置数据 -> 恢复位置
          else if (hasTrackData) {
             startPos = new AMap.LngLat(hasTrackData.lng, hasTrackData.lat);
          } 
          // 3. 其他情况 -> 起点
          else {
             startPos = path[0];
          }
          // ===============================================================

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
            zIndex: 100,
          });

          map.add(marker);
          markerRef.current = marker;
          setMarkerReady(true);
        }

      } catch (err) {
        console.error("加载失败", err);
        if(mounted) alert("未找到该订单");
      }
    })();

    return () => { mounted = false; };
  }, [id]);

  /* ---------------- 2. WebSocket 实时追踪 ---------------- */
  useEffect(() => {
    // 拦截：如果是已结束状态，绝对不连 WS
    if (!order || ["已送达", "已完成", "商家已取消"].includes(order.status)) return;
    if ((order.status !== "配送中" && order.status !== "待发货") || !markerReady) return;
  
    if (wsRef.current) wsRef.current.close();

    const ws = new WebSocket("wss://system-backend.zeabur.app"); // 替换真实地址
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "subscribe", orderId: order._id }));
      ws.send(JSON.stringify({ type: "request-current", orderId: order._id }));
    };
    
    ws.onmessage = async (ev) => { // 👈 注意：这里加了 async
      try {
        const msg = JSON.parse(ev.data);

        // ======================= 🟢 核心修复：防止僵尸订单复活 =======================
        // 当服务器重启后，会告诉前端 "no-track" (我内存里没这个车)
        if (msg.type === "no-track") {
           const originalEta = order.eta ? new Date(order.eta).getTime() : 0;
           const now = Date.now();

           // 判断：如果当前时间已经超过了原本的 ETA
           // 说明这单肯定早就跑完了，绝对不能发送 start-track，否则 ETA 会被重置到未来！
           if (originalEta && now > originalEta) {
               console.warn("检测到订单超时 (服务器重启导致)，正在强制结算...");

               // 1. 调用 API 告诉数据库：这单完了
               await updateStatus(order._id, "已送达");

               // 2. 更新前端界面，让车去终点，按钮变绿
               setOrder((prev: any) => ({ ...prev, status: "已送达" }));
               setRemainingTime("已送达");

               // 3. 断开连接，不再接收消息
               ws.close();
               return; 
           }

           // 只有真的还没超时（比如刚发货服务器就重启了），才允许恢复运行
           console.log("服务器无记录且未超时，正在恢复运行...");
           ws.send(JSON.stringify({ 
             type: "start-track", 
             orderId: order._id,
             points: order.routePoints 
           }));
        }
        // ===========================================================================

        // 同步当前位置
        if (msg.type === "current-state" && msg.position && markerRef.current) {
           const pos = new AMap.LngLat(msg.position.lng, msg.position.lat);
           markerRef.current.setPosition(pos);
        }
        
        // 实时位置更新
        if (msg.type === "location" && markerRef.current) {
          if (msg.remainingSeconds !== undefined) {
             setRemainingTime(formatRemainingETA(Date.now() + msg.remainingSeconds * 1000));
          }
          
          if (msg.nextPosition && msg.duration > 0) {
            const nextLngLat = new AMap.LngLat(msg.nextPosition.lng, msg.nextPosition.lat);
            markerRef.current.moveTo(nextLngLat, {
              duration: msg.duration, 
              autoRotation: true,
            });
          }
          
          // 正常跑完结束
          if (msg.finished) {
             // 这里也要记得调用一下后端 API 兜底（虽然自动结算有了，多调一次无害）
             await updateStatus(order._id, "已送达");
             setOrder((prev: any) => ({ ...prev, status: "已送达" }));
             setRemainingTime("已送达");
             ws.close();
          }
        }
      } catch (e) { console.error(e); }
    };

    return () => { if (ws.readyState === 1) ws.close(); };
  }, [order?._id, order?.status, markerReady]);

  /* ---------------- 3. 辅助功能 ---------------- */
  useEffect(() => {
    if (!order?.eta || ["已送达", "已完成", "商家已取消"].includes(order?.status)) {
      setRemainingTime("已送达"); 
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
        if(!confirm("确认收到商品？")) return;
        await updateStatus(order._id, "已完成");
        setOrder({ ...order, status: "已完成" });
        window.location.reload();
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
  const merchantInfo = order && typeof order.merchantId === 'object' ? order.merchantId : null;
  const shopName = merchantInfo?.username || "未知商家";
  const shopPhone = merchantInfo?.phone || "暂无电话";
  
  // 用于 UI 显示 (例如显示地图上的监控标签)
  const isEtaPassed = order?.eta && new Date(order.eta).getTime() < Date.now();

  return (
    <div style={styles.container}>
      
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
            <Link to="/orders" style={styles.backLink}>
              <span style={{marginRight: '6px'}}>←</span> 返回列表
            </Link>
            <span style={styles.breadcrumbSeparator}>/</span>
            <span style={styles.breadcrumbCurrent}>订单详情</span>
        </div>
        
        <div style={styles.searchContainer}>
            <input 
                type="text" 
                placeholder="搜索订单 ID..." 
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                style={styles.searchInput}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button onClick={handleSearch} style={styles.searchBtn}>🔍 搜索</button>
        </div>
      </div>

      <div style={styles.content}>
        {/* 左侧信息 */}
        <div style={styles.leftPanel}>
          <div style={styles.card}>
             <div style={styles.statusHeader}>
               <div style={{fontSize: '13px', color: '#888', marginBottom: '4px'}}>当前状态</div>
               <div style={{fontSize: '26px', fontWeight: '800', color: '#1890ff', letterSpacing: '1px'}}>
                 {order?.status || "加载中..."}
               </div>
               
               {order?.status === "配送中" && (
                 <div style={styles.etaBadge}>
                   预计送达: {realtimeLabel || remainingTime}
                 </div>
               )}
             </div>

             <div style={styles.divider} />

             <div style={styles.infoGroup}>
                <InfoItem label="商品名称" value={order?.title} />
                <InfoItem label="订单金额" value={`¥${order?.totalPrice || order?.price}`} highlight />
                <InfoItem label="配送地址" value={order?.address?.detail} />
             </div>
             
             {/* 操作按钮组 */}
             <div style={styles.actionGroup}>
               {/* 
                  🟢 简化后的逻辑：
                  因为后端会自动把超时的订单改为“已送达”，
                  所以这里不需要再判断 isEtaPassed，只看 status 即可。
               */}
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

          <div style={{...styles.card, flex: 1}}>
            <h3 style={{margin: '0 0 20px 0', fontSize: '16px'}}>物流进度</h3>
            <Timeline status={order?.status} deliveredTime={order?.deliveredAt} />
          </div>
        </div>

        {/* 右侧地图 */}
        <div style={styles.mapPanel}>
          <div ref={mapRef} style={{width: '100%', height: '100%'}} />
          
          {order && (
            <div style={styles.merchantCard}>
                <div style={styles.merchantHeader}>
                    <div style={styles.avatarPlaceholder}>商</div>
                    <div>
                        <div style={styles.merchantName}>{shopName}</div>
                        <div style={styles.merchantLabel}>配送商家</div>
                    </div>
                </div>
                <div style={styles.dividerMin}></div>
                <div style={styles.phoneRow}>
                    <span style={{fontSize: '16px'}}>📞</span> 
                    <span style={styles.phoneText}>{shopPhone}</span>
                    <button style={styles.btnMiniCopy} onClick={() => { if(shopPhone) navigator.clipboard.writeText(shopPhone) }}>复制</button>
                </div>
            </div>
          )}

          {/* 实时监控标签 */}
          {order?.status === "配送中" && !isEtaPassed && (
            <div style={styles.mapOverlay}>
              <span style={styles.pulsingDot}></span> 实时配送中
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- 子组件 ---
const InfoItem = ({ label, value, highlight, copyable }: any) => (
  <div style={styles.infoRow}>
    <span style={styles.label}>{label}</span>
    <span 
      style={{...styles.value, color: highlight ? '#fa8c16' : '#333', cursor: copyable ? 'pointer' : 'default'}}
      onClick={() => copyable && value && navigator.clipboard.writeText(value)}
      title={copyable ? "点击复制" : ""}
    >
      {value}
    </span>
  </div>
);

const Timeline = ({ status, deliveredTime }: { status: string, deliveredTime?: string }) => {
  const steps = [
    { key: "待发货", label: "商家接单", time: "" },
    { key: "配送中", label: "骑手配送中", time: "" },
    { key: "已送达", label: "送达目的地", time: deliveredTime ? new Date(deliveredTime).toLocaleTimeString() : "" },
    { key: "已完成", label: "订单完成", time: "" },
  ];
  const statusIdx = steps.findIndex(s => s.key === status);
  const activeIdx = statusIdx === -1 ? (status === "商家已取消" ? -1 : 0) : statusIdx;

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: '24px', paddingLeft: '8px'}}>
      {steps.map((step, idx) => {
        const isActive = idx <= activeIdx;
        return (
          <div key={step.key} style={{display: 'flex', gap: '15px', position: 'relative'}}>
             {idx !== steps.length - 1 && (
               <div style={{
                 position: 'absolute', left: '6px', top: '18px', bottom: '-26px', width: '2px', 
                 background: isActive && idx < activeIdx ? '#1890ff' : '#f0f0f0' 
               }} />
             )}
             <div style={{
               width: '14px', height: '14px', borderRadius: '50%', border: isActive ? '3px solid #d6e4ff' : '3px solid transparent',
               background: isActive ? '#1890ff' : '#ddd', zIndex: 1, flexShrink: 0
             }} />
             <div>
               <div style={{color: isActive ? '#333' : '#bbb', fontWeight: isActive ? '600' : '400', fontSize: '14px'}}>
                 {step.label}
               </div>
               {step.time && <div style={{fontSize: '12px', color: '#999', marginTop: '2px'}}>{step.time}</div>}
             </div>
          </div>
        )
      })}
    </div>
  )
}

// --- 样式表 ---
const styles: Record<string, any> = {
  container: { maxWidth: '1400px', margin: '0 auto', padding: '24px', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", background: '#f7f8fa', minHeight: '100vh', boxSizing: 'border-box' },
  header: { marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '16px 24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' },
  headerLeft: { display: 'flex', alignItems: 'center', fontSize: '15px' },
  backLink: { textDecoration: 'none', color: '#666', fontWeight: 500, display: 'flex', alignItems: 'center' },
  breadcrumbSeparator: { margin: '0 10px', color: '#ddd' },
  breadcrumbCurrent: { color: '#1890ff', fontWeight: 600 },
  searchContainer: { display: 'flex', gap: '0', boxShadow: '0 2px 6px rgba(0,0,0,0.05)', borderRadius: '6px' },
  searchInput: { padding: '8px 16px', border: '1px solid #d9d9d9', borderRight: 'none', borderRadius: '6px 0 0 6px', outline: 'none', width: '240px', fontSize: '14px' },
  searchBtn: { padding: '8px 20px', border: 'none', background: '#1890ff', color: 'white', borderRadius: '0 6px 6px 0', cursor: 'pointer', fontWeight: 500 },
  content: { display: 'flex', gap: '24px', height: 'calc(100vh - 140px)' },
  leftPanel: { flex: '0 0 360px', display: 'flex', flexDirection: 'column', gap: '24px' },
  mapPanel: { flex: '1', background: '#fff', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', position: 'relative', overflow: 'hidden' },
  card: { background: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' },
  statusHeader: { textAlign: 'center', paddingBottom: '20px' },
  etaBadge: { display: 'inline-block', background: '#e6f7ff', color: '#1890ff', padding: '6px 16px', borderRadius: '20px', fontSize: '14px', fontWeight: '600', marginTop: '8px' },
  divider: { height: '1px', background: '#f0f0f0', margin: '0 0 20px 0' },
  infoGroup: { display: 'flex', flexDirection: 'column', gap: '16px' },
  infoRow: { display: 'flex', justifyContent: 'space-between', fontSize: '14px', alignItems: 'center' },
  label: { color: '#888' },
  value: { color: '#333', fontWeight: 500, textAlign: 'right', maxWidth: '65%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  actionGroup: { marginTop: '30px', display: 'flex', gap: '12px' },
  btnPrimary: { background: "#1890ff", color: "white", border: "none", padding: "10px", borderRadius: "8px", cursor: "pointer", flex: 1, fontWeight: 600 },
  btnSuccess: { background: "#52c41a", color: "white", border: "none", padding: "10px", borderRadius: "8px", cursor: "pointer", flex: 1, fontWeight: 600, boxShadow: '0 4px 10px rgba(82, 196, 26, 0.2)' },
  btnDangerGhost: { background: "white", color: "#ff4d4f", border: "1px solid #ff4d4f", padding: "10px", borderRadius: "8px", cursor: "pointer", flex: 1, fontWeight: 600 },
  btnGhost: { background: "white", color: "#666", border: "1px solid #ddd", padding: "10px", borderRadius: "8px", cursor: "pointer", flex: 1 },
  merchantCard: {
    position: 'absolute', top: '24px', left: '24px', zIndex: 150,
    background: 'rgba(255, 255, 255, 0.98)', backdropFilter: 'blur(10px)',
    padding: '16px 20px', borderRadius: '12px',
    boxShadow: '0 8px 20px rgba(0,0,0,0.08)', minWidth: '240px',
    border: '1px solid rgba(255,255,255,0.8)'
  },
  merchantHeader: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' },
  avatarPlaceholder: { 
    width: '44px', height: '44px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff7e6', color: '#fa8c16',
    fontSize: '18px', fontWeight: 'bold', boxShadow: '0 2px 6px rgba(0,0,0,0.1)' 
  },
  merchantName: { fontWeight: '700', fontSize: '16px', color: '#333' },
  merchantLabel: { fontSize: '12px', color: '#999', marginTop: '2px' },
  dividerMin: { height: '1px', background: '#eee', margin: '4px 0 12px 0' },
  phoneRow: { display: 'flex', alignItems: 'center', gap: '10px' },
  phoneText: { fontWeight: '600', fontSize: '15px', color: '#333', letterSpacing: '0.5px' },
  btnMiniCopy: { 
    marginLeft: 'auto', fontSize: '12px', padding: '4px 10px', 
    background: '#f0f2f5', color: '#666', border: 'none', 
    borderRadius: '4px', cursor: 'pointer' 
  },
  mapOverlay: { 
    position: 'absolute', bottom: '30px', left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.7)', color: 'white', padding: '8px 16px', borderRadius: '30px', 
    fontSize: '13px', fontWeight: '500', boxShadow: '0 4px 10px rgba(0,0,0,0.2)', 
    display: 'flex', alignItems: 'center', gap: '8px', zIndex: 100
  },
  pulsingDot: {
    width: '8px', height: '8px', background: '#52c41a', borderRadius: '50%', 
    boxShadow: '0 0 0 2px rgba(82, 196, 26, 0.4)'
  }
};