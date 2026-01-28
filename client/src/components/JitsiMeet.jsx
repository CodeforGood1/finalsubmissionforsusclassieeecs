import React, { useEffect, useRef, useState } from 'react';

// ============================================================
// JITSI MEET COMPONENT - ON-PREMISE EDITION
// ============================================================
// Supports both self-hosted Jitsi and public Jitsi servers
// For offline deployment, use self-hosted Jitsi Meet
// ============================================================

// Configuration - can be set via environment or defaults
const JITSI_CONFIG = {
  // Self-hosted Jitsi server (for on-premise deployment)
  // Set VITE_JITSI_SERVER_URL in .env for self-hosted
  serverUrl: import.meta.env.VITE_JITSI_SERVER_URL || null,
  
  // Fallback to public Jitsi (requires internet)
  publicServer: 'meet.jit.si',
  
  // Whether to use self-hosted (auto-detect based on serverUrl)
  get isSelfHosted() {
    return !!this.serverUrl;
  },
  
  // Get the domain to use
  get domain() {
    if (this.serverUrl) {
      // Extract domain from URL
      try {
        const url = new URL(this.serverUrl);
        return url.host;
      } catch {
        return this.serverUrl;
      }
    }
    return this.publicServer;
  },
  
  // Get the API script URL
  get apiScriptUrl() {
    if (this.serverUrl) {
      return `${this.serverUrl}/external_api.js`;
    }
    return `https://${this.publicServer}/external_api.js`;
  }
};

function JitsiMeet({ roomName, displayName, onClose, isTeacher = false }) {
  const jitsiContainerRef = useRef(null);
  const apiRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connectionMode, setConnectionMode] = useState(JITSI_CONFIG.isSelfHosted ? 'local' : 'public');

  useEffect(() => {
    // Load the Jitsi Meet External API script
    const loadJitsiScript = () => {
      return new Promise((resolve, reject) => {
        if (window.JitsiMeetExternalAPI) {
          resolve();
          return;
        }

        const script = document.createElement('script');
        script.src = JITSI_CONFIG.apiScriptUrl;
        script.async = true;
        script.onload = resolve;
        script.onerror = () => {
          // If self-hosted fails, try public Jitsi
          if (JITSI_CONFIG.isSelfHosted) {
            console.warn('Self-hosted Jitsi unavailable, falling back to public server');
            setConnectionMode('public');
            const fallbackScript = document.createElement('script');
            fallbackScript.src = `https://${JITSI_CONFIG.publicServer}/external_api.js`;
            fallbackScript.async = true;
            fallbackScript.onload = resolve;
            fallbackScript.onerror = () => reject(new Error('Failed to load Jitsi script'));
            document.body.appendChild(fallbackScript);
          } else {
            reject(new Error('Failed to load Jitsi script'));
          }
        };
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

        const domain = connectionMode === 'local' ? JITSI_CONFIG.domain : JITSI_CONFIG.publicServer;

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
            // P2P for better LAN performance
            p2p: {
              enabled: true,
              preferredCodec: 'VP9'
            }
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

        // Create Jitsi instance using configured server (self-hosted or public)
        console.log(`Connecting to Jitsi server: ${domain} (${connectionMode} mode)`);
        apiRef.current = new window.JitsiMeetExternalAPI(domain, options);

        apiRef.current.addListener('videoConferenceJoined', () => {
          setLoading(false);
          console.log('Connected to video conference');
        });

        apiRef.current.addListener('videoConferenceLeft', () => {
          console.log('Left video conference');
          if (onClose) onClose();
        });

        apiRef.current.addListener('readyToClose', () => {
          if (onClose) onClose();
        });

        // Handle connection errors for self-hosted
        apiRef.current.addListener('errorOccurred', (event) => {
          console.error('Jitsi error:', event);
          if (connectionMode === 'local') {
            setError('Connection to local Jitsi server failed. Check if the server is running.');
          }
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
  }, [roomName, displayName, onClose, connectionMode]);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
        <svg className="w-12 h-12 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-red-600 font-bold mb-2">Failed to load video call</p>
        <p className="text-red-500 text-sm">{error}</p>
        {connectionMode === 'local' && (
          <p className="text-slate-600 text-xs mt-2">
            Tip: Ensure your local Jitsi server is running at {JITSI_CONFIG.serverUrl}
          </p>
        )}
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
          {/* Connection Mode Badge */}
          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
            connectionMode === 'local' 
              ? 'bg-emerald-500/20 text-emerald-400' 
              : 'bg-blue-500/20 text-blue-400'
          }`}>
          {connectionMode === 'local' ? 'Local Server' : 'Public Server'}
          </span>
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
            <p className="text-slate-400 text-sm mt-2">
              {connectionMode === 'local' 
                ? 'Connecting to local Jitsi server...'
                : 'Please allow camera/microphone access when prompted'
              }
            </p>
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
