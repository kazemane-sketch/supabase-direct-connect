import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { CompanyProvider } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Movimenti from "./pages/Movimenti";
import Fatture from "./pages/Fatture";
import Controparti from "./pages/Controparti";
import Scadenzario from "./pages/Scadenzario";
import Riconciliazione from "./pages/Riconciliazione";
import Cashflow from "./pages/Cashflow";
import Analisi from "./pages/Analisi";
import Impostazioni from "./pages/Impostazioni";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoutes() {
  return (
    <CompanyProvider>
      <AppLayout>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/movimenti" element={<Movimenti />} />
          <Route path="/fatture" element={<Fatture />} />
          <Route path="/controparti" element={<Controparti />} />
          <Route path="/scadenzario" element={<Scadenzario />} />
          <Route path="/riconciliazione" element={<Riconciliazione />} />
          <Route path="/cashflow" element={<Cashflow />} />
          <Route path="/analisi" element={<Analisi />} />
          <Route path="/impostazioni" element={<Impostazioni />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AppLayout>
    </CompanyProvider>
  );
}

function AuthRoute() {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (session) return <Navigate to="/" replace />;
  return <Auth />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<AuthRoute />} />
          <Route path="/*" element={<ProtectedRoutes />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;