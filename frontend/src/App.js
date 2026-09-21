import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/context/AuthContext";
import { ModalProvider } from "@/context/ModalContext";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import WatchlistPage from "@/pages/WatchlistPage";
import MoversPage from "@/pages/MoversPage";
import BrokersPage from "@/pages/BrokersPage";
import ArticlesPage from "@/pages/ArticlesPage";
import ArticlePage from "@/pages/ArticlePage";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <ModalProvider>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="watchlist" element={<WatchlistPage />} />
                <Route path="movers" element={<MoversPage />} />
                <Route path="brokers" element={<BrokersPage />} />
                <Route path="articles" element={<ArticlesPage />} />
                <Route path="articles/:id" element={<ArticlePage />} />
              </Route>
            </Routes>
            <Toaster position="top-right" richColors theme="light" />
          </ModalProvider>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
