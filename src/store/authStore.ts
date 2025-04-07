
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getCurrentUser, login, logout, createAccount } from '@/lib/appwrite';

interface User {
  $id: string;
  name: string;
  email: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  error: string | null;
  setError: (error: string | null) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: true,
      isAuthenticated: false,
      error: null,
      
      login: async (email: string, password: string) => {
        try {
          set({ isLoading: true, error: null });
          await login(email, password);
          const user = await getCurrentUser();
          set({ 
            user, 
            isAuthenticated: !!user, 
            isLoading: false 
          });
        } catch (error: any) {
          set({ 
            isLoading: false, 
            error: error.message || 'Login failed'
          });
          throw error;
        }
      },
      
      signup: async (email: string, password: string, name: string) => {
        try {
          set({ isLoading: true, error: null });
          await createAccount(email, password, name);
          const user = await getCurrentUser();
          set({ 
            user, 
            isAuthenticated: !!user, 
            isLoading: false 
          });
        } catch (error: any) {
          set({ 
            isLoading: false, 
            error: error.message || 'Signup failed'
          });
          throw error;
        }
      },
      
      logout: async () => {
        try {
          set({ isLoading: true });
          await logout();
          set({ 
            user: null, 
            isAuthenticated: false, 
            isLoading: false 
          });
        } catch (error: any) {
          set({ 
            isLoading: false, 
            error: error.message || 'Logout failed'
          });
        }
      },
      
      checkAuth: async () => {
        try {
          set({ isLoading: true });
          const user = await getCurrentUser();
          set({ 
            user, 
            isAuthenticated: !!user, 
            isLoading: false 
          });
        } catch (error) {
          set({ 
            user: null, 
            isAuthenticated: false, 
            isLoading: false 
          });
        }
      },
      
      setError: (error) => set({ error })
    }),
    {
      name: 'momcare-auth',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);
