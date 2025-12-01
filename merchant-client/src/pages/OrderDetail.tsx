import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  fetchOrder,
  shipOrder,
  updateStatus,
  deleteOrder,
} from "../api/orders";
import { formatRemainingETA } from "../utils/formatETA";

declare const AMap: any;

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [order, setOrder] = useState<any>(null);
  const [etaText, setEtaText] = useState("--");

  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);

  /* ------------------------ 获取订单 & 初始化地图 ------------------------ */
  useEffect(() => {
    if (!id) return;

    let mounted = true;

    (async () => {
      const o = await fetchOrder(id);
      if (!mounted) return;
      setOrder(o);

      if (o.expectedArrival) setEtaText(formatRemainingETA(o.expectedArrival));

      // 地图准备好
      await new Promise<void>((resolve) => {
        const wait = () => (mapRef.current ? resolve() : requestAnimationFrame(wait));
        wait();
      });

      const map =
        mapInstanceRef.current ||
        new AMap.Map(mapRef.current!, { zoom: 14 });
      mapInstanceRef.current = map;

      // ---- 不再请求后端路线，直接使用 o.routePoints ----
      if (o.routePoints?.length > 0) {
        const path = o.routePoints.map(
          (p: any) => new AMap.LngLat(p.lng, p.lat)
        );

        const polyline = new AMap.Polyline({
          path,
          strokeWeight: 5,
          showDir: true,
        });
        map.add(polyline);

        map.setFitView([polyline]);

        // 初始化骑手/小车 marker
        const marker = new AMap.Marker({
          position: path[0],
          icon: "https://webapi.amap.com/theme/v1.3/markers/n/mark_b.png",
          offset: new AMap.Pixel(-13, -30),
        });
        map.add(marker);
        markerRef.current = marker;
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id]);

  /* ------------------------ WebSocket：配送中 ------------------------ */
  useEffect(() => {
    if (!order || order.status !== "配送中") return;

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
      } catch {
        return;
      }

      if (msg.type === "location" && msg.position) {
        markerRef.current?.setPosition(
          new AMap.LngLat(msg.position.lng, msg.position.lat)
        );
      }
    };

    return () => ws.close();
  }, [order?.status]);

  /* ------------------------ ETA 刷新 ------------------------ */
  useEffect(() => {
    if (!order?.expectedArrival) return;
    const updateETA = () =>
      setEtaText(formatRemainingETA(order.expectedArrival));
    updateETA();
    const timer = setInterval(updateETA, 60000);
    return () => clearInterval(timer);
  }, [order?.expectedArrival]);

  /* ------------------------ 商家操作 ------------------------ */
  async function handleShip() {
    try {
      const updated = await shipOrder(order._id);
      setOrder(updated);
      alert("🚚 已发货！");
    } catch {
      alert("发货失败");
    }
  }

  async function handleCancel() {
    if (!confirm("确认取消订单？")) return;
    const updated = await updateStatus(order._id, "商家已取消");
    setOrder(updated);
  }

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
          <p><b>地址：</b>{order.address.detail}</p>
          <p><b>状态：</b>{order.status}</p>

          {order.expectedArrival && (
            <p>
              <b>预计送达：</b>{etaText}
            </p>
          )}

          {order.status === "待发货" && (
            <button onClick={handleShip}>发货</button>
          )}
          {order.status === "用户申请退货" && (
            <button onClick={handleCancel}>取消订单</button>
          )}
          {(order.status === "已完成" || order.status === "商家已取消") && (
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
