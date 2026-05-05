import React from 'react';

export default function PageTitle({ first, second, eyebrow, children, className = '' }) {
  return (
    <header className={`page-title ${className}`}>
      {eyebrow && <p className="page-title-eyebrow">{eyebrow}</p>}
      <h1>
        <span>{first}</span>
        {second && <span className="page-title-accent"> {second}</span>}
      </h1>
      {children && <p className="page-title-copy">{children}</p>}
    </header>
  );
}
