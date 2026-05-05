import React, { useState } from 'react';

const iconPaths = {
  menu: 'M4 6h16M4 12h16M4 18h16',
  grid: 'M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h6v6h-6v-6z',
  book: 'M4 5.5A2.5 2.5 0 016.5 3H20v16H6.5A2.5 2.5 0 004 21.5v-16z',
  code: 'M10 20l4-16M6 8l-4 4 4 4m12-8l4 4-4 4',
  check: 'M9 11l3 3L22 4M5 5h10M5 19h14M5 12h4',
  user: 'M20 21a8 8 0 10-16 0m8-10a4 4 0 100-8 4 4 0 000 8z',
  lock: 'M7 11V7a5 5 0 0110 0v4M6 11h12v10H6V11z',
  logout: 'M15 17l5-5-5-5M20 12H9m2 7H5V5h6',
  users: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2m23 0v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75M9 11a4 4 0 100-8 4 4 0 000 8z',
  teacher: 'M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.42A12.08 12.08 0 0112 21a12.08 12.08 0 01-6.16-10.42L12 14z',
  upload: 'M12 16V4m0 0l-4 4m4-4l4 4M4 20h16',
  settings: 'M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06A1.65 1.65 0 0015 19.4a1.65 1.65 0 00-1 .6l-.09.09a2 2 0 01-3.82 0L10 20a1.65 1.65 0 00-1-.6 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-.6-1l-.09-.09a2 2 0 010-3.82L4 10a1.65 1.65 0 00.6-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-.6l.09-.09a2 2 0 013.82 0L14 4a1.65 1.65 0 001 .6 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9c0 .38.22.73.6 1l.09.09a2 2 0 010 3.82l-.09.09a1.65 1.65 0 00-.6 1z',
  video: 'M15 10l4.55-2.28A1 1 0 0121 8.62v6.76a1 1 0 01-1.45.9L15 14M4 6h9a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z'
};

export function SidebarIcon({ name }) {
  return (
    <svg className="dash-sidebar-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPaths[name] || iconPaths.grid} />
    </svg>
  );
}

export default function DashboardSidebar({ title, subtitle, navItems, actions = [] }) {
  const [collapsed, setCollapsed] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  ));

  return (
    <aside className={`dash-sidebar ${collapsed ? 'is-collapsed' : ''}`}>
      <button
        type="button"
        className="dash-sidebar-toggle"
        onClick={() => setCollapsed((value) => !value)}
        title={collapsed ? 'Show sidebar' : 'Hide sidebar'}
        aria-label={collapsed ? 'Show sidebar' : 'Hide sidebar'}
      >
        <SidebarIcon name="menu" />
      </button>

      <div className="dash-sidebar-brand">
        <span className="dash-sidebar-mark">{title?.charAt(0) || 'D'}</span>
        <div className="dash-sidebar-label">
          <p>{title}</p>
          <span>{subtitle}</span>
        </div>
      </div>

      <nav className="dash-sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={item.onClick}
            className={`dash-sidebar-item ${item.active ? 'is-active' : ''}`}
            title={item.label}
          >
            <SidebarIcon name={item.icon} />
            <span className="dash-sidebar-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="dash-sidebar-actions">
        {actions.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={item.onClick}
            className={`dash-sidebar-item ${item.danger ? 'is-danger' : ''}`}
            title={item.label}
          >
            <SidebarIcon name={item.icon} />
            <span className="dash-sidebar-label">{item.label}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
