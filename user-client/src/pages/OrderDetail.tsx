import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  fetchOrder,
  requestRoute,
  updateStatus,
  deleteOrder,
} from "../api/orders";

declare const AMap: any;

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [order, setOrder] = useState<any>(null);
  const [routePoints, setRoutePoints] = useState<any[]>([]);
  const [routeLoaded, setRouteLoaded] = useState(false);
  const [fitViewDone, setFitViewDone] = useState(false);

  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);

  /* ------------------------------------------------------
     初始化：获取订单 → 初始化地图 → 获取真实路线
  ------------------------------------------------------ */
  useEffect(() => {
    if (!id) return;
    let mounted = true;

    (async () => {
      console.log("Fetching order data...");
      try {
        const o = await fetchOrder(id);
        if (!mounted) return;
        setOrder(o);

        console.log("订单信息：", o);

        /* 等待 mapRef 渲染 */
        await new Promise<void>((resolve) => {
          const wait = () =>
            mapRef.current ? resolve() : requestAnimationFrame(wait);
          wait();
        });

        /* 初始化空地图（后续再设中心） */
        const map =
          mapInstanceRef.current ||
          new AMap.Map(mapRef.current!, {
            zoom: 14,
            center: [116.397428, 39.90923], // 临时中心点
          });

        mapInstanceRef.current = map;

        // 请求后端路线
        const r = await requestRoute(o._id);

        console.log("路径规划响应数据：", r);

        if (r?.points?.length > 0) {
          console.log("路线规划成功，路径点数量：", r.points.length);
          setRoutePoints(r.points);
          setRouteLoaded(true);

          // 使用后端返回的商家坐标作为中心点
          const centerLng = r.origin.lng;
          const centerLat = r.origin.lat;

          console.log(`地图中心点设置为：lng=${centerLng}, lat=${centerLat}`);
          map.setCenter([centerLng, centerLat]);

          const path = r.points.map(
            (p: any) => new AMap.LngLat(p.lng, p.lat)
          );

          const polyline = new AMap.Polyline({
            path,
            strokeWeight: 5,
            showDir: true,
          });

          map.add(polyline);

          if (!fitViewDone) {
            try {
              map.setFitView([polyline]);
              console.log("地图自动调整视图以适应路径");
            } catch (e) {
              console.error("地图视图调整失败", e);
            }
            setFitViewDone(true);
          }

          // 车辆 marker：起点
          const marker = new AMap.Marker({
            position: path[0],
            icon: "https://webapi.amap.com/theme/v1.3/markers/n/mark_b.png",
            offset: new AMap.Pixel(-13, -30),
          });

          map.add(marker);
          markerRef.current = marker;
          console.log("添加起点标记：", path[0]);
        } else {
          console.error("路径规划数据无效");
          alert("路径规划失败，请检查数据！");
        }
      } catch (err) {
        console.error("获取订单失败", err);
        alert("订单数据加载失败，请稍后重试！");
        navigate("/orders"); // 请求失败时跳转回订单列表
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id]);

  /* ------------------------------------------------------
     WebSocket：实时更新配送信息
  ------------------------------------------------------ */
  useEffect(() => {
    if (!order) return;
    if (order.status !== "配送中") return;
    if (!routeLoaded) return;

    console.log("订单状态为“配送中”，启动 WebSocket 连接");

    const ws = new WebSocket("wss://system-backend.zeabur.app");
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket 连接已打开");
      ws.send(JSON.stringify({ type: "subscribe", orderId: order._id }));
      ws.send(JSON.stringify({ type: "request-current", orderId: order._id }));
    };

    ws.onmessage = (ev) => {
      console.log("接收到 WebSocket 消息：", ev.data);
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch (e) {
        console.error("WebSocket 数据解析失败", e);
        return;
      }

      /* 实时位置 */
      if (msg.type === "location" && msg.position) {
        console.log("实时位置更新：", msg.position);
        markerRef.current?.setPosition(
          new AMap.LngLat(msg.position.lng, msg.position.lat)
        );
        return;
      }

      /* 刷新恢复轨迹 */
      if (msg.type === "current-state") {
        console.log("当前轨迹状态：", msg);
        if (msg.position && markerRef.current) {
          markerRef.current.setPosition(
            new AMap.LngLat(msg.position.lng, msg.position.lat)
          );
        }

        if (msg.index < msg.total - 1) {
          console.log("轨迹尚未播放完，继续播放");
          ws.send(
            JSON.stringify({
              type: "start-track",
              orderId: order._id,
              points: routePoints,
            })
          );
        }
        return;
      }

      /* 没有轨迹 → 重新启动 */
      if (msg.type === "no-track") {
        console.log("未找到轨迹数据，重新启动播放");
        ws.send(
          JSON.stringify({
            type: "start-track",
            orderId: order._id,
            points: routePoints,
          })
        );
      }
    };

    return () => ws.close();
  }, [order?.status, routeLoaded, routePoints]);

  // 处理用户申请退货
  async function handleReturnRequest() {
    if (!order) return;
    try {
      await updateStatus(order._id, "用户申请退货");
      setOrder({ ...order, status: "用户申请退货" }); // 更新订单状态
      alert("已提交退货请求");
    } catch (err) {
      console.error("退货请求失败:", err);
      alert("退货失败，请稍后重试");
    }
  }

  // 处理删除订单
  async function handleDelete() {
    if (!confirm("确认删除订单？")) return;
    await deleteOrder(order._id);
    alert("订单已删除");
    navigate("/orders");
  }

  return (
    <div>
      <h2>订单详情</h2>

      {!order ? (
        <p>加载中...</p>
      ) : (
        <>
          <p><b>ID：</b>{order._id}</p>
          <p><b>商品：</b>{order.title}</p>
          <p><b>价格：</b>¥{order.price}</p>
          <p><b>客户地址：</b>{order.address.detail}</p>
          <p><b>状态：</b>{order.status}</p>

          {/* 用户可以申请退货 */}
          {order.status === "配送中" && (
            <button onClick={handleReturnRequest} style={{ background: "#ff4d4d", padding: "8px 18px", color: "#fff" }}>
              申请退货
            </button>
          )}

          {/* 送达后可以删除订单 */}
          {order.status === "已送达" && (
            <button onClick={handleDelete} style={{ background: "#4caf50", padding: "8px 18px", color: "#fff" }}>
              删除订单
            </button>
          )}

          {/* 显示地图 */}
          <div
            ref={mapRef}
            style={{
              height: 420,
              marginTop: 16,
              borderRadius: 8,
              border: "1px solid #eee",
            }}
          />

          <Link to="/orders" style={{ color: "#1677ff" }}>
            ← 返回我的订单
          </Link>
        </>
      )}
    </div>
  );
}
