import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import InvitePage from "./pages/Invite";
import NotFound from "./pages/NotFound";
import AuthDebug from "./pages/debug/AuthDebug";

const queryClient = new QueryClient();
const DEBUG_AUTH = import.meta.env.VITE_DEBUG_AUTH === 'true';

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/invite/:invitationId" element={<InvitePage />} />
          {DEBUG_AUTH && <Route path="/debug/auth" element={<AuthDebug />} />}
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
