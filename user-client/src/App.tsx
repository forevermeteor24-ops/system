import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import Register from "./pages/Register";
import CreateOrder from "./pages/CreateOrder";
import MyOrders from "./pages/MyOrders";
import UserTrack from "./pages/UserTrack";
import OrderDetail from "./pages/OrderDetail";

/** 授权保护组件 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("token");
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const [isAuthed, setIsAuthed] = useState(!!localStorage.getItem("token"));

  // 监听 token 变化（登录/登出）
  useEffect(() => {
    const syncAuth = () => {
      setIsAuthed(!!localStorage.getItem("token"));
    };
    window.addEventListener("storage", syncAuth);
    return () => window.removeEventListener("storage", syncAuth);
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        {/* 未登录可访问 */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* 登录后页面（需要 token） */}
        <Route
          path="/"
          element={
            <RequireAuth>
              <MyOrders />
            </RequireAuth>
          }
        />

        <Route
          path="/create"
          element={
            <RequireAuth>
              <CreateOrder />
            </RequireAuth>
          }
        />

        <Route
          path="/orders/:id"
          element={
            <RequireAuth>
              <OrderDetail />
            </RequireAuth>
          }
        />

        <Route
          path="/track/:id"
          element={
            <RequireAuth>
              <UserTrack />
            </RequireAuth>
          }
        />

        {/* 默认：未登录 → /login，已登录 → / */}
        <Route
          path="*"
          element={<Navigate to={isAuthed ? "/" : "/login"} replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}
