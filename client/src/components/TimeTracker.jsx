import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import API_BASE_URL from '../config/api';

// Eye strain prevention: recommend break after 25 minutes (Pomodoro technique)
const BREAK_INTERVAL_MINUTES = 25;
const BREAK_DURATION_MINUTES = 5;
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

function TimeTracker() {
  // Retrieve persisted session time from localStorage
  const getPersistedSessionTime = () => {
    const stored = localStorage.getItem('sessionStartTime');
    const storedSessionTime = localStorage.getItem('currentSessionTime');
    if (stored && storedSessionTime) {
      const elapsed = Math.floor((Date.now() - parseInt(stored)) / 1000);
      // If less than 30 minutes since last activity, restore session time
      if (elapsed < 30 * 60) {
        return parseInt(storedSessionTime) || 0;
      }
    }
    return 0;
  };

  const [sessionTime, setSessionTime] = useState(getPersistedSessionTime); // seconds since session start
  const [totalDailyTime, setTotalDailyTime] = useState(0); // seconds from database for today
  const [showBreakReminder, setShowBreakReminder] = useState(false);
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [breakTimeLeft, setBreakTimeLeft] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState(Date.now());
  const [lastActivityTime, setLastActivityTime] = useState(Date.now());
  const [isActive, setIsActive] = useState(true);

  const token = localStorage.getItem('token');
  const navigate = useNavigate();
  const location = useLocation();

  // Persist session time to localStorage whenever it changes
  useEffect(() => {
    if (sessionTime > 0) {
      localStorage.setItem('currentSessionTime', sessionTime.toString());
      localStorage.setItem('sessionStartTime', (Date.now() - sessionTime * 1000).toString());
    }
  }, [sessionTime]);

  // Check if on video page (exempt from auto-logout)
  const isOnVideoPage = location.pathname.includes('/learning/') || 
                        location.pathname.includes('/video');

  // Handle user activity (mouse, keyboard, scroll)
  useEffect(() => {
    const updateActivity = () => {
      setLastActivityTime(Date.now());
      if (!isActive) {
        setIsActive(true);
      }
    };

    // Activity event listeners
    window.addEventListener('mousemove', updateActivity);
    window.addEventListener('keydown', updateActivity);
    window.addEventListener('scroll', updateActivity);
    window.addEventListener('click', updateActivity);
    window.addEventListener('touchstart', updateActivity);

    return () => {
      window.removeEventListener('mousemove', updateActivity);
      window.removeEventListener('keydown', updateActivity);
      window.removeEventListener('scroll', updateActivity);
      window.removeEventListener('click', updateActivity);
      window.removeEventListener('touchstart', updateActivity);
    };
  }, [isActive]);

  // Check for inactivity and auto-logout
  useEffect(() => {
    if (!token || isOnVideoPage) return; // Don't auto-logout on video page

    const inactivityCheckInterval = setInterval(() => {
      const timeSinceActivity = Date.now() - lastActivityTime;
      
      if (timeSinceActivity >= INACTIVITY_TIMEOUT_MS) {
        // User inactive for 10 minutes - pause timer and logout
        console.log('User inactive for 10 minutes - logging out');
        setIsActive(false);
        
        // Save final time before logout
        if (sessionTime > 0) {
          fetch(`${API_BASE_URL}/api/student/update-time`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ seconds: sessionTime })
          }).catch(err => console.error('Final time update error:', err));
        }
        
        // Clear token and redirect to login
        localStorage.removeItem('token');
        localStorage.removeItem('userRole');
        localStorage.removeItem('user_role');
        localStorage.removeItem('user_data');
        navigate('/', { state: { message: 'Logged out due to inactivity' } });
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(inactivityCheckInterval);
  }, [token, lastActivityTime, sessionTime, navigate, isOnVideoPage]);

  // Check for midnight reset
  useEffect(() => {
    if (!token) return;

    const checkMidnightReset = () => {
      const now = new Date();
      const lastDate = localStorage.getItem('lastStudyDate');
      const today = now.toDateString();

      if (lastDate && lastDate !== today) {
        // New day detected - reset daily time
        console.log('Midnight passed - resetting daily time');
        setTotalDailyTime(0);
        setSessionTime(0);
        localStorage.setItem('lastStudyDate', today);
        
        // Reload today's time from database
        fetch(`${API_BASE_URL}/api/student/daily-time`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(data => setTotalDailyTime(data.total_seconds || 0))
        .catch(err => console.error('Daily time reload error:', err));
      } else if (!lastDate) {
        localStorage.setItem('lastStudyDate', today);
      }
    };

    // Check immediately
    checkMidnightReset();

    // Check every minute
    const midnightInterval = setInterval(checkMidnightReset, 60000);

    return () => clearInterval(midnightInterval);
  }, [token]);

  // Initialize session and load daily time on mount
  useEffect(() => {
    if (!token) return;
    
    const initSession = async () => {
      try {
        // Start new session
        await fetch(`${API_BASE_URL}/api/student/start-session`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        // Load today's total time
        const timeRes = await fetch(`${API_BASE_URL}/api/student/daily-time`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (timeRes.ok) {
          const timeData = await timeRes.json();
          setTotalDailyTime(timeData.total_seconds || 0);
        }
      } catch (err) {
        console.error('Session init error:', err);
      }
    };
    
    initSession();
  }, [token]);

  // Session timer with database sync (only runs when user is active)
  useEffect(() => {
    if (isOnBreak || !token || !isActive) return;
    
    const interval = setInterval(async () => {
      setSessionTime(prev => {
        const newTime = prev + 1;
        
        // Check if break reminder should show (every 25 minutes)
        if (newTime > 0 && newTime % (BREAK_INTERVAL_MINUTES * 60) === 0) {
          setShowBreakReminder(true);
        }
        
        return newTime;
      });
      
      setTotalDailyTime(prev => prev + 1);
      
      // Update database every 30 seconds
      const now = Date.now();
      if (now - lastUpdateTime >= 30000) {
        try {
          await fetch(`${API_BASE_URL}/api/student/update-time`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ seconds: 30 })
          });
          setLastUpdateTime(now);
        } catch (err) {
          console.error('Time update error:', err);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isOnBreak, token, isActive]);

  // Break timer
  useEffect(() => {
    if (!isOnBreak || breakTimeLeft <= 0) return;
    
    const interval = setInterval(() => {
      setBreakTimeLeft(prev => {
        if (prev <= 1) {
          setIsOnBreak(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOnBreak, breakTimeLeft]);

  const formatTime = useCallback((seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) {
      return `${hrs}h ${mins}m ${secs}s`;
    }
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  }, []);

  const formatTimeCompact = useCallback((seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }, []);
  
  // Save session data before window close
  useEffect(() => {
    const handleBeforeUnload = async () => {
      if (sessionTime > 0 && token) {
        try {
          await fetch(`${API_BASE_URL}/api/student/update-time`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ seconds: sessionTime })
          });
        } catch (err) {
          console.error('Final time update error:', err);
        }
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [sessionTime, token]);

  const startBreak = () => {
    setShowBreakReminder(false);
    setIsOnBreak(true);
    setBreakTimeLeft(BREAK_DURATION_MINUTES * 60);
  };

  const skipBreak = () => {
    setShowBreakReminder(false);
  };

  const endBreak = () => {
    setIsOnBreak(false);
    setBreakTimeLeft(0);
  };

  if (isMinimized) {
    return (
      <button 
        onClick={() => setIsMinimized(false)}
        className={`fixed bottom-4 right-4 z-40 ${!isActive ? 'bg-slate-400' : 'bg-slate-900'} text-white px-4 py-2 rounded-full text-xs font-bold shadow-lg hover:bg-emerald-600 transition-colors`}
      >
        {!isActive && '⏸ '}
        {formatTimeCompact(totalDailyTime)}
      </button>
    );
  }

  return (
    <>
      {/* Time Tracker Widget */}
      <div className={`fixed bottom-4 right-4 z-40 bg-white rounded-2xl shadow-xl border ${!isActive ? 'border-amber-300' : 'border-slate-100'} p-4 w-56`}>
        <div className="flex justify-between items-center mb-3">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
            {!isActive ? '⏸ Paused' : 'Study Time'}
          </span>
          <button 
            onClick={() => setIsMinimized(true)}
            className="text-slate-300 hover:text-slate-600 text-xs"
          >
            -
          </button>
        </div>
        
        {!isActive && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 mb-3">
            <p className="text-[8px] text-amber-700 font-bold uppercase">Inactive</p>
            <p className="text-[9px] text-amber-600 mt-1">Move mouse to resume tracking</p>
          </div>
        )}
        
        {isOnBreak ? (
          <div className="text-center">
            <p className="text-2xl font-black text-emerald-600">{formatTime(breakTimeLeft)}</p>
            <p className="text-[10px] text-slate-500 uppercase font-bold mt-1">Break Time</p>
            <p className="text-[9px] text-slate-400 mt-2">Rest your eyes, look away from screen</p>
            <button 
              onClick={endBreak}
              className="mt-3 text-[9px] font-bold text-slate-400 hover:text-slate-600 uppercase"
            >
              End Break Early
            </button>
          </div>
        ) : (
          <>
            <div className="text-center mb-3">
              <p className="text-2xl font-black text-emerald-600">{formatTimeCompact(totalDailyTime)}</p>
              <p className="text-[10px] text-slate-400 uppercase font-bold">Daily Study Time</p>
            </div>
            
            <div className="border-t border-slate-100 pt-3">
              <div className="flex justify-between items-center">
                <span className="text-[9px] text-slate-400 uppercase font-bold">Session</span>
                <span className="text-sm font-bold text-slate-600">{formatTime(sessionTime)}</span>
              </div>
            </div>
            
            {/* Progress to next break */}
            <div className="mt-3">
              <div className="flex justify-between text-[9px] text-slate-400 mb-1">
                <span>Next break in</span>
                <span>{Math.max(0, BREAK_INTERVAL_MINUTES - Math.floor((sessionTime % (BREAK_INTERVAL_MINUTES * 60)) / 60))} min</span>
              </div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 transition-all duration-1000"
                  style={{ width: `${Math.min(100, ((sessionTime % (BREAK_INTERVAL_MINUTES * 60)) / (BREAK_INTERVAL_MINUTES * 60)) * 100)}%` }}
                ></div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Break Reminder Modal */}
      {showBreakReminder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md px-4">
          <div className="w-full max-w-sm rounded-[2.5rem] bg-white p-10 shadow-2xl border border-slate-100 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </div>
            
            <h3 className="text-xl font-black uppercase italic tracking-tighter mb-2">
              Time for a <span className="text-emerald-500">Break</span>
            </h3>
            <p className="text-sm text-slate-500 mb-6">
              You've been studying for {BREAK_INTERVAL_MINUTES} minutes. 
              Take a {BREAK_DURATION_MINUTES}-minute break to rest your eyes.
            </p>
            
            <div className="bg-slate-50 rounded-2xl p-4 mb-6 text-left">
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Eye Care Tips</p>
              <ul className="text-xs text-slate-600 space-y-1">
                <li>- Look at something 20 feet away</li>
                <li>- Blink frequently to moisturize eyes</li>
                <li>- Stretch your neck and shoulders</li>
                <li>- Get some water</li>
              </ul>
            </div>
            
            <div className="flex gap-3">
              <button 
                onClick={skipBreak}
                className="flex-1 rounded-xl border border-slate-200 py-3 font-bold text-slate-500 text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all"
              >
                Skip
              </button>
              <button 
                onClick={startBreak}
                className="flex-1 rounded-xl bg-emerald-600 py-3 font-black text-white text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all"
              >
                Start Break
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default TimeTracker;
