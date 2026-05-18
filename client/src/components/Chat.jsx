import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import API_BASE_URL from '../config/api';

const Chat = ({ onClose }) => {
  const [socket, setSocket] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [availableUsers, setAvailableUsers] = useState([]);
  const [showNewChat, setShowNewChat] = useState(false);
  const [loading, setLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState({});
  const [reportingMessageId, setReportingMessageId] = useState(null);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const selectedRoomRef = useRef(null);

  const user = JSON.parse(localStorage.getItem('user_data') || '{}');
  const token = localStorage.getItem('token');
  const userRole = localStorage.getItem('user_role');

  // Keep ref in sync with state
  useEffect(() => {
    selectedRoomRef.current = selectedRoom;
  }, [selectedRoom]);

  // Handle escape key to close chat
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Initialize socket connection
  useEffect(() => {
    // In production, API_BASE_URL is empty and socket connects to same origin
    // In development, it might be 'http://localhost:5000' or empty with Vite proxy
    let socketUrl = API_BASE_URL;
    if (!socketUrl || socketUrl === '' || socketUrl === '/') {
      // Same origin - use window.location
      socketUrl = window.location.origin;
    } else {
      // Remove /api suffix if present
      socketUrl = socketUrl.replace(/\/api\/?$/, '');
    }
    console.log('[Chat] Connecting to socket at:', socketUrl);
    
    const newSocket = io(socketUrl, {
      auth: token && token !== 'cookie-session' ? { token } : {},
      withCredentials: true,
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      console.log('[Chat] Connected to chat server, socket id:', newSocket.id);
    });

    newSocket.on('connect_error', (err) => {
      console.error('[Chat] Socket connection error:', err.message);
    });

    newSocket.on('new-message', (message) => {
      console.log('[Chat] Received new-message:', message);
      const currentRoom = selectedRoomRef.current;
      
      // Add to messages if this room is currently selected
      if (currentRoom && message.room_id === currentRoom.id) {
        setMessages(prev => {
          // Prevent duplicate messages
          if (prev.some(m => m.id === message.id)) {
            return prev;
          }
          return [...prev, message];
        });
      }
      
      // Update room list with new message
      setRooms(prev => prev.map(room => {
        if (room.id === message.room_id) {
          const isCurrentRoom = currentRoom && room.id === currentRoom.id;
          const isSender = message.sender_id === user.id && message.sender_role === userRole;
          return { 
            ...room, 
            last_message: message.message, 
            last_message_at: message.created_at, 
            // Don't increment unread if user is viewing this room OR if user sent the message
            unread_count: (isCurrentRoom || isSender) ? 0 : (parseInt(room.unread_count) || 0) + 1 
          };
        }
        return room;
      }));
    });

    newSocket.on('message-notification', (data) => {
      console.log('[Chat] Message notification:', data);
      // Could add browser notification here for messages in other rooms
    });

    newSocket.on('user-typing', (data) => {
      const currentRoom = selectedRoomRef.current;
      if (currentRoom && data.roomId === currentRoom.id) {
        setTypingUsers(prev => ({ ...prev, [data.userId]: true }));
      }
    });

    newSocket.on('user-stopped-typing', (data) => {
      const currentRoom = selectedRoomRef.current;
      if (currentRoom && data.roomId === currentRoom.id) {
        setTypingUsers(prev => {
          const updated = { ...prev };
          delete updated[data.userId];
          return updated;
        });
      }
    });

    newSocket.on('error', (error) => {
      console.error('[Chat] Socket error:', error);
    });

    setSocket(newSocket);

    return () => {
      console.log('[Chat] Disconnecting socket');
      newSocket.disconnect();
    };
  }, [token, user.id, userRole]);

  const fetchRooms = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/rooms`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (Array.isArray(data)) {
        setRooms(data);
      } else {
        console.error('[Chat] Invalid rooms response:', data);
        setRooms([]);
      }
    } catch (err) {
      console.error('[Chat] Failed to fetch rooms:', err);
      setRooms([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchMessages = useCallback(async (roomId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/rooms/${roomId}/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (Array.isArray(data)) {
        setMessages(data);
      } else {
        console.error('[Chat] Invalid messages response:', data);
        setMessages([]);
      }
      
      // Update unread count for this room
      setRooms(prev => prev.map(room => 
        room.id === roomId ? { ...room, unread_count: 0 } : room
      ));
    } catch (err) {
      console.error('[Chat] Failed to fetch messages:', err);
      setMessages([]);
    }
  }, [token]);

  const fetchAvailableUsers = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/available-users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (Array.isArray(data)) {
        setAvailableUsers(data);
      } else {
        console.error('[Chat] Invalid available users response:', data);
        setAvailableUsers([]);
      }
    } catch (err) {
      console.error('[Chat] Failed to fetch available users:', err);
      setAvailableUsers([]);
    }
  }, [token]);

  // Fetch chat rooms on mount
  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  // Join room when selected
  useEffect(() => {
    if (socket && selectedRoom) {
      console.log('[Chat] Joining room:', selectedRoom.id);
      socket.emit('join-room', selectedRoom.id);
      fetchMessages(selectedRoom.id);
    }
  }, [socket, selectedRoom, fetchMessages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startNewChat = async (targetUser) => {
    try {
      console.log('[Chat] Starting new chat with:', targetUser);
      const response = await fetch(`${API_BASE_URL}/api/chat/room`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          targetId: targetUser.id,
          targetRole: targetUser.role
        })
      });
      const data = await response.json();
      console.log('[Chat] Create room response:', data);
      
      if (data.error) {
        console.error('[Chat] Error creating room:', data.error);
        return;
      }
      
      if (data.room) {
        const roomWithParticipant = { 
          ...data.room, 
          other_participant: targetUser,
          unread_count: 0 
        };
        
        // Check if room already exists in list
        setRooms(prev => {
          const existingIndex = prev.findIndex(r => r.id === data.room.id);
          if (existingIndex >= 0) {
            // Update existing room
            const updated = [...prev];
            updated[existingIndex] = { ...updated[existingIndex], other_participant: targetUser };
            return updated;
          }
          // Add new room at the start
          return [roomWithParticipant, ...prev];
        });
        
        setSelectedRoom(roomWithParticipant);
        setShowNewChat(false);
      }
    } catch (err) {
      console.error('[Chat] Failed to create chat:', err);
    }
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !socket || !selectedRoom) return;

    console.log('[Chat] Sending message to room:', selectedRoom.id);
    socket.emit('send-message', {
      roomId: selectedRoom.id,
      message: newMessage.trim()
    });

    setNewMessage('');
    socket.emit('stop-typing', selectedRoom.id);
  };

  const reportMessage = async (message) => {
    if (userRole !== 'student' || reportingMessageId) return;
    const reason = window.prompt('Report this message', 'Inappropriate or unsafe message');
    if (!reason || !reason.trim()) return;

    setReportingMessageId(message.id);
    try {
      const response = await fetch(`${API_BASE_URL}/api/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          targetType: 'chat_message',
          targetId: message.id,
          reason: reason.trim()
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to report message');
      alert('Report submitted.');
    } catch (err) {
      alert(err.message);
    } finally {
      setReportingMessageId(null);
    }
  };

  const handleTyping = () => {
    if (socket && selectedRoom) {
      socket.emit('typing', selectedRoom.id);
      
      // Clear previous timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      // Set timeout to stop typing indicator
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('stop-typing', selectedRoom.id);
      }, 2000);
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#101828]/55 p-3 backdrop-blur-sm sm:p-4">
      <div className="ui-card flex h-[88vh] w-full max-w-5xl overflow-hidden">
        
        {/* Sidebar - Room List */}
        <div className={`${selectedRoom ? 'hidden md:flex' : 'flex'} w-full border-r border-[#e8dde3] bg-[#faf9fb] md:w-80 flex-col`}>
          {/* Header with Close Button */}
          <div className="flex items-center justify-between border-b border-[#e7eaf0] bg-white p-4">
            <div>
              <h2 className="font-black text-lg text-[#101828]">Messages</h2>
              <p className="text-xs font-semibold text-[#848087]">Classroom conversations</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowNewChat(true); fetchAvailableUsers(); }}
                className="p-2 hover:bg-[#faf9fb] rounded-lg text-[#667085]"
                title="New Chat"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
              <button
                onClick={onClose}
                className="p-2 hover:bg-[#faf9fb] rounded-lg text-[#667085]"
                title="Close (ESC)"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Room List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="space-y-3 p-4">
                {[0, 1, 2, 3].map((item) => (
                  <div key={item} className="rounded-2xl bg-white p-3">
                    <div className="skeleton mb-3 h-4 w-2/3 rounded" />
                    <div className="skeleton h-3 w-1/2 rounded" />
                  </div>
                ))}
              </div>
            ) : rooms.length === 0 ? (
              <div className="p-8 text-center text-[#5f5b5f]">
                <p className="mb-2 font-black text-[#101828]">No conversations yet</p>
                <button
                  onClick={() => { setShowNewChat(true); fetchAvailableUsers(); }}
                  className="font-black text-[#f1764f] hover:text-[#d95d38]"
                >
                  Start a new chat
                </button>
              </div>
            ) : (
              rooms.map(room => (
                <div
                  key={room.id}
                  onClick={() => setSelectedRoom(room)}
                  className={`cursor-pointer border-b border-[#e7eaf0] p-4 transition-colors hover:bg-white ${
                    selectedRoom?.id === room.id ? 'bg-[#fff1ea]' : ''
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-xl bg-[#fff1ea] flex items-center justify-center text-[#f1764f] font-black">
                          {room.other_participant?.name?.charAt(0) || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-black truncate text-[#101828]">
                            {room.other_participant?.name || room.name}
                          </p>
                          <p className="text-xs font-semibold text-[#848087] truncate">
                            {room.other_participant?.user_role === 'teacher' ? 'Teacher' : 'Student'}
                          </p>
                        </div>
                      </div>
                      {room.last_message && (
                        <p className="text-sm text-[#5f5b5f] truncate mt-1 ml-12">
                          {room.last_message}
                        </p>
                      )}
                    </div>
                    <div className="text-right ml-2">
                      {room.last_message_at && (
                        <span className="text-xs text-slate-400">
                          {formatTime(room.last_message_at)}
                        </span>
                      )}
                      {parseInt(room.unread_count) > 0 && (
                        <span className="ml-2 rounded-full bg-[#f1764f] px-2 py-0.5 text-xs text-white">
                          {room.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className={`${selectedRoom ? 'flex' : 'hidden md:flex'} flex-1 flex-col bg-white`}>
          {selectedRoom ? (
            <>
              {/* Chat Header */}
              <div className="flex items-center justify-between border-b border-[#e7eaf0] p-4">
                <div className="flex items-center gap-3">
                  <button onClick={() => setSelectedRoom(null)} className="rounded-xl p-2 text-[#848087] hover:bg-[#faf9fb] md:hidden" title="Back">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <div className="w-10 h-10 rounded-xl bg-[#fff1ea] flex items-center justify-center text-[#f1764f] font-black">
                    {selectedRoom.other_participant?.name?.charAt(0) || '?'}
                  </div>
                  <div>
                    <h3 className="font-black text-[#101828]">
                      {selectedRoom.other_participant?.name || selectedRoom.name}
                    </h3>
                    <p className="text-xs font-semibold text-[#848087]">
                      {selectedRoom.other_participant?.user_role === 'teacher' ? 'Teacher' : 'Student'}
                      {selectedRoom.other_participant?.subject && ` - ${selectedRoom.other_participant.subject}`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-[#faf9fb] rounded-lg"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 space-y-4 overflow-y-auto bg-[#faf9fb] p-4">
                {messages.length === 0 ? (
                  <div className="py-10 text-center text-[#848087]">
                    <p className="font-black text-[#3e3b41]">No messages yet</p>
                    <p className="mt-1 text-sm font-semibold">Say hello to start the thread.</p>
                  </div>
                ) : (
                  messages.map((msg, index) => {
                    const isOwn = msg.sender_id === user.id && msg.sender_role === userRole;
                    const showDate = index === 0 || 
                      formatDate(msg.created_at) !== formatDate(messages[index - 1]?.created_at);

                    return (
                      <React.Fragment key={msg.id}>
                        {showDate && (
                          <div className="text-center">
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#848087] shadow-sm">
                              {formatDate(msg.created_at)}
                            </span>
                          </div>
                        )}
                        <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-xs rounded-2xl px-4 py-2 shadow-sm lg:max-w-md ${
                            isOwn 
                              ? 'bg-[#f1764f] text-white rounded-br-none' 
                              : 'bg-white text-[#101828] rounded-bl-none'
                          }`}>
                            {!isOwn && (
                              <p className="text-xs font-medium mb-1 opacity-70">
                                {msg.sender_name}
                              </p>
                            )}
                            <p className="text-sm">{msg.message}</p>
                            <div className={`mt-1 flex items-center gap-3 text-xs ${isOwn ? 'justify-end text-white/65' : 'justify-between text-[#848087]'}`}>
                              <span>{formatTime(msg.created_at)}</span>
                              {!isOwn && userRole === 'student' && (
                                <button
                                  type="button"
                                  onClick={() => reportMessage(msg)}
                                  disabled={reportingMessageId === msg.id}
                                  className="rounded-full px-2 py-0.5 font-bold uppercase tracking-wide text-red-500 hover:bg-red-50 disabled:opacity-50"
                                  title="Report message"
                                >
                                  {reportingMessageId === msg.id ? 'Reporting' : 'Report'}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })
                )}
                
                {/* Typing indicator */}
                {Object.keys(typingUsers).length > 0 && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl rounded-bl-none bg-white px-4 py-2 shadow-sm">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                        <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                        <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <form onSubmit={sendMessage} className="border-t border-[#e7eaf0] bg-white p-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => { setNewMessage(e.target.value); handleTyping(); }}
                    placeholder="Type a message..."
                    className="field min-h-0 flex-1 py-2"
                  />
                  <button
                    type="submit"
                    disabled={!newMessage.trim()}
                    className="btn-primary min-h-0 px-4 py-2 disabled:cursor-not-allowed"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                </div>
              </form>
            </>
          ) : (
            /* No Room Selected */
            <div className="flex-1 flex items-center justify-center text-[#5f5b5f]">
              <div className="text-center">
                <svg className="w-16 h-16 mx-auto mb-4 text-[#c6b5bf]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p className="font-black text-[#101828]">Select a conversation</p>
                <p className="mt-1 text-sm font-semibold text-[#848087]">or start a new thread with your class.</p>
                <button
                  onClick={onClose}
                  className="mt-4 text-sm font-black text-[#848087] hover:text-[#f1764f]"
                >
                  Close Chat
                </button>
              </div>
            </div>
          )}
        </div>

        {/* New Chat Modal */}
        {showNewChat && (
          <div className="absolute inset-0 z-10 flex flex-col bg-white">
            <div className="flex items-center justify-between border-b border-[#e7eaf0] p-4">
              <h2 className="font-black text-lg text-[#101828]">New Conversation</h2>
              <button
                onClick={() => setShowNewChat(false)}
                className="p-2 hover:bg-[#faf9fb] rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {availableUsers.length === 0 ? (
                <p className="text-center font-semibold text-[#848087]">
                  No {userRole === 'student' ? 'teachers' : 'students'} available to chat with
                </p>
              ) : (
                <div className="space-y-2">
                  {availableUsers.map(u => (
                    <div
                      key={`${u.role}-${u.id}`}
                      onClick={() => startNewChat(u)}
                      className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#e7eaf0] p-4 transition hover:bg-[#faf9fb] hover:shadow-sm"
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#fff1ea] text-lg font-black text-[#f1764f]">
                        {u.name?.charAt(0) || '?'}
                      </div>
                      <div>
                        <p className="font-black text-[#101828]">{u.name}</p>
                        <p className="text-sm font-semibold text-[#848087]">
                          {u.role === 'teacher' ? `Teacher - ${u.subject || 'No subject'}` : `Student - ${u.class_dept} ${u.section}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Chat;
