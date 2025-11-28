import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Orders from "./pages/Orders";
import OrderDetail from "./pages/OrderDetail";

export default function App() {
  return (
    <Routes>
      {/* 登录 & 注册 */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* 默认跳转 */}
      <Route path="/" element={<Navigate to="/orders" replace />} />

      {/* 商家功能 */}
      <Route path="/orders" element={<Orders />} />
      <Route path="/orders/:id" element={<OrderDetail />} />

    </Routes>
  );
}
