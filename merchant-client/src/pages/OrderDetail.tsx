import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { fetchOrder, updateStatus, shipOrder, deleteOrder } from "../api/orders"; 
import { formatRemainingETA } from "../utils/formatETA";

// 声明 AMap 防止 TS 报错
declare const AMap: any;

export default function MerchantOrderDetail() {
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

  /* ---------------- 0. 搜索功能 ---------------- */
  const handleSearch = () => {
    if (!searchId.trim()) return;
    navigate(`/merchant/orders/${searchId.trim()}`);
    setSearchId(""); 
  };

  /* ---------------- 1. 加载数据 & 初始化地图 ---------------- */
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
        // ⭐ 后端现在会自动修复超时订单，所以这里拿到的 o.status 已经是准确的了
        const o = await fetchOrder(id);
        if (!mounted) return;
        setOrder(o);

        if (!mapRef.current) return;

        // 初始化地图 (单例模式)
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

        // 绘制路径和车辆
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

          // ========================= 🟢 逻辑已简化 =========================
          // 因为后端已经保证了状态准确性，前端不需要再猜是否超时了
          let startPos;
          const hasTrackData = (o as any).trackState?.lastPosition;

          // 1. 如果状态是已送达/已完成 -> 强制在终点
          if (["已送达", "已完成"].includes(o.status)) {
             startPos = path[path.length - 1]; 
             setRemainingTime("已送达");
          } 
          // 2. 如果是配送中，且有位置数据 -> 恢复位置
          else if (hasTrackData) {
            startPos = new AMap.LngLat(hasTrackData.lng, hasTrackData.lat);
          } 
          // 3. 刚发货或无数据 -> 起点
          else {
             startPos = path[0];
          }
          // =================================================================
          
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
        if (mounted) alert("未找到该订单或无权限查看");
      }
    })();

    return () => { mounted = false; };
  }, [id]);

  /* ---------------- 2. (已删除) 自动纠错 useEffect ---------------- */
  // 之前的那个自动调用 updateStatus 的 useEffect 已经被删除
  // 因为后端的 getOrder 接口已经处理了这件事

  /* ---------------- 3. WebSocket 追踪逻辑 ---------------- */
  useEffect(() => {
    // 拦截：如果是已结束状态，绝对不连 WS
    if (!order || ["已送达", "已完成", "商家已取消"].includes(order.status)) return;
    if (order.status !== "配送中" || !markerReady) return;

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

  /* ---------------- 4. 辅助倒计时 ---------------- */
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

  /* ---------------- 5. 商家操作逻辑 ---------------- */
  const doMerchantAction = async (action: 'ship' | 'cancel' | 'agree_return' | 'delete' | 'force_complete') => {
    if (!order) return;
    try {
      if (action === 'ship') {
        if(!confirm("确认立即发货？(这将启动小车模拟)")) return;
        await shipOrder(order._id);
        window.location.reload();
      } 
      else if (action === 'cancel') {
        if(!confirm("确认取消此订单？")) return;
        await updateStatus(order._id, "商家已取消");
        setOrder({ ...order, status: "商家已取消" });
      }
      else if (action === 'agree_return') {
        if(!confirm("同意退货？")) return;
        await updateStatus(order._id, "商家已取消");
        setOrder({ ...order, status: "商家已取消" });
      } 
      else if (action === 'delete') {
        if(!confirm("确认删除记录？")) return;
        await deleteOrder(order._id);
        navigate("/merchant");
      }
      // 🟢 强制完成逻辑 (保留作为双重保险)
      else if (action === 'force_complete') {
        if(!confirm("确认强制标记为已送达？")) return;
        await updateStatus(order._id, "已送达");
        window.location.reload();
      }
    } catch(e) { alert("操作失败"); }
  };

  /* ---------------- 6. 渲染视图 ---------------- */
  const userInfo = order && typeof order.userId === 'object' ? order.userId : null;
  const userName = userInfo?.username || "未知用户";
  const userPhone = userInfo?.phone || "暂无电话";
  const isEtaPassed = order?.eta && new Date(order.eta).getTime() < Date.now();

  return (
    <div style={styles.container}>
      
      {/* 顶部 Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
            <Link to="/merchant" style={styles.backLink}>
              <span style={{marginRight: '6px'}}>←</span> 返回工作台
            </Link>
            <span style={styles.breadcrumbSeparator}>/</span>
            <span style={styles.breadcrumbCurrent}>订单详情</span>
        </div>
        
        <div style={styles.searchContainer}>
            <input 
                type="text" 
                placeholder="输入订单 ID 搜索..." 
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                style={styles.searchInput}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button onClick={handleSearch} style={styles.searchBtn}>🔍 搜索</button>
        </div>
      </div>

      <div style={styles.content}>
        
        {/* 左侧面板 */}
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
                <InfoItem label="订单编号" value={order?._id} copyable />
                <InfoItem label="订单金额" value={`¥${order?.totalPrice || order?.price}`} highlight />
                <InfoItem label="配送地址" value={order?.address?.detail} />
             </div>
             
             {/* 🟢 操作按钮区 */}
             <div style={styles.actionGroup}>
               {order?.status === "待发货" && (
                    <button style={styles.btnPrimary} onClick={() => doMerchantAction('ship')}>🚀 立即发货</button>
               )}
               {order?.status === "用户申请退货" && (
                 <button style={styles.btnDanger} onClick={() => doMerchantAction('agree_return')}>同意退款</button>
               )}
               {(order?.status === "已完成" || order?.status === "商家已取消" || order?.status === "已送达") && (
                 <button style={styles.btnGhost} onClick={() => doMerchantAction('delete')}>删除记录</button>
               )}
               
               {/* 配送中按钮逻辑：保留 Force 按钮，万一用户长时间不刷新页面需要手动点 */}
               {order?.status === "配送中" && (
                 <>
                   {isEtaPassed ? (
                     <button style={styles.btnSuccess} onClick={() => doMerchantAction('force_complete')}>
                       ✅ 强制完成订单
                     </button>
                   ) : (
                     <button style={styles.btnDisabled} disabled>🚧 正在配送中...</button>
                   )}
                 </>
               )}
             </div>
          </div>

          <div style={{...styles.card, flex: 1}}>
            <h3 style={{margin: '0 0 20px 0', fontSize: '16px', color: '#333'}}>物流进度</h3>
            <Timeline status={order?.status} deliveredTime={order?.deliveredAt} />
          </div>
        </div>

        {/* 右侧地图 */}
        <div style={styles.mapPanel}>
          <div ref={mapRef} style={{width: '100%', height: '100%'}} />
          
          {order && (
            <div style={styles.receiverCard}>
                <div style={styles.receiverHeader}>
                    <div style={styles.avatarPlaceholder}>{userName[0]?.toUpperCase() || "客"}</div>
                    <div>
                        <div style={styles.receiverName}>{userName}</div>
                        <div style={styles.receiverLabel}>收货人</div>
                    </div>
                </div>
                <div style={styles.dividerMin}></div>
                <div style={styles.phoneRow}>
                    <span style={{fontSize: '16px'}}>📞</span> 
                    <span style={styles.phoneText}>{userPhone}</span>
                    <button style={styles.btnMiniCopy} onClick={() => {if(userPhone !== "暂无电话") navigator.clipboard.writeText(userPhone)}}>复制</button>
                </div>
            </div>
          )}

          {/* 实时监控标签 */}
          {order?.status === "配送中" && !isEtaPassed && (
            <div style={styles.mapOverlay}>
               <span style={styles.pulsingDot}></span>
               车辆实时监控中
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* --- 子组件 --- */
const InfoItem = ({ label, value, highlight, copyable }: any) => (
  <div style={styles.infoRow}>
    <span style={styles.label}>{label}</span>
    <span style={{
       ...styles.value, 
       color: highlight ? '#fa8c16' : '#333',
       cursor: copyable ? 'pointer' : 'default'
    }}
    onClick={() => copyable && value && navigator.clipboard.writeText(value)}
    title={copyable ? "点击复制" : ""}
    >
      {value || "--"}
    </span>
  </div>
);

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

/* --- 样式表 --- */
const styles: Record<string, any> = {
  container: { 
    maxWidth: '1400px', margin: '0 auto', padding: '24px', 
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial",
    background: '#f7f8fa', minHeight: '100vh', boxSizing: 'border-box' 
  },
  header: { 
    marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: '#fff', padding: '16px 24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
  },
  headerLeft: { display: 'flex', alignItems: 'center', fontSize: '15px' },
  backLink: { textDecoration: 'none', color: '#666', fontWeight: 500, display: 'flex', alignItems: 'center', transition: 'color 0.2s' },
  breadcrumbSeparator: { margin: '0 10px', color: '#ddd' },
  breadcrumbCurrent: { color: '#1890ff', fontWeight: 600 },
  searchContainer: { display: 'flex', gap: '0', boxShadow: '0 2px 6px rgba(0,0,0,0.05)', borderRadius: '6px' },
  searchInput: { 
    padding: '8px 16px', border: '1px solid #d9d9d9', borderRight: 'none', 
    borderRadius: '6px 0 0 6px', outline: 'none', width: '240px', fontSize: '14px', transition: 'all 0.3s'
  },
  searchBtn: { 
    padding: '8px 20px', border: 'none', background: '#1890ff', color: 'white', 
    borderRadius: '0 6px 6px 0', cursor: 'pointer', fontWeight: 500, transition: 'background 0.3s'
  },
  content: { display: 'flex', gap: '24px', height: 'calc(100vh - 140px)' },
  leftPanel: { flex: '0 0 360px', display: 'flex', flexDirection: 'column', gap: '24px' },
  mapPanel: { flex: '1', background: '#fff', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', position: 'relative', overflow: 'hidden' },
  card: { background: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' },
  statusHeader: { textAlign: 'center', paddingBottom: '20px' },
  etaBadge: { 
    display: 'inline-block', background: '#e6f7ff', color: '#1890ff', 
    padding: '6px 16px', borderRadius: '20px', fontSize: '14px', fontWeight: '600', marginTop: '8px' 
  },
  divider: { height: '1px', background: '#f0f0f0', margin: '0 0 20px 0' },
  infoGroup: { display: 'flex', flexDirection: 'column', gap: '16px' },
  infoRow: { display: 'flex', justifyContent: 'space-between', fontSize: '14px', alignItems: 'center' },
  label: { color: '#888' },
  value: { color: '#333', fontWeight: 500, textAlign: 'right', maxWidth: '65%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  actionGroup: { marginTop: '30px', display: 'flex', gap: '12px' },
  btnPrimary: { background: "#1890ff", color: "white", border: "none", padding: "10px", borderRadius: "8px", cursor: "pointer", flex: 1, fontWeight: 600, boxShadow: '0 4px 10px rgba(24, 144, 255, 0.2)' },
  btnDanger: { background: "#ff4d4f", color: "white", border: "none", padding: "10px", borderRadius: "8px", cursor: "pointer", flex: 1, fontWeight: 600 },
  btnSuccess: { background: "#52c41a", color: "white", border: "none", padding: "10px", borderRadius: "8px", cursor: "pointer", flex: 1, fontWeight: 600, boxShadow: '0 4px 10px rgba(82, 196, 26, 0.2)' },
  btnGhost: { background: "white", color: "#666", border: "1px solid #ddd", padding: "10px", borderRadius: "8px", cursor: "pointer", flex: 1 },
  btnDisabled: { background: "#f5f5f5", color: "#bbb", border: "1px solid #eee", padding: "10px", borderRadius: "8px", cursor: "not-allowed", flex: 1 },
  receiverCard: {
    position: 'absolute', top: '24px', left: '24px', zIndex: 150,
    background: 'rgba(255, 255, 255, 0.98)', backdropFilter: 'blur(10px)',
    padding: '16px 20px', borderRadius: '12px',
    boxShadow: '0 8px 20px rgba(0,0,0,0.08)', minWidth: '240px',
    border: '1px solid rgba(255,255,255,0.8)'
  },
  receiverHeader: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' },
  avatarPlaceholder: { 
    width: '44px', height: '44px', background: 'linear-gradient(135deg, #e6f7ff 0%, #bae7ff 100%)', 
    color: '#1890ff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', 
    fontSize: '18px', fontWeight: 'bold', boxShadow: '0 2px 6px rgba(24, 144, 255, 0.15)' 
  },
  receiverName: { fontWeight: '700', fontSize: '16px', color: '#333' },
  receiverLabel: { fontSize: '12px', color: '#999', marginTop: '2px' },
  dividerMin: { height: '1px', background: '#eee', margin: '4px 0 12px 0' },
  phoneRow: { display: 'flex', alignItems: 'center', gap: '10px' },
  phoneText: { fontWeight: '600', fontSize: '15px', color: '#333', letterSpacing: '0.5px' },
  btnMiniCopy: { 
    marginLeft: 'auto', fontSize: '12px', padding: '4px 10px', 
    background: '#f0f2f5', color: '#666', border: 'none', 
    borderRadius: '4px', cursor: 'pointer', transition: 'background 0.2s'
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