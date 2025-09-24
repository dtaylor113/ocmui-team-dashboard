import React from 'react';

interface EmptyStateProps {
  message: string;
  className?: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({ message, className = "content-placeholder" }) => {
  return (
    <div className={className}>
      {message}
    </div>
  );
};

export default EmptyState;
