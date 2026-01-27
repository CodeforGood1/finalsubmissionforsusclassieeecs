import React, { useEffect, useRef, useState } from 'react';

// Component for embedding Jitsi Meet video calls
// Uses 8x8.vc public Jitsi servers (no account required)
function JitsiMeet({ roomName, displayName, onClose, isTeacher = false }) {
  const jitsiContainerRef = useRef(null);
  const apiRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Load the Jitsi Meet External API script
    const loadJitsiScript = () => {
      return new Promise((resolve, reject) => {
        if (window.JitsiMeetExternalAPI) {
          resolve();
          return;
        }

        const script = document.createElement('script');
        script.src = 'https://8x8.vc/vpaas-magic-cookie-7e7e7e7e7e7e7e7e/external_api.js';
        script.async = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error('Failed to load Jitsi script'));
        document.body.appendChild(script);
      });
    };

    const initJitsi = async () => {
      try {
        await loadJitsiScript();
        
        if (!jitsiContainerRef.current) return;

        // Clean room name - remove spaces and special characters
        const cleanRoomName = roomName
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '');

        const options = {
          roomName: cleanRoomName,
          parentNode: jitsiContainerRef.current,
          width: '100%',
          height: 600,
          configOverwrite: {
            startWithAudioMuted: true,
            startWithVideoMuted: true,
            prejoinPageEnabled: true,
            disableDeepLinking: true,
          },
          interfaceConfigOverwrite: {
            TOOLBAR_BUTTONS: [
              'microphone', 'camera', 'closedcaptions', 'desktop', 
              'fullscreen', 'fodeviceselection', 'hangup', 'chat',
              'raisehand', 'videoquality', 'filmstrip', 'settings',
              'tileview'
            ],
            SHOW_JITSI_WATERMARK: false,
            SHOW_BRAND_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            DEFAULT_BACKGROUND: '#1e293b',
            DEFAULT_REMOTE_DISPLAY_NAME: 'Student',
            MOBILE_APP_PROMO: false,
          },
          userInfo: {
            displayName: displayName || 'Student'
          }
        };

        // Create Jitsi instance using 8x8.vc (public Jitsi server)
        apiRef.current = new window.JitsiMeetExternalAPI('8x8.vc', options);

        apiRef.current.addListener('videoConferenceJoined', () => {
          setLoading(false);
        });

        apiRef.current.addListener('videoConferenceLeft', () => {
          if (onClose) onClose();
        });

        apiRef.current.addListener('readyToClose', () => {
          if (onClose) onClose();
        });

      } catch (err) {
        console.error('Jitsi initialization error:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    initJitsi();

    return () => {
      if (apiRef.current) {
        apiRef.current.dispose();
      }
    };
  }, [roomName, displayName, onClose]);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
        <svg className="w-12 h-12 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-red-600 font-bold mb-2">Failed to load video call</p>
        <p className="text-red-500 text-sm">{error}</p>
        <button 
          onClick={onClose}
          className="mt-4 px-6 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center p-4 bg-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
          <span className="text-white font-bold">Live Session: {roomName}</span>
        </div>
        <button 
          onClick={onClose}
          className="px-4 py-2 bg-slate-700 text-white rounded-xl text-sm font-bold hover:bg-slate-600"
        >
          Leave
        </button>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="h-[600px] flex items-center justify-center bg-slate-800">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-white font-bold">Connecting to live session...</p>
            <p className="text-slate-400 text-sm mt-2">Please allow camera/microphone access when prompted</p>
          </div>
        </div>
      )}

      {/* Jitsi Container */}
      <div 
        ref={jitsiContainerRef} 
        className={loading ? 'hidden' : ''}
        style={{ minHeight: '600px' }}
      />
    </div>
  );
}

export default JitsiMeet;
