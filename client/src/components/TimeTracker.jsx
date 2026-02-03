import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import API_BASE_URL from '../config/api';

// Constants
const BREAK_INTERVAL_MS = 25 * 60 * 1000; // 25 minutes
const BREAK_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const SAVE_INTERVAL_MS = 30 * 1000; // Save to server every 30 seconds

// Get user-specific storage key
const getStorageKey = () => {
  const user = localStorage.getItem('user_data');
  if (user) {
    try {
      const userData = JSON.parse(user);
      // Use student ID for storage key
      if (userData.id) {
        return `timetracker_session_${userData.id}`;
      }
    } catch (e) {
      console.warn('[Timer] Failed to parse user data');
    }
  }
  return 'timetracker_session_default';
};

function TimeTracker() {
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [serverDailySeconds, setServerDailySeconds] = useState(0);
  const [showBreakReminder, setShowBreakReminder] = useState(false);
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [breakSecondsLeft, setBreakSecondsLeft] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [ready, setReady] = useState(false);

  const lastActivityRef = useRef(Date.now());
  const lastSavedToServerRef = useRef(0);

  const location = useLocation();
  const token = localStorage.getItem('token');
  const isVideoPage = location.pathname.includes('/learning/') || location.pathname.includes('/video');

  // Get today's date key
  const getTodayKey = () => new Date().toISOString().split('T')[0];

  // Format seconds to HH:MM:SS or MM:SS
  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Save session to localStorage (called every second)
  const saveToLocal = useCallback((seconds) => {
    try {
      // Get fresh key every time
      const key = getStorageKey();
      localStorage.setItem(key, JSON.stringify({
        date: getTodayKey(),
        seconds: seconds,
        ts: Date.now()
      }));
    } catch (e) { /* ignore */ }
  }, []);

  // Load session from localStorage - NOT USED anymore (always start fresh)
  const loadFromLocal = useCallback(() => {
    // Always return 0 - we want fresh start on every login
    return 0;
  }, []);

  // Save time delta to server
  const saveToServer = useCallback(async (currentSeconds) => {
    if (!token) return;
    const delta = currentSeconds - lastSavedToServerRef.current;
    if (delta <= 0) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/student/update-time`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ seconds: delta })
      });
      if (res.ok) {
        lastSavedToServerRef.current = currentSeconds;
      }
    } catch (err) {
      console.error('[Timer] Server save error:', err);
    }
  }, [token]);

  // INIT: Restore from localStorage, fetch server total
  useEffect(() => {
    if (!token) return;

    const init = async () => {
      // 0. Get current user ID first
      const userData = localStorage.getItem('user_data');
      let currentUserId = null;
      let currentStorageKey = 'timetracker_session_default';
      
      try {
        if (userData) {
          const parsed = JSON.parse(userData);
          currentUserId = parsed.id;
          if (currentUserId) {
            currentStorageKey = `timetracker_session_${currentUserId}`;
          }
        }
      } catch (e) {
        console.warn('[Timer] Failed to parse user_data:', e);
      }

      // 1. Clear ALL timer keys to ensure fresh start (prevents cross-user persistence)
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('timetracker_session')) {
          localStorage.removeItem(key);
          console.log('[Timer] Cleared timer data:', key);
        }
      });

      // 2. Always start fresh - no restoration from localStorage
      // (Server data is the source of truth)
      setSessionSeconds(0);
      lastSavedToServerRef.current = 0;
      console.log('[Timer] Starting fresh session for user:', currentUserId);

      // 2. Fetch server daily total
      try {
        const res = await fetch(`${API_BASE_URL}/api/student/daily-time`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setServerDailySeconds(data.total_seconds || 0);
          console.log('[Timer] Server daily total:', data.total_seconds);
        }
      } catch (err) {
        console.error('[Timer] Fetch error:', err);
      }

      setReady(true);
    };

    init();
  }, [token, loadFromLocal]);

  // TICK: Increment session every second, save to localStorage
  useEffect(() => {
    if (!token || !ready || isPaused || isOnBreak) return;

    const interval = setInterval(() => {
      setSessionSeconds(prev => {
        const next = prev + 1;
        saveToLocal(next); // Persist every second
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [token, ready, isPaused, isOnBreak, saveToLocal]);

  // ACTIVITY TRACKING
  useEffect(() => {
    const handleActivity = () => {
      lastActivityRef.current = Date.now();
      if (isPaused) setIsPaused(false);
    };

    const events = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'];
    events.forEach(e => window.addEventListener(e, handleActivity, { passive: true }));
    return () => events.forEach(e => window.removeEventListener(e, handleActivity));
  }, [isPaused]);

  // INACTIVITY CHECK
  useEffect(() => {
    if (!token || !ready || isVideoPage) return;

    const checkInterval = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= INACTIVITY_TIMEOUT_MS && !isPaused) {
        setIsPaused(true);
        saveToServer(sessionSeconds);
      }
    }, 30000);

    return () => clearInterval(checkInterval);
  }, [token, ready, isVideoPage, isPaused, sessionSeconds, saveToServer]);

  // PERIODIC SERVER SAVE
  useEffect(() => {
    if (!token || !ready) return;

    const interval = setInterval(() => {
      if (sessionSeconds > lastSavedToServerRef.current && !isPaused) {
        saveToServer(sessionSeconds);
      }
    }, SAVE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [token, ready, sessionSeconds, isPaused, saveToServer]);

  // BREAK REMINDER
  useEffect(() => {
    const ms = sessionSeconds * 1000;
    if (ms > 0 && ms % BREAK_INTERVAL_MS < 1000 && !isOnBreak && !showBreakReminder) {
      setShowBreakReminder(true);
    }
  }, [sessionSeconds, isOnBreak, showBreakReminder]);

  // BREAK COUNTDOWN
  useEffect(() => {
    if (!isOnBreak || breakSecondsLeft <= 0) return;

    const interval = setInterval(() => {
      setBreakSecondsLeft(prev => {
        if (prev <= 1) {
          setIsOnBreak(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOnBreak, breakSecondsLeft]);

  // SAVE ON PAGE UNLOAD
  useEffect(() => {
    const handleUnload = () => {
      saveToLocal(sessionSeconds);
      // Send remaining to server
      if (sessionSeconds > lastSavedToServerRef.current && token) {
        const delta = sessionSeconds - lastSavedToServerRef.current;
        const blob = new Blob([JSON.stringify({ seconds: delta })], { type: 'application/json' });
        navigator.sendBeacon(`${API_BASE_URL}/api/student/update-time`, blob);
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [sessionSeconds, token, saveToLocal]);

  // Don't render until ready
  if (!token || !ready) return null;

  const startBreak = () => {
    setShowBreakReminder(false);
    setIsOnBreak(true);
    setBreakSecondsLeft(BREAK_DURATION_MS / 1000);
  };

  const skipBreak = () => setShowBreakReminder(false);

  // Total = server daily (already saved) + current session
  // But server daily includes previously saved parts of this session
  // So: total = serverDaily + (session - lastSavedToServer)
  // Actually simpler: server syncs, so just show serverDaily + session unsaved portion
  // Even simpler: total = serverDaily + sessionSeconds (server subtracts duplicates)
  // For display: session is what user sees ticking, daily is serverDaily + session
  const displayTotal = serverDailySeconds + sessionSeconds;

  // MINIMIZED
  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-4 py-2 rounded-full shadow-lg hover:bg-emerald-700 font-bold text-sm"
      >
        ⏱ {formatTime(displayTotal)}
      </button>
    );
  }

  // BREAK REMINDER MODAL
  if (showBreakReminder) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-3xl p-8 max-w-md mx-4 text-center shadow-2xl">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">☕</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Time for a Break!</h2>
          <p className="text-slate-500 mb-6">
            You've been studying for {formatTime(sessionSeconds)}. Rest your eyes for 5 minutes.
          </p>
          <div className="flex gap-3">
            <button onClick={startBreak} className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700">
              Take Break
            </button>
            <button onClick={skipBreak} className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-200">
              Skip
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ON BREAK
  if (isOnBreak) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900">
        <div className="text-center text-white">
          <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-5xl">🌿</span>
          </div>
          <h2 className="text-3xl font-bold mb-2">Break Time</h2>
          <p className="text-slate-400 mb-8">Look away from the screen, stretch, relax</p>
          <p className="text-6xl font-black text-emerald-400 mb-8">{formatTime(breakSecondsLeft)}</p>
          <button onClick={() => setIsOnBreak(false)} className="text-slate-400 hover:text-white text-sm">
            End break early
          </button>
        </div>
      </div>
    );
  }

  // NORMAL TIMER
  return (
    <div className="fixed bottom-6 right-6 z-50 bg-white rounded-2xl shadow-xl border border-slate-200 p-4 min-w-[200px]">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-slate-400 uppercase">Study Timer</span>
        <button onClick={() => setIsMinimized(true)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">
          −
        </button>
      </div>
      
      <div className="text-3xl font-black text-emerald-600 mb-1">
        {formatTime(sessionSeconds)}
      </div>
      
      <div className="text-sm text-slate-500 mb-3">
        Today: <span className="font-bold text-slate-700">{formatTime(displayTotal)}</span>
      </div>

      {isPaused && (
        <div className="text-xs text-amber-600 font-bold mb-2">
          ⏸ Paused (inactive)
        </div>
      )}

      <div className="pt-2 border-t border-slate-100">
        <div className="w-full bg-slate-100 rounded-full h-1.5">
          <div
            className="bg-emerald-500 h-1.5 rounded-full transition-all"
            style={{ width: `${Math.min((sessionSeconds / 1500) * 100, 100)}%` }}
          />
        </div>
        <p className="text-[10px] text-slate-400 mt-1 text-center">
          Break in {formatTime(Math.max(0, 1500 - (sessionSeconds % 1500)))}
        </p>
      </div>
    </div>
  );
}

export default TimeTracker;
