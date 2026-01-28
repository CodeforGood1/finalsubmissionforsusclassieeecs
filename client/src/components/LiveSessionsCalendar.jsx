import React, { useState, useEffect, useCallback } from 'react';
import API_BASE_URL from '../config/api';

function LiveSessionsCalendar({ userType = 'student' }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'calendar'
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedSession, setSelectedSession] = useState(null);

  const token = localStorage.getItem('token');

  const fetchSessions = useCallback(async () => {
    if (!token) return;
    
    try {
      const endpoint = userType === 'teacher' 
        ? `${API_BASE_URL}/api/teacher/live-sessions`
        : `${API_BASE_URL}/api/student/live-sessions`;
        
      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch (err) {
      console.error('Failed to fetch live sessions:', err);
    } finally {
      setLoading(false);
    }
  }, [token, userType]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Get upcoming sessions (next 7 days)
  const getUpcomingSessions = () => {
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return sessions.filter(s => {
      const sessionDate = new Date(s.scheduled_time);
      return sessionDate >= now && sessionDate <= weekFromNow;
    });
  };

  // Get sessions for a specific date
  const getSessionsForDate = (date) => {
    return sessions.filter(s => {
      const sessionDate = new Date(s.scheduled_time);
      return sessionDate.toDateString() === date.toDateString();
    });
  };

  // Generate calendar days for current month
  const getCalendarDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPadding = firstDay.getDay();
    const days = [];

    // Add padding for days before the month starts
    for (let i = 0; i < startPadding; i++) {
      days.push(null);
    }

    // Add all days of the month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i));
    }

    return days;
  };

  const formatTime = (dateString) => {
    return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const isSessionLive = (session) => {
    const now = new Date();
    const start = new Date(session.scheduled_time);
    const end = new Date(start.getTime() + (session.duration || 60) * 60 * 1000);
    return now >= start && now <= end;
  };

  const isSessionUpcoming = (session) => {
    const now = new Date();
    const start = new Date(session.scheduled_time);
    const timeDiff = start.getTime() - now.getTime();
    return timeDiff > 0 && timeDiff <= 15 * 60 * 1000; // Within 15 minutes
  };

  const joinSession = (session) => {
    window.open(session.meeting_url, '_blank');
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-slate-200">
        <div className="animate-pulse flex space-x-4">
          <div className="flex-1 space-y-4 py-1">
            <div className="h-4 bg-slate-200 rounded w-3/4"></div>
            <div className="h-4 bg-slate-200 rounded w-1/2"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="font-bold text-lg">Live Sessions</h3>
            <p className="text-indigo-200 text-sm">{sessions.length} scheduled session{sessions.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'list' ? 'bg-white text-indigo-600' : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              List
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'calendar' ? 'bg-white text-indigo-600' : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              Calendar
            </button>
          </div>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-slate-500 font-medium">No live sessions scheduled</p>
          <p className="text-slate-400 text-sm mt-1">
            {userType === 'teacher' ? 'Create a module with a live video step to schedule sessions' : 'Check back later for upcoming live classes'}
          </p>
        </div>
      ) : viewMode === 'list' ? (
        /* List View */
        <div className="divide-y divide-slate-100">
          {/* Upcoming Sessions Alert */}
          {getUpcomingSessions().length > 0 && (
            <div className="p-4 bg-amber-50 border-b border-amber-100">
              <p className="text-xs font-bold text-amber-700 uppercase mb-2">Coming Up This Week</p>
              <div className="space-y-2">
                {getUpcomingSessions().slice(0, 3).map(session => (
                  <div key={session.id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-amber-200">
                    <div>
                      <p className="font-bold text-slate-800 text-sm">{session.step_title || session.topic}</p>
                      <p className="text-xs text-slate-500">{formatDate(session.scheduled_time)} at {formatTime(session.scheduled_time)}</p>
                    </div>
                    {isSessionLive(session) ? (
                      <button
                        onClick={() => joinSession(session)}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-bold animate-pulse hover:bg-red-700"
                      >
                        JOIN NOW
                      </button>
                    ) : isSessionUpcoming(session) ? (
                      <button
                        onClick={() => joinSession(session)}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700"
                      >
                        Starting Soon
                      </button>
                    ) : (
                      <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold">
                        {formatDate(session.scheduled_time)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All Sessions */}
          <div className="max-h-[400px] overflow-y-auto">
            {sessions.map(session => (
              <div 
                key={session.id} 
                className="p-4 hover:bg-slate-50 transition-colors cursor-pointer"
                onClick={() => setSelectedSession(session)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {isSessionLive(session) && (
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-bold uppercase animate-pulse">
                          LIVE
                        </span>
                      )}
                      <h4 className="font-bold text-slate-800">{session.step_title || session.topic}</h4>
                    </div>
                    <p className="text-xs text-slate-500 mb-2">{session.topic} • {session.section}</p>
                    <div className="flex items-center gap-4 text-xs text-slate-400">
                      <span>{formatDate(session.scheduled_time)}</span>
                      <span>{formatTime(session.scheduled_time)}</span>
                      <span>{session.duration}min</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); joinSession(session); }}
                    disabled={!isSessionLive(session) && !isSessionUpcoming(session)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      isSessionLive(session)
                        ? 'bg-red-600 text-white hover:bg-red-700 animate-pulse'
                        : isSessionUpcoming(session)
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    {isSessionLive(session) ? 'Join Live' : isSessionUpcoming(session) ? 'Join' : 'Not Started'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Calendar View */
        <div className="p-4">
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              ←
            </button>
            <h4 className="font-bold text-slate-800">
              {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
            </h4>
            <button
              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              →
            </button>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-xs font-bold text-slate-400 py-2">{day}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {getCalendarDays().map((day, idx) => {
              if (!day) return <div key={idx} className="p-2" />;
              const daySessions = getSessionsForDate(day);
              const isToday = day.toDateString() === new Date().toDateString();
              
              return (
                <div
                  key={idx}
                  className={`p-2 min-h-[60px] rounded-lg border transition-all ${
                    isToday ? 'bg-indigo-50 border-indigo-300' : 
                    daySessions.length > 0 ? 'bg-purple-50 border-purple-200 cursor-pointer hover:border-purple-400' : 
                    'border-transparent hover:bg-slate-50'
                  }`}
                  onClick={() => daySessions.length > 0 && setSelectedSession(daySessions[0])}
                >
                  <div className={`text-xs font-bold ${isToday ? 'text-indigo-600' : 'text-slate-600'}`}>
                    {day.getDate()}
                  </div>
                  {daySessions.length > 0 && (
                    <div className="mt-1">
                      <div className="w-2 h-2 bg-purple-500 rounded-full mx-auto" />
                      <p className="text-[8px] text-purple-600 font-bold truncate mt-1">
                        {daySessions.length} session{daySessions.length > 1 ? 's' : ''}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Session Detail Modal */}
      {selectedSession && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedSession(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-bold text-xl text-slate-800">{selectedSession.step_title || selectedSession.topic}</h3>
                <p className="text-slate-500 text-sm">{selectedSession.topic}</p>
              </div>
              <button onClick={() => setSelectedSession(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            
            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                <span className="text-2xl text-slate-600">D</span>
                <div>
                  <p className="text-xs text-slate-400 font-bold uppercase">Date & Time</p>
                  <p className="font-bold text-slate-800">{formatDate(selectedSession.scheduled_time)} at {formatTime(selectedSession.scheduled_time)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                <span className="text-2xl text-slate-600">T</span>
                <div>
                  <p className="text-xs text-slate-400 font-bold uppercase">Duration</p>
                  <p className="font-bold text-slate-800">{selectedSession.duration} minutes</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                <span className="text-2xl text-slate-600">S</span>
                <div>
                  <p className="text-xs text-slate-400 font-bold uppercase">Section</p>
                  <p className="font-bold text-slate-800">{selectedSession.section} - {selectedSession.subject}</p>
                </div>
              </div>
            </div>
            
            <button
              onClick={() => joinSession(selectedSession)}
              className={`w-full py-4 rounded-xl font-bold text-white transition-all ${
                isSessionLive(selectedSession)
                  ? 'bg-red-600 hover:bg-red-700 animate-pulse'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {isSessionLive(selectedSession) ? 'LIVE - Join Session Now' : 'Open Meeting Room'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default LiveSessionsCalendar;
