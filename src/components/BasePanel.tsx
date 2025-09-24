import React from 'react';

interface BasePanelProps {
  title: string;
  icon: string;
  iconAlt: string;
  lastUpdated?: string;
  updateInterval?: string;
  isConfigured?: boolean;
  isLoading?: boolean;
  error?: Error | null;
  emptyMessage?: string;
  loadingMessage?: string;
  headerControls?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

const BasePanel: React.FC<BasePanelProps> = ({
  title,
  icon,
  iconAlt,
  lastUpdated,
  updateInterval,
  isConfigured = true,
  isLoading = false,
  error = null,
  emptyMessage = 'No data available',
  loadingMessage = 'Loading...',
  headerControls,
  children,
  className = ''
}) => {
  const hasContent = React.Children.count(children) > 0;

  return (
    <div className={`panel-content ${className}`.trim()}>
      <div className="panel-header">
        <h3>
          <img src={icon} alt={iconAlt} className="panel-icon" /> 
          {title}
        </h3>
        {headerControls}
        {lastUpdated && (
          <span className="last-updated">
            Last Updated: {lastUpdated}
            {updateInterval && ` • updates every ${updateInterval}`}
          </span>
        )}
      </div>
      
      <div className="panel-body">
        {!isConfigured ? (
          <div className="empty-state">
            <p>⚙️ Configure GitHub and JIRA tokens in Settings to view data</p>
          </div>
        ) : isLoading ? (
          <div className="loading">
            {loadingMessage}
          </div>
        ) : error ? (
          <div className="error-state">
            <p>❌ {error.message}</p>
          </div>
        ) : hasContent ? (
          children
        ) : (
          <div className="empty-state">
            <p>{emptyMessage}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default BasePanel;
