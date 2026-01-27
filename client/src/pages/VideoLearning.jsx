import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function VideoLearning() {
  const navigate = useNavigate();
  
  const videos = [
    {
      title: 'JavaScript Basics',
      description: 'An introduction to the building blocks of the web. We cover syntax, variables, and how code flows.',
      url: 'https://www.youtube.com/embed/W6NZfCO5SIk',
      resources: [{ name: 'MDN JavaScript Guide', link: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide' }]
    },
    {
      title: 'Async JS & Promises',
      description: 'Mastering the art of timing. Learn how JavaScript handles multiple tasks without slowing down.',
      url: 'https://www.youtube.com/embed/PoRJizFvM7s',
      resources: [{ name: 'Guide to Promises', link: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises' }]
    },
    {
      title: 'DOM Manipulation',
      description: 'Learn how to reach into your HTML and change things on the fly using JavaScript logic.',
      url: 'https://www.youtube.com/embed/0ik6X4DJKCc',
      resources: [{ name: 'DOM API Reference', link: 'https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model' }]
    }
  ];

  const [currentIndex, setCurrentIndex] = useState(0);
  const current = videos[currentIndex];
  const progressPercent = ((currentIndex + 1) / videos.length) * 100;

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
              <iframe
                className="w-full h-full"
                src={current.url}
                title={current.title}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              ></iframe>
            </div>

            <div className="px-2">
              <h1 className="text-3xl font-bold text-slate-900 mb-4 tracking-tight">{current.title}</h1>
              <p className="text-slate-500 leading-relaxed text-lg max-w-3xl">
                {current.description}
              </p>
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