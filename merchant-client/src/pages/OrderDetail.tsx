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
      // 注意：把返回的 order 强制为 any，避免 TS 报 o.routePoints 不存在的错误
      const o: any = await fetchOrder(id);
      if (!mounted) return;

      // 如果后端 routePoints/eta 已存在，我们把 eta 转成一个到达时间（ms）
      let enhancedOrder = { ...o };
      if (typeof o.eta === "number") {
        const arrivalTime = Date.now() + o.eta * 1000; // eta 是秒
        enhancedOrder.etaArrivalTime = arrivalTime;
        setEtaText(formatRemainingETA(arrivalTime));
      } else if (o.expectedArrival) {
        // 如果后端意外返回 expectedArrival（依旧兼容）
        enhancedOrder.etaArrivalTime = new Date(o.expectedArrival).getTime();
        setEtaText(formatRemainingETA(enhancedOrder.etaArrivalTime));
      } else {
        // 没有任何 ETA 信息则显示 --
        setEtaText("--");
      }

      setOrder(enhancedOrder);

      // 等待地图容器渲染
      await new Promise<void>((resolve) => {
        const wait = () => (mapRef.current ? resolve() : requestAnimationFrame(wait));
        wait();
      });

      const map =
        mapInstanceRef.current ||
        new AMap.Map(mapRef.current!, { zoom: 14 });
      mapInstanceRef.current = map;

      // ---- 不再请求后端路线，直接使用 o.routePoints（安全校验） ----
      if (Array.isArray(o.routePoints) && o.routePoints.length > 0) {
        const path = o.routePoints.map((p: any) => new AMap.LngLat(p.lng, p.lat));

        const polyline = new AMap.Polyline({
          path,
          strokeWeight: 5,
          showDir: true,
        });
        map.add(polyline);

        map.setFitView([polyline]);

        // ----- 小车 marker -----
        let startPos = path[0];           // 默认起点
        let endPos = path[path.length - 1]; // 终点

        if (markerRef.current) {
          markerRef.current.setMap(null);
        }

        const marker = new AMap.Marker({
          position: o.status === "已送达" ? endPos : startPos,
          icon: "https://webapi.amap.com/theme/v1.3/markers/n/mark_b.png",
          offset: new AMap.Pixel(-13, -30),
        });
        map.add(marker);
        markerRef.current = marker;
      } else {
        // 如果没有 routePoints，可选：把地图中心设置到订单 origin 或目标（若后端提供）
        if (o.origin?.lng && o.origin?.lat) {
          map.setCenter([o.origin.lng, o.origin.lat]);
        } else if (o.address?.lng && o.address?.lat) {
          map.setCenter([o.address.lng, o.address.lat]);
        }
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

      // 仅处理位置更新消息：设置 marker 位置
      if (msg.type === "location" && msg.position) {
        markerRef.current?.setPosition(
          new AMap.LngLat(msg.position.lng, msg.position.lat)
        );
      }
    };

    return () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    };
  }, [order?.status]);

  /* ------------------------ ETA 刷新（基于 etaArrivalTime） ------------------------ */
  useEffect(() => {
    if (!order?.etaArrivalTime) return;

    const updateETA = () => {
      setEtaText(formatRemainingETA(order.etaArrivalTime));
    };

    updateETA();
    const timer = setInterval(updateETA, 60 * 1000); // 每分钟刷新
    return () => clearInterval(timer);
  }, [order?.etaArrivalTime]);

  /* ------------------------ 商家操作 ------------------------ */
  async function handleShip() {
    try {
      const updated = await shipOrder(order._id);
      // 发货后后端应该返回带有 routePoints / eta 等的 order，所以把它 set 回去
      setOrder(updated);
      alert("🚚 已发货！");
    } catch (err) {
      console.error("ship failed:", err);
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
          <p><b>地址：</b>{order.address?.detail}</p>
          <p><b>状态：</b>{order.status}</p>

          {/* 显示基于 eta 计算出的剩余时间（如果有） */}
          {order.etaArrivalTime && (
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
