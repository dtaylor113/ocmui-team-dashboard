import React from 'react';

// JIRA priority colors (official palette)
export const priorityColors: Record<string, string> = {
  BLOCKER: '#cc0000',   // Red
  CRITICAL: '#d04437',  // Red-orange
  MAJOR: '#e97f33',     // Orange
  NORMAL: '#707070',    // Gray (sometimes shown as green bars)
  MINOR: '#2a8735',     // Green
  TRIVIAL: '#4a6785',   // Blue-gray
  UNDEFINED: '#707070',
  NONE: '#707070',
};

export const getPriorityColor = (priority: string): string => {
  const p = priority?.toUpperCase() || 'NORMAL';
  return priorityColors[p] || priorityColors.NORMAL;
};

// SVG Priority Icons matching official JIRA style
export const PriorityIcon: React.FC<{ priority: string; size?: number }> = ({ priority, size = 16 }) => {
  const p = priority?.toUpperCase() || 'NORMAL';
  const label = `Priority: ${priority}`;
  
  // Blocker: Red circle with minus sign
  if (p === 'BLOCKER') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-label={label} role="img">
        <title>{label}</title>
        <circle cx="8" cy="8" r="7" fill="#cc0000" />
        <rect x="4" y="7" width="8" height="2" fill="white" rx="0.5" />
      </svg>
    );
  }
  
  // Critical: Red double chevron up
  if (p === 'CRITICAL') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-label={label} role="img">
        <title>{label}</title>
        <path d="M3 10L8 5L13 10" stroke="#d04437" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 14L8 9L13 14" stroke="#d04437" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  
  // Major: Orange single chevron up
  if (p === 'MAJOR') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-label={label} role="img">
        <title>{label}</title>
        <path d="M3 11L8 5L13 11" stroke="#e97f33" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  
  // Normal: Horizontal bars (equals sign style)
  if (p === 'NORMAL' || p === 'UNDEFINED' || p === 'NONE') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-label={label} role="img">
        <title>{label}</title>
        <rect x="3" y="5" width="10" height="2" fill="#707070" rx="0.5" />
        <rect x="3" y="9" width="10" height="2" fill="#707070" rx="0.5" />
      </svg>
    );
  }
  
  // Minor: Green single chevron down
  if (p === 'MINOR') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-label={label} role="img">
        <title>{label}</title>
        <path d="M3 5L8 11L13 5" stroke="#2a8735" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  
  // Trivial: Blue double chevron down
  if (p === 'TRIVIAL') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-label={label} role="img">
        <title>{label}</title>
        <path d="M3 2L8 7L13 2" stroke="#4a6785" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 7L8 12L13 7" stroke="#4a6785" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  
  // Default fallback
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-label={label} role="img">
      <title>{label}</title>
      <rect x="3" y="5" width="10" height="2" fill="#707070" rx="0.5" />
      <rect x="3" y="9" width="10" height="2" fill="#707070" rx="0.5" />
    </svg>
  );
};

// Legacy function for backwards compatibility (returns React element)
export const renderPriorityIcon = (priority: string, size?: number): React.ReactNode => {
  return <PriorityIcon priority={priority} size={size} />;
};
