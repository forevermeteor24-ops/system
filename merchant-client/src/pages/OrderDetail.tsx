import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  fetchOrder,
  requestRoute,
  shipOrder,
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
      const o = await fetchOrder(id);
      if (!mounted) return;
      setOrder(o);

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

      /* 请求后端路线：后端会根据商家 id 自动查商家地址 */
      const r = await requestRoute(o._id);

      console.log("路径规划响应数据：", r);  // 添加调试信息

      if (r?.points?.length > 0) {
        setRoutePoints(r.points);
        setRouteLoaded(true);

        /** ⭐ 使用后端返回的商家坐标作为中心点，正确无误 */
        const centerLng = r.origin.lng;
        const centerLat = r.origin.lat;

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
          } catch {}
          setFitViewDone(true);
        }

        /** 车辆 marker：起点 */
        const marker = new AMap.Marker({
          position: path[0],
          icon: "https://webapi.amap.com/theme/v1.3/markers/n/mark_b.png",
          offset: new AMap.Pixel(-13, -30),
        });

        map.add(marker);
        markerRef.current = marker;
      } else {
        console.error("路径规划数据无效");  // 如果没有路径数据
        alert("路径规划失败，请检查数据！");
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id]);

  /* ------------------------------------------------------
     WebSocket：只在配送中时启动
  ------------------------------------------------------ */
  useEffect(() => {
    if (!order) return;
    if (order.status !== "配送中") return;
    if (!routeLoaded) return;

    const ws = new WebSocket("wss://system-backend.zeabur.app");
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "subscribe", orderId: order._id }));
      ws.send(JSON.stringify({ type: "request-current", orderId: order._id }));
    };

    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch (e) {
        console.error("WebSocket 数据解析失败", e);
        return;
      }

      /* 实时位置 */
      if (msg.type === "location" && msg.position) {
        markerRef.current?.setPosition(
          new AMap.LngLat(msg.position.lng, msg.position.lat)
        );
        return;
      }

      /* 刷新恢复轨迹 */
      if (msg.type === "current-state") {
        if (msg.position && markerRef.current) {
          markerRef.current.setPosition(
            new AMap.LngLat(msg.position.lng, msg.position.lat)
          );
        }

        if (msg.index < msg.total - 1) {
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

  /* 商家发货 */
  async function handleShip() {
    try {
      const updated = await shipOrder(order._id);
      setOrder(updated);
      alert("🚚 已发货，车辆开始配送！");
    } catch (err: unknown) {
      // 将 err 转换为 Error 类型
      if (err instanceof Error) {
        console.error("发货请求失败:", err);
        alert(`发货失败：${err.message}`);
      } else {
        console.error("未知错误:", err);
        alert("发货失败：未知错误");
      }
    }
    
  }

  /* 商家取消 */
  async function handleCancel() {
    if (!confirm("确认取消订单？")) return;
    const updated = await updateStatus(order._id, "商家已取消");
    setOrder(updated);
  }

  /* 删除订单 */
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

          {order.status === "待发货" && (
            <button onClick={handleShip}>发货</button>
          )}

          {order.status === "用户申请退货" && (
            <button onClick={handleCancel}>取消订单</button>
          )}

          {(order.status === "已送达" || order.status === "商家已取消") && (
            <button onClick={handleDelete}>删除订单</button>
          )}

          <div
            ref={mapRef}
            style={{
              height: 420,
              marginTop: 16,
              borderRadius: 8,
              border: "1px solid #eee",
            }}
          />
        </>
      )}
    </div>
  );
}
