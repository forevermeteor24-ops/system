import React, { useEffect, useState } from "react";
import * as echarts from "echarts";

// ----------- 类型定义 -----------
type HeatPoint = [number, number, number]; // x, y, value

type DeliveryStats = {
  avgDeliveryTime: number;
  totalDelivered: number;
};

type AbnormalOrder = {
  _id: string;
  title: string;
  eta: number;
};

// ----------- 组件主体 -----------

export default function Dashboard() {

  const [heatmap, setHeatmap] = useState<HeatPoint[]>([]);
  const [deliveryStats, setDeliveryStats] = useState<DeliveryStats | null>(null);
  const [abnormalOrders, setAbnormalOrders] = useState<AbnormalOrder[]>([]);

  // ----------- 获取数据 -----------
  useEffect(() => {
    const token = localStorage.getItem("token")!;

    fetch("/api/dashboard/heatmap", { headers: { Authorization: token } })
      .then(r => r.json())
      .then(d => setHeatmap(d.points));

    fetch("/api/dashboard/delivery-stats", { headers: { Authorization: token } })
      .then(r => r.json())
      .then(d => setDeliveryStats(d));

    fetch("/api/dashboard/abnormal-orders", { headers: { Authorization: token } })
      .then(r => r.json())
      .then(d => setAbnormalOrders(d.abnormal));
  }, []);

  // ----------- 渲染热力图（你截图中的代码） -----------
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
