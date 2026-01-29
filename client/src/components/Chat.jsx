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
      auth: { token },
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

  // Fetch chat rooms on mount
  useEffect(() => {
    fetchRooms();
  }, []);

  // Join room when selected
  useEffect(() => {
    if (socket && selectedRoom) {
      console.log('[Chat] Joining room:', selectedRoom.id);
      socket.emit('join-room', selectedRoom.id);
      fetchMessages(selectedRoom.id);
    }
  }, [socket, selectedRoom?.id]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchRooms = async () => {
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
  };

  const fetchMessages = async (roomId) => {
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
  };

  const fetchAvailableUsers = async () => {
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
  };

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
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[80vh] flex overflow-hidden">
        
        {/* Sidebar - Room List */}
        <div className="w-80 border-r border-slate-200 flex flex-col">
          {/* Header with Close Button */}
          <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-gradient-to-r from-emerald-500 to-emerald-600">
            <h2 className="font-bold text-lg text-white">Messages</h2>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowNewChat(true); fetchAvailableUsers(); }}
                className="p-2 hover:bg-white/20 rounded-lg text-white"
                title="New Chat"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/20 rounded-lg text-white"
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
              <div className="p-4 text-center text-slate-500">Loading...</div>
            ) : rooms.length === 0 ? (
              <div className="p-4 text-center text-slate-500">
                <p className="mb-2">No conversations yet</p>
                <button
                  onClick={() => { setShowNewChat(true); fetchAvailableUsers(); }}
                  className="text-emerald-600 font-medium hover:underline"
                >
                  Start a new chat
                </button>
              </div>
            ) : (
              rooms.map(room => (
                <div
                  key={room.id}
                  onClick={() => setSelectedRoom(room)}
                  className={`p-4 cursor-pointer hover:bg-slate-50 border-b border-slate-100 ${
                    selectedRoom?.id === room.id ? 'bg-emerald-50' : ''
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold">
                          {room.other_participant?.name?.charAt(0) || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">
                            {room.other_participant?.name || room.name}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {room.other_participant?.user_role === 'teacher' ? 'Teacher' : 'Student'}
                          </p>
                        </div>
                      </div>
                      {room.last_message && (
                        <p className="text-sm text-slate-500 truncate mt-1 ml-12">
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
                        <span className="ml-2 bg-emerald-500 text-white text-xs rounded-full px-2 py-0.5">
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
        <div className="flex-1 flex flex-col">
          {selectedRoom ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-slate-200 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold">
                    {selectedRoom.other_participant?.name?.charAt(0) || '?'}
                  </div>
                  <div>
                    <h3 className="font-bold">
                      {selectedRoom.other_participant?.name || selectedRoom.name}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {selectedRoom.other_participant?.user_role === 'teacher' ? 'Teacher' : 'Student'}
                      {selectedRoom.other_participant?.subject && ` - ${selectedRoom.other_participant.subject}`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-slate-100 rounded-lg"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                  <div className="text-center text-slate-400 py-8">
                    <p>No messages yet. Say hello! 👋</p>
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
                            <span className="bg-slate-100 text-slate-500 text-xs px-3 py-1 rounded-full">
                              {formatDate(msg.created_at)}
                            </span>
                          </div>
                        )}
                        <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${
                            isOwn 
                              ? 'bg-emerald-500 text-white rounded-br-none' 
                              : 'bg-slate-100 text-slate-800 rounded-bl-none'
                          }`}>
                            {!isOwn && (
                              <p className="text-xs font-medium mb-1 opacity-70">
                                {msg.sender_name}
                              </p>
                            )}
                            <p className="text-sm">{msg.message}</p>
                            <p className={`text-xs mt-1 ${isOwn ? 'text-emerald-100' : 'text-slate-400'}`}>
                              {formatTime(msg.created_at)}
                            </p>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })
                )}
                
                {/* Typing indicator */}
                {Object.keys(typingUsers).length > 0 && (
                  <div className="flex justify-start">
                    <div className="bg-slate-100 px-4 py-2 rounded-2xl rounded-bl-none">
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
              <form onSubmit={sendMessage} className="p-4 border-t border-slate-200">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => { setNewMessage(e.target.value); handleTyping(); }}
                    placeholder="Type a message..."
                    className="flex-1 border border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="submit"
                    disabled={!newMessage.trim()}
                    className="bg-emerald-500 text-white px-4 py-2 rounded-xl hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
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
            <div className="flex-1 flex items-center justify-center text-slate-500">
              <div className="text-center">
                <svg className="w-16 h-16 mx-auto mb-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p>Select a conversation or start a new one</p>
                <button
                  onClick={onClose}
                  className="mt-4 text-slate-400 hover:text-slate-600"
                >
                  Close Chat
                </button>
              </div>
            </div>
          )}
        </div>

        {/* New Chat Modal */}
        {showNewChat && (
          <div className="absolute inset-0 bg-white z-10 flex flex-col">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center">
              <h2 className="font-bold text-lg">New Conversation</h2>
              <button
                onClick={() => setShowNewChat(false)}
                className="p-2 hover:bg-slate-100 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {availableUsers.length === 0 ? (
                <p className="text-center text-slate-500">
                  No {userRole === 'student' ? 'teachers' : 'students'} available to chat with
                </p>
              ) : (
                <div className="space-y-2">
                  {availableUsers.map(u => (
                    <div
                      key={`${u.role}-${u.id}`}
                      onClick={() => startNewChat(u)}
                      className="p-4 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 flex items-center gap-3"
                    >
                      <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold text-lg">
                        {u.name?.charAt(0) || '?'}
                      </div>
                      <div>
                        <p className="font-medium">{u.name}</p>
                        <p className="text-sm text-slate-500">
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
