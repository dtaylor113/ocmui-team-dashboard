import React, { useState, useEffect } from 'react';

interface CollapsibleSectionProps {
  title: string;
  isExpandedByDefault?: boolean;
  onToggle?: (isExpanded: boolean) => void;
  children: React.ReactNode;
  className?: string;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  isExpandedByDefault = false,
  onToggle,
  children,
  className = ''
}) => {
  const [isExpanded, setIsExpanded] = useState(isExpandedByDefault);

  useEffect(() => {
    setIsExpanded(isExpandedByDefault);
  }, [isExpandedByDefault]);

  const handleToggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    const newExpandedState = !isExpanded;
    setIsExpanded(newExpandedState);
    if (onToggle) {
      onToggle(newExpandedState);
    }
    // Remove focus immediately after click to prevent persistent selection state
    event.currentTarget.blur();
  };

  return (
    <div className={`collapsible-section ${className}`}>
      <button 
        className="collapsible-section-header"
        onClick={handleToggle}
        aria-expanded={isExpanded}
      >
        <span className="collapsible-section-title">{title}</span>
                <span className={`collapsible-section-arrow ${isExpanded ? 'expanded' : 'collapsed'}`}>
                  ▶
                </span>
      </button>
      
      {isExpanded && (
        <div className="collapsible-section-content">
          {children}
        </div>
      )}
    </div>
  );
};

export default CollapsibleSection;
