import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import CreateOrder from "./pages/CreateOrder";
import MyOrders from "./pages/MyOrders";
import UserTrack from "./pages/UserTrack";
import OrderDetail from "./pages/OrderDetail"; 

export default function App() {
  const isAuthed = !!localStorage.getItem("token");

  return (
    <BrowserRouter>
      <Routes>
        {/* 未登录跳转 */}
        {!isAuthed && (
          <>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="*" element={<Navigate to="/login" />} />
          </>
        )}

        {/* 登录后可访问的页面 */}
        {isAuthed && (
          <>
            <Route path="/" element={<MyOrders />} />
            <Route path="/create" element={<CreateOrder />} />
            <Route path="/orders/:id" element={<OrderDetail />} />
            <Route path="/track/:id" element={<UserTrack />} />
            <Route path="*" element={<Navigate to="/" />} />
          </>
        )}
      </Routes>
    </BrowserRouter>
  );
}
