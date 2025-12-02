import React, { useEffect, useState } from "react";
import * as echarts from "echarts";

// ----------- 类型定义 -----------
type HeatPoint = [number, number, number];

type DeliveryStats = {
  avgDeliveryTime: number;
  totalDelivered: number;
};

type AbnormalOrder = {
  _id: string;
  title: string;
  eta: number;
};

const BASE = "https://system-backend.zeabur.app";

export default function Dashboard() {
  const [heatmap, setHeatmap] = useState<HeatPoint[]>([]);
  const [deliveryStats, setDeliveryStats] = useState<DeliveryStats | null>(null);
  const [abnormalOrders, setAbnormalOrders] = useState<AbnormalOrder[]>([]);

  // ----------- 获取数据 -----------
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      console.error("Token 不存在，请重新登录！");
      return;
    }

    const headers = {
      Authorization: `Bearer ${token}`
    };

    // Heatmap
    fetch(`${BASE}/api/dashboard/heatmap`, { headers })
      .then(r => r.json())
      .then(d => setHeatmap(d.points || []))
      .catch(err => console.error("加载 heatmap 失败", err));

    // Delivery stats
    fetch(`${BASE}/api/dashboard/delivery-stats`, { headers })
      .then(r => r.json())
      .then(d => setDeliveryStats(d))
      .catch(err => console.error("加载 stats 失败", err));

    // Abnormal orders
    fetch(`${BASE}/api/dashboard/abnormal-orders`, { headers })
      .then(r => r.json())
      .then(d => setAbnormalOrders(d.abnormal || []))
      .catch(err => console.error("加载 abnormal 失败", err));
  }, []);

  // ----------- 渲染热力图 -----------
  useEffect(() => {
    if (!heatmap.length) return;

    const el = document.getElementById("heatmap");
    if (!el) return;

    const chart = echarts.init(el);

    chart.setOption({
      title: { text: "订单区域热力图" },
      visualMap: { min: 0, max: 5, left: "left", bottom: "10%" },
      series: [
        {
          type: "heatmap",
          coordinateSystem: "cartesian2d",
          data: heatmap,
        },
      ],
      xAxis: { type: "value" },
      yAxis: { type: "value" },
    });

    return () => chart.dispose();
  }, [heatmap]);

  return (
    <div style={{ padding: 20 }}>
      <h1>物流数据可视化看板</h1>

      {/* ------------ 热力图区域 ------------ */}
      <div
        id="heatmap"
        style={{ width: "100%", height: 400, marginTop: 30, background: "#fafafa" }}
      ></div>

      {/* ------------ 配送时效 ------------ */}
      <div style={{ marginTop: 50 }}>
        <h2>平均配送时效</h2>
        {deliveryStats ? (
          <p>
            平均配送时长：
            <b>{Math.round(deliveryStats.avgDeliveryTime / 60000)}</b> 分钟
          </p>
        ) : (
          <p>加载中...</p>
        )}
      </div>

      {/* ------------ 异常订单 ------------ */}
      <div style={{ marginTop: 50 }}>
        <h2>异常订单（超时配送）</h2>
        {abnormalOrders.length === 0 && <p>暂无异常订单</p>}

        <ul>
          {abnormalOrders.map(o => (
            <li key={o._id}>
              {o.title} - ETA: {new Date(o.eta).toLocaleTimeString()}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
