import { LogIn, LogOut, User, CloudUpload, UserPlus } from 'lucide-react';
import React, { FC, useState } from 'react';
import { useAuthStore } from '../services/authService';

export const ConnectedUserAccountButton: FC = () => {
  const { user, login, register, logout, syncDataToServer, isLoading, error } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput || !passwordInput) return;

    let success = false;
    if (isRegisterMode) {
      success = await register(usernameInput, passwordInput);
    } else {
      success = await login(usernameInput, passwordInput);
    }

    if (success) {
      setIsOpen(false);
      setUsernameInput('');
      setPasswordInput('');
    }
  };

  const handleManualSync = async () => {
    setSyncStatus('Syncing...');
    await syncDataToServer();
    setSyncStatus('Synced successfully!');
    setTimeout(() => setSyncStatus(null), 3000);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium text-slate-200 transition-colors border border-slate-700/50"
        title={user ? `Logged in as ${user.username}` : 'Login or Register'}
      >
        <User size={16} className={user ? 'text-emerald-400' : 'text-slate-400'} />
        <span>{user ? user.username : 'Login'}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 p-4 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl z-50 text-slate-200 backdrop-blur-md">
          {user ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-lg border border-emerald-500/30">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col">
                  <span className="font-semibold text-slate-100">{user.username}</span>
                  <span className="text-xs text-slate-400">Account Active & Synced</span>
                </div>
              </div>

              {syncStatus && (
                <div className="text-xs px-2.5 py-1 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/40">
                  {syncStatus}
                </div>
              )}

              <button
                onClick={handleManualSync}
                className="flex items-center justify-center gap-2 w-full py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-medium text-slate-200 transition-colors"
              >
                <CloudUpload size={14} />
                Sync Library to Server
              </button>

              <button
                onClick={() => {
                  logout();
                  setIsOpen(false);
                }}
                className="flex items-center justify-center gap-2 w-full py-2 bg-red-950/40 hover:bg-red-900/60 text-red-300 rounded-lg text-xs font-medium border border-red-800/30 transition-colors"
              >
                <LogOut size={14} />
                Log Out
              </button>
            </div>
          ) : (
            <form onSubmit={handleAuthSubmit} className="flex flex-col gap-3">
              <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                <h4 className="font-semibold text-slate-100 text-sm">
                  {isRegisterMode ? 'Create Account' : 'Sign In'}
                </h4>
                <button
                  type="button"
                  onClick={() => setIsRegisterMode(!isRegisterMode)}
                  className="text-xs text-indigo-400 hover:underline"
                >
                  {isRegisterMode ? 'Already have account?' : 'Need account?'}
                </button>
              </div>

              {error && (
                <div className="text-xs px-2.5 py-1.5 rounded bg-red-950/80 text-red-300 border border-red-800/50">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400">Username</label>
                <input
                  type="text"
                  required
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  placeholder="Enter username"
                  className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400">Password</label>
                <input
                  type="password"
                  required
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Enter password"
                  className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="mt-2 flex items-center justify-center gap-2 w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                {isRegisterMode ? <UserPlus size={14} /> : <LogIn size={14} />}
                {isLoading ? 'Processing...' : isRegisterMode ? 'Register' : 'Sign In'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
};
