import React, { useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";

import Login from "./pages/Login";
import Register from "./pages/Register";

import CreateOrder from "./pages/CreateOrder";
import MyOrders from "./pages/MyOrders";
import OrderDetail from "./pages/OrderDetail";
import UserTrack from "./pages/UserTrack";
import UserProfile from "./pages/UserProfile";

/* -------------------------
   是否已登录
------------------------- */
function isAuthed() {
  return !!localStorage.getItem("token");
}

/* -------------------------
   强制每次访问域名时必须重新登录
   只有进入 /login 与 /register 不清除 token
------------------------- */
function ForceLogin({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;

    // 非 login/register 页面 → 强制清除 token
    if (!path.startsWith("/login") && !path.startsWith("/register")) {
      localStorage.removeItem("token");
    }
  }, [location.pathname]);

  return <>{children}</>;
}

/* -------------------------
   受保护路由
------------------------- */
function PrivateRoute({ children }: { children: React.ReactNode }) {
  return isAuthed() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
      <ForceLogin>
        <Routes>
          {/* 公共页面 */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* 受保护页面 */}
          <Route
            path="/"
            element={
              <PrivateRoute>
                <MyOrders />
              </PrivateRoute>
            }
          />

          <Route
            path="/create"
            element={
              <PrivateRoute>
                <CreateOrder />
              </PrivateRoute>
            }
          />

          <Route
            path="/orders/:id"
            element={
              <PrivateRoute>
                <OrderDetail />
              </PrivateRoute>
            }
          />

          <Route
            path="/track/:id"
            element={
              <PrivateRoute>
                <UserTrack />
              </PrivateRoute>
            }
          />

          <Route
            path="/profile"
            element={
              <PrivateRoute>
                <UserProfile />
              </PrivateRoute>
            }
          />

          {/* 其它 URL → 首页 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ForceLogin>
  );
}
