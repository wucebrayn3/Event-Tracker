import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AuthScreen from "./components/AuthScreen";
import { useAuth } from "./context/AuthContext";
import Dashboard from "./pages/Dashboard";
import EventDetailPage from "./pages/EventDetailPage";

export default function App() {
  const { token } = useAuth();
  if (!token) {
    return <AuthScreen />;
  }
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/events/:id" element={<EventDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
