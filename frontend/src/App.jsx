import AuthScreen from "./components/AuthScreen";
import { useAuth } from "./context/AuthContext";
import Dashboard from "./pages/Dashboard";

export default function App() {
  const { token } = useAuth();
  if (!token) {
    return <AuthScreen />;
  }
  return <Dashboard />;
}
