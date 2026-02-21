import React, { useEffect, useRef, useState } from 'react';

// LOCAL Jitsi server - fully offline, no external connections
const JITSI_DOMAIN = 'localhost:8443';
const JITSI_URL = 'https://localhost:8443';

function JitsiMeet({ roomName, displayName, onClose, isTeacher = false }) {
  const containerRef = useRef(null);
  const apiRef = useRef(null);
  const [status, setStatus] = useState('loading'); // loading, connected, error
  const [errorMsg, setErrorMsg] = useState('');

  // Clean room name for URL safety
  const cleanRoom = (roomName || 'classroom')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .substring(0, 50) || 'classroom';

  const userName = displayName || (isTeacher ? 'Teacher' : 'Student');

  useEffect(() => {
    let mounted = true;
    let scriptElement = null;

    const loadExternalAPI = () => {
      return new Promise((resolve, reject) => {
        // Already loaded?
        if (window.JitsiMeetExternalAPI) {
          resolve(window.JitsiMeetExternalAPI);
          return;
        }

        // Load from local Jitsi server
        scriptElement = document.createElement('script');
        scriptElement.src = `${JITSI_URL}/external_api.js`;
        scriptElement.async = true;
        
        scriptElement.onload = () => {
          if (window.JitsiMeetExternalAPI) {
            resolve(window.JitsiMeetExternalAPI);
          } else {
            reject(new Error('Jitsi API not available'));
          }
        };
        
        scriptElement.onerror = () => reject(new Error('Failed to load Jitsi script'));
        document.head.appendChild(scriptElement);
        
        // 15 second timeout
        setTimeout(() => reject(new Error('Jitsi load timeout')), 15000);
      });
    };

    const initJitsi = async () => {
      try {
        const JitsiAPI = await loadExternalAPI();
        
        if (!mounted || !containerRef.current) return;

        const options = {
          roomName: cleanRoom,
          parentNode: containerRef.current,
          width: '100%',
          height: 550,
          configOverwrite: {
            startWithAudioMuted: true,
            startWithVideoMuted: true,
            prejoinPageEnabled: false,
            disableDeepLinking: true,
            p2p: { enabled: true },
            // Disable external requests for offline mode
            analytics: { disabled: true },
            callStatsID: '',
            enableCalendarIntegration: false,
            // Audio/video settings
            enableNoisyMicDetection: false,
            enableClosePage: false
          },
          interfaceConfigOverwrite: {
            TOOLBAR_BUTTONS: [
              'microphone', 'camera', 'desktop', 'fullscreen',
              'hangup', 'chat', 'raisehand', 'tileview', 'settings'
            ],
            SHOW_JITSI_WATERMARK: false,
            SHOW_BRAND_WATERMARK: false,
            MOBILE_APP_PROMO: false,
            DISABLE_JOIN_LEAVE_NOTIFICATIONS: false,
            DISABLE_FOCUS_INDICATOR: false,
            DEFAULT_BACKGROUND: '#1e293b'
          },
          userInfo: { displayName: userName }
        };

        console.log('[Jitsi] Connecting to LOCAL server:', JITSI_DOMAIN, 'Room:', cleanRoom);
        apiRef.current = new JitsiAPI(JITSI_DOMAIN, options);

        apiRef.current.addListener('videoConferenceJoined', () => {
          if (mounted) {
            setStatus('connected');
            console.log('[Jitsi] Connected to local server');
          }
        });

        apiRef.current.addListener('videoConferenceLeft', () => {
          console.log('[Jitsi] Left conference');
          if (onClose) onClose();
        });

        apiRef.current.addListener('readyToClose', () => {
          if (onClose) onClose();
        });

        // Set connected after iframe loads (even before joining)
        setTimeout(() => {
          if (mounted && status === 'loading') {
            setStatus('connected');
          }
        }, 3000);

      } catch (err) {
        console.error('[Jitsi] Error:', err);
        if (mounted) {
          setErrorMsg(err.message);
          setStatus('error');
        }
      }
    };

    initJitsi();

    return () => {
      mounted = false;
      if (apiRef.current) {
        try { apiRef.current.dispose(); } catch (e) {}
        apiRef.current = null;
      }
    };
  }, [cleanRoom, userName, onClose, status]);

  // ERROR state
  if (status === 'error') {
    return (
      <div className="bg-slate-900 rounded-2xl overflow-hidden">
        <Header roomName={cleanRoom} onClose={onClose} />
        <div className="h-[550px] flex items-center justify-center bg-slate-800 p-8">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">⚠️</span>
            </div>
            <p className="text-white font-bold text-xl mb-2">Connection Failed</p>
            <p className="text-slate-400 mb-4">{errorMsg}</p>
            <p className="text-slate-500 text-sm mb-4">Make sure the Jitsi server is running at {JITSI_URL}</p>
            <p className="text-amber-400 text-xs mb-6">If using self-signed SSL, first visit <a href={JITSI_URL} target="_blank" rel="noopener noreferrer" className="underline">{JITSI_URL}</a> and accept the certificate, then try again.</p>
            <div className="flex gap-3 justify-center">
              <a
                href={`${JITSI_URL}/${cleanRoom}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700"
              >
                Open in New Tab
              </a>
              <button
                onClick={onClose}
                className="px-6 py-3 bg-slate-700 text-white rounded-xl font-bold hover:bg-slate-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // LOADING/CONNECTED state
  return (
    <div className="bg-slate-900 rounded-2xl overflow-hidden">
      <Header roomName={cleanRoom} onClose={onClose} connected={status === 'connected'} />
      
      {status === 'loading' && (
        <div className="h-[550px] flex items-center justify-center bg-slate-800">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white font-bold">Connecting to local Jitsi...</p>
            <p className="text-slate-400 text-sm mt-2">Allow camera/microphone when prompted</p>
          </div>
        </div>
      )}
      
      <div 
        ref={containerRef} 
        className={status === 'loading' ? 'hidden' : ''}
        style={{ minHeight: '550px' }} 
      />
    </div>
  );
}

// Header component
function Header({ roomName, onClose, connected }) {
  return (
    <div className="flex justify-between items-center p-3 bg-slate-800">
      <div className="flex items-center gap-3">
        <div className={`w-3 h-3 rounded-full ${connected ? 'bg-green-500' : 'bg-amber-500 animate-pulse'}`} />
        <span className="text-white font-bold text-sm">Live: {roomName}</span>
        <span className="px-2 py-0.5 text-xs font-medium rounded bg-blue-500/20 text-blue-400">
          Local Server
        </span>
      </div>
      <div className="flex items-center gap-2">
        <a
          href={`https://localhost:8443/${roomName}`}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 bg-slate-700 text-white rounded-lg text-xs font-bold hover:bg-slate-600"
          title="Open in browser tab"
        >
          Open Tab ↗
        </a>
        <button
          onClick={onClose}
          className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700"
        >
          Leave
        </button>
      </div>
    </div>
  );
}

export default JitsiMeet;
