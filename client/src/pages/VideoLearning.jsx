import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import API_BASE_URL from '../config/api';

// Extract YouTube video ID and return a clean embed URL
const getYouTubeEmbedUrl = (url) => {
  if (!url) return '';
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? `https://www.youtube.com/embed/${match[1]}?rel=0&modestbranding=1` : url;
};

function VideoLearning() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const [localVideos, setLocalVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Default sample videos - these will be replaced with local videos from the server
  const defaultVideos = [
    {
      id: 'sample-1',
      title: 'JavaScript Basics',
      description: 'An introduction to the building blocks of the web. We cover syntax, variables, and how code flows.',
      url: '/uploads/videos/sample-javascript-basics.mp4',
      isLocal: true,
      resources: [{ name: 'JavaScript Guide', link: '/courses' }]
    },
    {
      id: 'sample-2',
      title: 'Async JS & Promises',
      description: 'Mastering the art of timing. Learn how JavaScript handles multiple tasks without slowing down.',
      url: '/uploads/videos/sample-async-promises.mp4',
      isLocal: true,
      resources: [{ name: 'Async Programming Guide', link: '/courses' }]
    },
    {
      id: 'sample-3',
      title: 'DOM Manipulation',
      description: 'Learn how to reach into your HTML and change things on the fly using JavaScript logic.',
      url: '/uploads/videos/sample-dom-manipulation.mp4',
      isLocal: true,
      resources: [{ name: 'DOM Reference', link: '/courses' }]
    }
  ];

  // Fetch videos from local server
  useEffect(() => {
    const fetchVideos = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/modules/videos`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.videos && data.videos.length > 0) {
            setLocalVideos(data.videos.map(v => ({
              ...v,
              isLocal: true,
              url: v.url.startsWith('http') ? v.url : `${API_BASE_URL}${v.url}`
            })));
          } else {
            setLocalVideos(defaultVideos);
          }
        } else {
          setLocalVideos(defaultVideos);
        }
      } catch (err) {
        console.log('Using default videos (offline mode)');
        setLocalVideos(defaultVideos);
      } finally {
        setLoading(false);
      }
    };
    
    fetchVideos();
  }, []);

  const videos = localVideos.length > 0 ? localVideos : defaultVideos;
  const [currentIndex, setCurrentIndex] = useState(0);
  const current = videos[currentIndex] || videos[0];
  const progressPercent = videos.length > 0 ? ((currentIndex + 1) / videos.length) * 100 : 0;

  // Handle video source - support both local and external videos
  const isExternalVideo = current?.url?.includes('youtube.com') || current?.url?.includes('youtu.be') || current?.url?.includes('vimeo.com');
  const videoUrl = isExternalVideo ? getYouTubeEmbedUrl(current?.url || '') : (current?.url || '');

  return (
    <div className="min-h-screen bg-[#fdfdfd] font-sans text-slate-800 p-8 lg:p-12">
      <div className="max-w-5xl mx-auto">
        
        {/* TOP NAVIGATION */}
        <div className="flex items-center justify-between mb-8">
          <button 
            onClick={() => navigate('/courses')}
            className="flex items-center gap-2 text-slate-400 hover:text-emerald-600 font-medium transition-colors text-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Hub
          </button>
          
          <div className="text-right">
            <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest block">Course Progress</span>
            <span className="text-xs font-bold text-emerald-600">{Math.round(progressPercent)}% Complete</span>
          </div>
        </div>

        {/* PROGRESS BAR */}
        <div className="w-full h-1 bg-slate-100 rounded-full mb-12 overflow-hidden">
          <div 
            className="h-full bg-emerald-500 transition-all duration-700 ease-in-out"
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-12">
          
          {/* MAIN VIDEO AREA (3 Columns) */}
          <div className="xl:col-span-3 space-y-8">
            <div className="aspect-video bg-slate-900 rounded-3xl overflow-hidden shadow-2xl shadow-slate-200 border border-slate-200">
              {loading ? (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
                </div>
              ) : isExternalVideo ? (
                /* External video (YouTube/Vimeo) - use iframe */
                <iframe
                  className="w-full h-full"
                  src={videoUrl}
                  title={current?.title}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="origin"
                  allowFullScreen
                ></iframe>
              ) : (
                /* Local video - use HTML5 video player */
                <video
                  ref={videoRef}
                  className="w-full h-full"
                  src={videoUrl}
                  controls
                  controlsList="nodownload"
                  preload="metadata"
                  onError={(e) => {
                    console.log('Video load error, trying fallback');
                    // Show placeholder for missing videos
                    e.target.poster = '/placeholder-video.png';
                  }}
                >
                  <source src={videoUrl} type="video/mp4" />
                  <source src={videoUrl.replace('.mp4', '.webm')} type="video/webm" />
                  Your browser does not support the video tag.
                </video>
              )}
            </div>

            <div className="px-2">
              <h1 className="text-3xl font-bold text-slate-900 mb-4 tracking-tight">{current?.title}</h1>
              <p className="text-slate-500 leading-relaxed text-lg max-w-3xl">
                {current?.description}
              </p>
              {current?.isLocal && (
                <span className="inline-flex items-center gap-1 mt-3 text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Offline Available
                </span>
              )}
            </div>
          </div>

          {/* SIDEBAR RESOURCES & NAV (1 Column) */}
          <div className="space-y-8">
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Resources</h3>
              <ul className="space-y-3">
                {current.resources.map((res, i) => (
                  <li key={i}>
                    <a 
                      href={res.link} 
                      target="_blank" 
                      rel="noreferrer" 
                      className="text-sm font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-2 group"
                    >
                      <svg className="w-4 h-4 opacity-50 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      {res.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* QUICK NAVIGATION */}
            <div className="flex flex-col gap-3">
              <button
                disabled={currentIndex === videos.length - 1}
                onClick={() => setCurrentIndex(currentIndex + 1)}
                className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
              >
                {currentIndex === videos.length - 1 ? 'Course Finished' : 'Next Lesson'}
              </button>
              
              <button
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex(currentIndex - 1)}
                className="w-full py-4 bg-white border border-slate-200 text-slate-500 rounded-2xl font-bold text-sm hover:bg-slate-50 transition-all disabled:opacity-0"
              >
                Previous
              </button>
            </div>

            {/* WELLBEING WIDGET */}
            <div className="p-6 rounded-2xl bg-amber-50/50 border border-amber-100">
               <h4 className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-2">Wellbeing Tip</h4>
               <p className="text-xs text-amber-800/70 italic leading-relaxed">
                 Finished a video? Rest your eyes by looking at something 20 feet away for 20 seconds.
               </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default VideoLearning;