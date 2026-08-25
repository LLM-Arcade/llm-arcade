import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import LaunchGate from "@/components/layout/LaunchGate";
import Home from "./pages/Home";
import Games from "./pages/Games";
import GameDetail from "./pages/GameDetail";
import CreatorProfile from "./pages/CreatorProfile";
import Login from "./pages/Login";
import Settings from "./pages/Settings";
import Faq from "./pages/Faq";
import Guides from "./pages/Guides";
import Playtest from "./pages/Playtest";
import Upload from "./pages/Upload";
import MyUploads from "./pages/MyUploads";
import Admin from "./pages/Admin";
import DevGame from "./pages/DevGame";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route
              path="/"
              element={
                <LaunchGate>
                  <Home />
                </LaunchGate>
              }
            />
            {/* Open pre-launch: guests can play; scores require sign-in */}
            <Route path="/games" element={<Games />} />
            <Route path="/game/:slug" element={<GameDetail />} />
            <Route path="/creator/:username" element={<CreatorProfile />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Login />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/faq" element={<Faq />} />
            <Route path="/guides" element={<Guides />} />
            <Route path="/playtest" element={<Playtest />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/uploads" element={<MyUploads />} />
            <Route path="/admin" element={<Admin />} />
            {/* Dev-only playtest route for unlaunched Track-A cabinets */}
            {import.meta.env.DEV && <Route path="/dev/:slug" element={<DevGame />} />}
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
