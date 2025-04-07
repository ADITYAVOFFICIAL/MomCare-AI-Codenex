
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import { PublicRoute, PrivateRoute } from '@/components/auth/AuthRoute.tsx';

// Pages
import HomePage from "./pages/HomePage";
import Login from "./pages/Login";
import SignUp from "./pages/SignUp";
import ChatPage from "./pages/ChatPage";
import EmergencyPage from "./pages/Emergency";
import AppointmentPage from "./pages/AppointmentPage";
import MedicalDocsPage from "./pages/MedicalDocsPage";
import ResourcesPage from "./pages/ResourcesPage";
import CreateBlogPage from "./pages/CreateBlogPage";
import DashboardPage from "./pages/DashboardPage";
import ProfilePage from "./pages/ProfilePage";
import NotFound from "./pages/NotFound";
import BlogPostPage from '@/pages/BlogPostPage';
import SupportVideoPage from './pages/SupportVideoPage';
const queryClient = new QueryClient();

const App = () => {
  const { checkAuth } = useAuthStore();
  
  // Check authentication status on app load
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/signup" element={<PublicRoute><SignUp /></PublicRoute>} />
            
            {/* Protected routes */}
            <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
            <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
            <Route path="/appointment" element={<PrivateRoute><AppointmentPage /></PrivateRoute>} />
            <Route path="/medicaldocs" element={<PrivateRoute><MedicalDocsPage /></PrivateRoute>} />
            <Route path="/create-blog" element={<PrivateRoute><CreateBlogPage /></PrivateRoute>} />
            <Route path="/sup" element={<PrivateRoute><SupportVideoPage /></PrivateRoute>} />
            
            {/* Public routes that don't need redirects */}
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/emergency" element={<EmergencyPage />} />
            <Route path="/resources" element={<ResourcesPage />} />
            <Route path="/blog/:id" element={<BlogPostPage />} />
            
            {/* 404 Route */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
