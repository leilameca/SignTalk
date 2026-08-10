import React from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { AppProvider, useApp } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Header } from './components/common/Header';
import { BottomNav } from './components/common/BottomNav';
import { SplashScreen } from './components/screens/SplashScreen';
import { CameraTranslatorScreen } from './components/screens/CameraTranslatorScreen';
import { QuickPhrasesScreen } from './components/screens/QuickPhrasesScreen';
import { HistoryScreen } from './components/screens/HistoryScreen';
import { SettingsScreen } from './components/screens/SettingsScreen';
import { DatasetContributionScreen } from './components/screens/DatasetContributionScreen';
import { AdminDatasetScreen } from './components/screens/AdminDatasetScreen';
import { AuthScreen } from './components/screens/AuthScreen';
import { PasswordRecoveryScreen } from './components/screens/PasswordRecoveryScreen';
import { Loader2 } from 'lucide-react';

const MainAppContent: React.FC = () => {
  const { activeTab } = useApp();

  return (
    <div className="flex min-h-screen min-h-dvh w-full min-w-0 max-w-full flex-col overflow-x-hidden bg-white">
      <Header />

      <main className="relative flex w-full min-w-0 max-w-full flex-1 flex-col overflow-x-hidden">
        {activeTab === 'splash' && <SplashScreen />}
        {activeTab === 'translator' && <CameraTranslatorScreen />}
        {activeTab === 'phrases' && <QuickPhrasesScreen />}
        {activeTab === 'history' && <HistoryScreen />}
        {activeTab === 'settings' && <SettingsScreen />}
        {activeTab === 'contribute' && <DatasetContributionScreen />}
        {activeTab === 'admin' && <AdminDatasetScreen />}
      </main>

      <BottomNav />
    </div>
  );
};

const AuthenticatedApp = () => {
  const { user, loading, recoveryMode } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;
  if (recoveryMode) return <PasswordRecoveryScreen />;
  if (!user) return <AuthScreen />;
  return <ThemeProvider><AppProvider><MainAppContent /></AppProvider></ThemeProvider>;
};

export default function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
}
