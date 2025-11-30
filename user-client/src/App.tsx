import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import MyOrders from "./pages/MyOrders";
import OrderDetail from "./pages/OrderDetail";
import UserProfile from "./pages/UserProfile";

/* 是否已登录 */
function isAuthed() {
  return !!localStorage.getItem("token");
}

/* 登录保护 */
function PrivateRoute({ element }: { element: React.ReactNode }) {
  return isAuthed() ? <>{element}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      {/* 公共页面 */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* 受保护页面 */}
      <Route
        path="/"
        element={<PrivateRoute element={<MyOrders />} />}
      />

      {/* 订单详情 */}
      <Route
        path="/orders/:id"
        element={<PrivateRoute element={<OrderDetail />} />}
      />

      {/* 用户个人资料 */}
      <Route
        path="/profile"
        element={<PrivateRoute element={<UserProfile />} />}
      />

      {/* 其他所有路由会重定向到首页 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
