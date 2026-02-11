import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useEpics, useJiraTicket, useJiraChildIssues, useUpdateJiraField, useLastUpdatedFormat } from '../hooks/useApiQueries';
import { PriorityIcon } from '../utils/priorityIcons';

// Custom field IDs
const MARKETING_IMPACT_NOTES_FIELD = 'customfield_12319289';
const TARGET_END_FIELD = 'customfield_12313942';

// Edit Marketing Impact Notes Modal
interface EditNotesModalProps {
  isOpen: boolean;
  issueKey: string;
  currentValue: string;
  onClose: () => void;
  onSave: (value: string) => void;
  isSaving: boolean;
}

const EditNotesModal: React.FC<EditNotesModalProps> = ({ 
  isOpen, 
  issueKey, 
  currentValue, 
  onClose, 
  onSave,
  isSaving 
}) => {
  const [value, setValue] = useState(currentValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setValue(currentValue);
  }, [currentValue, isOpen]);

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && e.metaKey) {
      handleSave();
    }
  };

  return (
    <div className="edit-notes-modal-overlay" onClick={onClose}>
      <div className="edit-notes-modal" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="edit-notes-modal-header">
          <h3>Edit Marketing Impact Notes</h3>
          <span className="edit-notes-modal-issue">{issueKey}</span>
        </div>
        <div className="edit-notes-modal-body">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Enter marketing impact notes..."
            rows={6}
            disabled={isSaving}
          />
        </div>
        <div className="edit-notes-modal-footer">
          <span className="edit-notes-hint">⌘+Enter to save</span>
          <div className="edit-notes-modal-buttons">
            <button 
              className="edit-notes-btn edit-notes-btn-cancel" 
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button 
              className="edit-notes-btn edit-notes-btn-save" 
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Edit Target End Date Modal
interface EditDateModalProps {
  isOpen: boolean;
  issueKey: string;
  currentDate: string | null;
  onClose: () => void;
  onSave: (value: string) => void;
  isSaving: boolean;
}

const EditDateModal: React.FC<EditDateModalProps> = ({ 
  isOpen, 
  issueKey, 
  currentDate, 
  onClose, 
  onSave,
  isSaving 
}) => {
  // Convert JIRA date format (YYYY-MM-DD) to input date format
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    if (!currentDate) return '';
    // Handle both ISO format and YYYY-MM-DD format
    const date = new Date(currentDate);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
  });

  useEffect(() => {
    if (currentDate) {
      const date = new Date(currentDate);
      if (!isNaN(date.getTime())) {
        setSelectedDate(date.toISOString().split('T')[0]);
      }
    } else {
      setSelectedDate('');
    }
  }, [currentDate, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    // Send date in YYYY-MM-DD format for JIRA
    onSave(selectedDate);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && e.metaKey) {
      handleSave();
    }
  };

  // Format the selected date for display
  const formatDisplayDate = (dateStr: string): string => {
    if (!dateStr) return 'No date selected';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  return (
    <div className="edit-date-modal-overlay" onClick={onClose}>
      <div className="edit-date-modal" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="edit-date-modal-header">
          <h3>Edit Target End Date</h3>
          <span className="edit-date-modal-issue">{issueKey}</span>
        </div>
        <div className="edit-date-modal-body">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            disabled={isSaving}
            className="edit-date-input"
          />
          <div className="edit-date-preview">
            {formatDisplayDate(selectedDate)}
          </div>
        </div>
        <div className="edit-date-modal-footer">
          <div className="edit-date-modal-buttons">
            <button 
              className="edit-date-btn edit-date-btn-cancel" 
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button 
              className="edit-date-btn edit-date-btn-save" 
              onClick={handleSave}
              disabled={isSaving || !selectedDate}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

type FilterType = 'in-progress' | 'planning' | 'all' | 'blocked';
type SortField = 'priority' | 'key' | 'summary' | 'status' | 'assignee' | 'targetEnd' | 'parentTargetEnd';
type SortDirection = 'asc' | 'desc';

// Priority order for sorting
const priorityOrder: Record<string, number> = {
  'BLOCKER': 0,
  'CRITICAL': 1,
  'MAJOR': 2,
  'NORMAL': 3,
  'MINOR': 4,
  'UNDEFINED': 5,
  'NONE': 5
};

// Format date for last updated - always show full date
const formatRelativeTime = (dateStr: string | null): string => {
  if (!dateStr) return '—';
  
  const date = new Date(dateStr);
  const now = new Date();
  
  // Include year if different from current year
  const sameYear = date.getFullYear() === now.getFullYear();
  if (sameYear) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
};

// Format last updated as two lines: "Last updated by <name>" and "<time>"
const formatLastUpdatedLines = (dateStr: string | null, updatedBy: string | null): { line1: string; line2: string } | null => {
  if (!dateStr) return null;
  
  const timeAgo = formatRelativeTime(dateStr);
  const firstName = updatedBy ? updatedBy.split(' ')[0] : 'unknown';
  
  return {
    line1: `Last updated by ${firstName}`,
    line2: timeAgo
  };
};

// Shorter format for table cells where column header already indicates "Last Updated"
const formatLastUpdatedShort = (dateStr: string | null, updatedBy: string | null): string => {
  if (!dateStr) return '—';
  
  const timeAgo = formatRelativeTime(dateStr);
  
  if (updatedBy) {
    const firstName = updatedBy.split(' ')[0];
    return `${firstName}, ${timeAgo}`;
  }
  return timeAgo;
};

// Child issues row component
const EpicChildIssues: React.FC<{ parentKey: string }> = ({ parentKey }) => {
  const { data, isLoading, error } = useJiraChildIssues(parentKey);

  if (isLoading) return <div className="epics-children-loading">Loading child issues...</div>;
  if (error) return <div className="epics-children-error">Failed to load child issues</div>;
  if (!data?.success || !data.issues?.length) return <div className="epics-children-empty">No child issues</div>;

  return (
    <div className="epics-children-table-wrapper">
      <table className="epics-children-table">
        <thead>
          <tr>
            <th>Key</th>
            <th>Summary</th>
            <th>Type</th>
            <th>Status</th>
            <th>Assignee</th>
            <th>Last Updated</th>
          </tr>
        </thead>
        <tbody>
          {data.issues.map((issue: any) => (
            <tr key={issue.key}>
              <td className="epics-child-key">
                <a
                  href={`https://issues.redhat.com/browse/${issue.key}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="epics-link"
                >
                  {issue.key}
                </a>
              </td>
              <td className="epics-child-summary" title={issue.summary}>
                {issue.summary}
              </td>
              <td className="epics-child-type">
                <span className={`epics-type-badge epics-type-${issue.type?.toLowerCase().replace(/\s+/g, '-')}`}>
                  {issue.type}
                </span>
              </td>
              <td className="epics-child-status">
                <span className={`epics-status-badge epics-status-${issue.status?.toLowerCase().replace(/\s+/g, '-')}`}>
                  {issue.status}
                </span>
              </td>
              <td className="epics-child-assignee">{issue.assignee || 'Unassigned'}</td>
              <td className="epics-child-updated" title={issue.updated ? new Date(issue.updated).toLocaleString() : ''}>
                {formatLastUpdatedShort(issue.updated, issue.lastUpdatedBy)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Parent info component - fetches and displays parent key + status + last updated
const ParentInfo: React.FC<{ parentKey: string | null; featureKey: string | null }> = ({ parentKey, featureKey }) => {
  const effectiveKey = featureKey || parentKey;
  const { data, isLoading } = useJiraTicket(effectiveKey || '');
  
  if (!effectiveKey) return <span className="epics-no-parent">—</span>;
  if (isLoading) return <span className="epics-parent-loading">...</span>;
  
  const summary = data?.ticket?.summary;
  const status = data?.ticket?.status;
  const updated = data?.ticket?.updated;
  const lastUpdatedBy = data?.ticket?.lastUpdatedBy;
  const resolutionDate = data?.ticket?.resolutionDate;
  const resolution = data?.ticket?.resolution;
  const isClosed = status?.toLowerCase() === 'closed';
  
  return (
    <div className="epics-parent-info">
      <a
        href={`https://issues.redhat.com/browse/${effectiveKey}`}
        target="_blank"
        rel="noopener noreferrer"
        className="epics-link"
        title={summary ? `${effectiveKey}: ${summary}` : effectiveKey}
      >
        {effectiveKey}
      </a>
      {status && (
        <span 
          className="epics-parent-status"
          style={{ backgroundColor: getStatusColor(status) }}
        >
          {status}
        </span>
      )}
      {updated && (() => {
        const lines = formatLastUpdatedLines(updated, lastUpdatedBy);
        return lines ? (
          <div className="epics-last-updated" title={new Date(updated).toLocaleString()}>
            <div className="updated-line1">{lines.line1}</div>
            <div className="updated-line2">{lines.line2}</div>
          </div>
        ) : null;
      })()}
      {isClosed && resolutionDate && (
        <div className="epics-parent-closed-info">
          <span className="closed-date">Closed: {formatDate(resolutionDate)}</span>
          {resolution && <span className="closed-resolution">({resolution})</span>}
        </div>
      )}
    </div>
  );
};

// Parent target end component - shows parent's target end date
const ParentTargetEnd: React.FC<{ parentKey: string | null; featureKey: string | null }> = ({ parentKey, featureKey }) => {
  const effectiveKey = featureKey || parentKey;
  const { data, isLoading } = useJiraTicket(effectiveKey || '');
  
  if (!effectiveKey) return null;
  if (isLoading) return <span className="epics-parent-target-loading">...</span>;
  
  const targetEnd = data?.ticket?.duedate;
  if (!targetEnd) return null;
  
  return (
    <span className="epics-parent-target-end">
      {formatDate(targetEnd)} (Parent)
    </span>
  );
};

// Utility functions
const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  const now = new Date();
  // Include year only if different from current year
  const sameYear = date.getFullYear() === now.getFullYear();
  if (sameYear) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
};

const getTargetEndColor = (dateStr: string | null): string | null => {
  if (!dateStr) return null;
  const due = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDateOnly = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffTime = dueDateOnly.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) return '#ef4444'; // Overdue - red
  if (diffDays <= 7) return '#ea580c'; // Due within 7 days - orange
  if (diffDays <= 21) return '#eab308'; // Due within 21 days - yellow
  return '#9ca3af'; // Future (>21 days) - gray
};

const getStatusColor = (status: string): string => {
  const s = status?.toUpperCase().replace(/\s+/g, '_') || '';
  switch (s) {
    case 'TO_DO':
    case 'TODO':
    case 'OPEN':
      return '#42526E';
    case 'IN_PROGRESS':
      return '#0052CC';
    case 'CODE_REVIEW':
    case 'IN_REVIEW':
    case 'REVIEW':
      return '#0052CC';
    case 'REFINEMENT':
      return '#6554C0';
    case 'DONE':
    case 'RESOLVED':
    case 'CLOSED':
      return '#00875A';
    case 'BLOCKED':
      return '#EF4444';
    default:
      return '#6b7280';
  }
};

// Main component
const EpicsPanel: React.FC = () => {
  const [filter, setFilter] = useState<FilterType>('in-progress');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('targetEnd');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({
    priority: 36,
    key: 130,
    summary: 380,
    status: 95,
    assignee: 110,
    targetEnd: 140,
    parent: 160,
    marketingNotes: 320
  });
  const [resizing, setResizing] = useState<{ column: string; startX: number; startWidth: number } | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  
  // Edit notes modal state
  const [editNotesModal, setEditNotesModal] = useState<{ isOpen: boolean; issueKey: string; currentValue: string }>({
    isOpen: false,
    issueKey: '',
    currentValue: ''
  });
  
  // Edit target end date modal state
  const [editDateModal, setEditDateModal] = useState<{ isOpen: boolean; issueKey: string; currentDate: string | null }>({
    isOpen: false,
    issueKey: '',
    currentDate: null
  });

  // Fetch epics data
  const { data, isLoading, error, refetch, dataUpdatedAt, isFetching } = useEpics(filter);
  const lastUpdated = useLastUpdatedFormat(dataUpdatedAt);
  
  // Mutation for updating fields
  const updateFieldMutation = useUpdateJiraField();

  // Handle column resize
  const handleResizeStart = useCallback((column: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing({
      column,
      startX: e.clientX,
      startWidth: columnWidths[column] || 100
    });
  }, [columnWidths]);

  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - resizing.startX;
      const newWidth = Math.max(50, resizing.startWidth + diff);
      setColumnWidths(prev => ({ ...prev, [resizing.column]: newWidth }));
    };

    const handleMouseUp = () => {
      setResizing(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing]);

  // Sort and filter epics
  const sortedEpics = useMemo(() => {
    if (!data?.epics) return [];
    
    let epics = [...data.epics];
    
    // Apply status filter if set
    if (statusFilter) {
      epics = epics.filter(epic => epic.status === statusFilter);
    }
    
    epics.sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'priority':
          const aPriority = priorityOrder[a.priority?.toUpperCase()] ?? 5;
          const bPriority = priorityOrder[b.priority?.toUpperCase()] ?? 5;
          comparison = aPriority - bPriority;
          break;
        case 'key':
          comparison = a.key.localeCompare(b.key);
          break;
        case 'summary':
          comparison = (a.summary || '').localeCompare(b.summary || '');
          break;
        case 'status':
          comparison = (a.status || '').localeCompare(b.status || '');
          break;
        case 'assignee':
          comparison = (a.assignee || 'ZZZ').localeCompare(b.assignee || 'ZZZ');
          break;
        case 'targetEnd':
          const aDate = a.targetEnd ? new Date(a.targetEnd).getTime() : Infinity;
          const bDate = b.targetEnd ? new Date(b.targetEnd).getTime() : Infinity;
          comparison = aDate - bDate;
          break;
        default:
          comparison = 0;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    
    return epics;
  }, [data?.epics, sortField, sortDirection, statusFilter]);

  // Compute status counts for the current filtered view (before status filter, must be before early returns).
  // Exclude Closed so we don't show a Closed filter button (we don't care about blocked closed tickets).
  const statusCounts = useMemo(() => {
    if (!data?.epics) return [];
    const counts: Record<string, number> = {};
    data.epics.forEach(epic => {
      const status = epic.status || 'Unknown';
      if (status === 'Closed') return;
      counts[status] = (counts[status] || 0) + 1;
    });
    // Sort by count descending
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([status, count]) => ({ status, count }));
  }, [data?.epics]);

  // Clear status filter if it was Closed (we no longer show the Closed filter button)
  useEffect(() => {
    if (statusFilter === 'Closed') setStatusFilter(null);
  }, [statusFilter]);

  // Handle sort click
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Toggle row expansion
  const toggleRowExpansion = (key: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Open edit notes modal
  const openEditNotesModal = (issueKey: string, currentValue: string) => {
    setEditNotesModal({
      isOpen: true,
      issueKey,
      currentValue: currentValue || ''
    });
  };

  // Close edit notes modal
  const closeEditNotesModal = () => {
    setEditNotesModal({ isOpen: false, issueKey: '', currentValue: '' });
  };

  // Save notes
  const handleSaveNotes = async (value: string) => {
    try {
      await updateFieldMutation.mutateAsync({
        issueKey: editNotesModal.issueKey,
        fieldId: MARKETING_IMPACT_NOTES_FIELD,
        value: value || null
      });
      closeEditNotesModal();
    } catch (error) {
      console.error('Failed to save notes:', error);
      alert(`Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Open edit date modal
  const openEditDateModal = (issueKey: string, currentDate: string | null) => {
    setEditDateModal({
      isOpen: true,
      issueKey,
      currentDate
    });
  };

  // Close edit date modal
  const closeEditDateModal = () => {
    setEditDateModal({ isOpen: false, issueKey: '', currentDate: null });
  };

  // Save target end date
  const handleSaveDate = async (value: string) => {
    try {
      await updateFieldMutation.mutateAsync({
        issueKey: editDateModal.issueKey,
        fieldId: TARGET_END_FIELD,
        value: value || null
      });
      closeEditDateModal();
    } catch (error) {
      console.error('Failed to save date:', error);
      alert(`Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Render sort indicator
  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) return <span className="epics-sort-indicator">⇅</span>;
    return <span className="epics-sort-indicator active">{sortDirection === 'asc' ? '↑' : '↓'}</span>;
  };

  // Loading state
  if (isLoading && !data) {
    return (
      <div className="epics-panel">
        <div className="epics-loading">
          <div className="epics-loading-spinner"></div>
          <p>Loading Epics from JIRA...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="epics-panel">
        <div className="epics-error">
          <div className="epics-error-icon">❌</div>
          <h3>Error Loading Epics</h3>
          <p>{error instanceof Error ? error.message : 'Failed to load epics'}</p>
          <button className="epics-retry-btn" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const showBlockedReason = filter === 'blocked';
  const showClosedInfo = statusFilter === 'Closed';

  return (
    <div className={`epics-panel ${resizing ? 'resizing' : ''}`}>
      {/* Header */}
      <div className="epics-header">
        <div className="epics-header-title">
          <h2>OCMUI Team - Active Epics</h2>
          <span className="epics-count">{sortedEpics.length} epics</span>
        </div>
        <div className="epics-header-actions">
          <span className="epics-last-updated">
            Last Updated: {lastUpdated}
            {isFetching && <span className="epics-refreshing"> (refreshing...)</span>}
          </span>
          <button 
            className="epics-refresh-btn" 
            onClick={() => refetch()} 
            disabled={isFetching}
            title="Refresh"
          >
            🔄
          </button>
        </div>
      </div>

      {/* Filter buttons */}
      <div className="epics-filters">
        <button
          className={`epics-filter-btn ${filter === 'in-progress' ? 'active' : ''}`}
          onClick={() => { setFilter('in-progress'); setStatusFilter(null); }}
        >
          In-Progress
        </button>
        <button
          className={`epics-filter-btn ${filter === 'planning' ? 'active' : ''}`}
          onClick={() => { setFilter('planning'); setStatusFilter(null); }}
        >
          Planning
        </button>
        <button
          className={`epics-filter-btn ${filter === 'blocked' ? 'active' : ''}`}
          onClick={() => { setFilter('blocked'); setStatusFilter(null); }}
        >
          Blocked
        </button>
        <button
          className={`epics-filter-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => { setFilter('all'); setStatusFilter(null); }}
        >
          All
        </button>
      </div>

      {/* Status summary badges - clickable filters. Inactive = gray, active = magenta. */}
      {statusCounts.length > 0 && (
        <div className="epics-status-summary">
          {statusCounts.map(({ status, count }) => (
            <button 
              key={status} 
              className={`epics-status-count-badge ${statusFilter === status ? 'active' : ''}`}
              onClick={() => setStatusFilter(statusFilter === status ? null : status)}
              title={statusFilter === status ? 'Clear filter' : `Filter by ${status}`}
            >
              {status}: {count}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="epics-table-container">
        <table className="epics-table" ref={tableRef}>
          <thead>
            <tr>
              <th className="epics-th-expand" style={{ width: 40 }}></th>
              <th 
                className="epics-th-sortable" 
                style={{ width: columnWidths.priority }}
                onClick={() => handleSort('priority')}
              >
                P {renderSortIndicator('priority')}
                <div 
                  className="epics-resize-handle" 
                  onMouseDown={(e) => handleResizeStart('priority', e)}
                />
              </th>
              <th 
                className="epics-th-sortable" 
                style={{ width: columnWidths.key }}
                onClick={() => handleSort('key')}
              >
                Key {renderSortIndicator('key')}
                <div 
                  className="epics-resize-handle" 
                  onMouseDown={(e) => handleResizeStart('key', e)}
                />
              </th>
              <th 
                className="epics-th-sortable" 
                style={{ width: columnWidths.summary }}
                onClick={() => handleSort('summary')}
              >
                Summary {renderSortIndicator('summary')}
                <div 
                  className="epics-resize-handle" 
                  onMouseDown={(e) => handleResizeStart('summary', e)}
                />
              </th>
              <th 
                className="epics-th-sortable" 
                style={{ width: columnWidths.status }}
                onClick={() => handleSort('status')}
              >
                Status {renderSortIndicator('status')}
                <div 
                  className="epics-resize-handle" 
                  onMouseDown={(e) => handleResizeStart('status', e)}
                />
              </th>
              <th 
                className="epics-th-sortable" 
                style={{ width: columnWidths.assignee }}
                onClick={() => handleSort('assignee')}
              >
                Assignee {renderSortIndicator('assignee')}
                <div 
                  className="epics-resize-handle" 
                  onMouseDown={(e) => handleResizeStart('assignee', e)}
                />
              </th>
              <th 
                className="epics-th-sortable" 
                style={{ width: columnWidths.targetEnd }}
                onClick={() => handleSort('targetEnd')}
              >
                Target End {renderSortIndicator('targetEnd')}
                <div 
                  className="epics-resize-handle" 
                  onMouseDown={(e) => handleResizeStart('targetEnd', e)}
                />
              </th>
              {showClosedInfo && (
                <>
                  <th style={{ width: 100 }}>Closed Date</th>
                  <th style={{ width: 100 }}>Resolution</th>
                </>
              )}
              <th style={{ width: columnWidths.parent }}>
                Parent
                <div 
                  className="epics-resize-handle" 
                  onMouseDown={(e) => handleResizeStart('parent', e)}
                />
              </th>
              {!showBlockedReason && (
                <th style={{ width: columnWidths.marketingNotes }}>
                  Marketing Impact Notes
                  <div 
                    className="epics-resize-handle" 
                    onMouseDown={(e) => handleResizeStart('marketingNotes', e)}
                  />
                </th>
              )}
              {showBlockedReason && (
                <th style={{ width: 250 }}>
                  Blocked Reason
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {sortedEpics.length === 0 ? (
              <tr>
                <td colSpan={showClosedInfo ? 11 : 9} className="epics-empty">
                  No epics found
                </td>
              </tr>
            ) : (
              sortedEpics.map((epic) => {
                const isExpanded = expandedRows.has(epic.key);
                const targetEndColor = getTargetEndColor(epic.targetEnd);
                
                return (
                  <React.Fragment key={epic.key}>
                    <tr className={`epics-row ${isExpanded ? 'expanded' : ''}`}>
                      <td className="epics-cell-expand">
                        <button
                          className="epics-expand-btn"
                          onClick={() => toggleRowExpansion(epic.key)}
                          title={isExpanded ? 'Collapse' : 'Expand to see child issues'}
                        >
                          {isExpanded ? '▼' : '▶'}
                        </button>
                      </td>
                      <td className="epics-cell-priority">
                        <PriorityIcon priority={epic.priority} />
                      </td>
                      <td className="epics-cell-key">
                        <a
                          href={`https://issues.redhat.com/browse/${epic.key}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="epics-link epics-key-link"
                        >
                          {epic.key}
                        </a>
                        {epic.updated && (() => {
                          const lines = formatLastUpdatedLines(epic.updated, epic.lastUpdatedBy);
                          return lines ? (
                            <div className="epics-last-updated" title={new Date(epic.updated).toLocaleString()}>
                              <div className="updated-line1">{lines.line1}</div>
                              <div className="updated-line2">{lines.line2}</div>
                            </div>
                          ) : null;
                        })()}
                      </td>
                      <td className="epics-cell-summary" style={{ maxWidth: columnWidths.summary }}>
                        <span className="epics-summary-text" title={epic.summary}>
                          {epic.summary}
                        </span>
                      </td>
                      <td className="epics-cell-status">
                        <span 
                          className="epics-status-badge"
                          style={{ backgroundColor: getStatusColor(epic.status) }}
                        >
                          {epic.status}
                        </span>
                      </td>
                      <td className="epics-cell-assignee">
                        {epic.assignee || 'Unassigned'}
                      </td>
                      <td className="epics-cell-target-end">
                        <div className="epics-target-end-container">
                          <div className="epics-target-end-row">
                            <span style={{ color: targetEndColor || undefined }}>
                              {formatDate(epic.targetEnd)}
                            </span>
                            <button
                              className="epics-edit-date-btn"
                              onClick={() => openEditDateModal(epic.key, epic.targetEnd)}
                              title="Edit Target End Date"
                            >
                              ✏️
                            </button>
                          </div>
                          <ParentTargetEnd parentKey={epic.parentKey} featureKey={epic.featureKey} />
                        </div>
                      </td>
                      {showClosedInfo && (
                        <>
                          <td className="epics-cell-closed-date">
                            {formatDate(epic.resolutionDate)}
                          </td>
                          <td className="epics-cell-resolution">
                            <span className="epics-resolution-badge">
                              {epic.resolution || '—'}
                            </span>
                          </td>
                        </>
                      )}
                      <td className="epics-cell-parent">
                        <ParentInfo parentKey={epic.parentKey} featureKey={epic.featureKey} />
                      </td>
                      {!showBlockedReason && (
                        <td className="epics-cell-notes">
                          <div className="epics-notes-wrapper">
                            <div className="epics-notes-content">
                              {epic.marketingImpactNotes || '—'}
                            </div>
                            <button
                              className="epics-edit-notes-btn"
                              onClick={() => openEditNotesModal(epic.key, epic.marketingImpactNotes || '')}
                              title="Edit Marketing Impact Notes"
                            >
                              ✏️
                            </button>
                          </div>
                        </td>
                      )}
                      {showBlockedReason && (
                        <td className="epics-cell-blocked">
                          <div className="epics-notes-wrapper">
                            <div className="epics-blocked-content">
                              {epic.blockedReason || '—'}
                            </div>
                            <button
                              className="epics-edit-notes-btn"
                              onClick={() => openEditNotesModal(epic.key, epic.marketingImpactNotes || '')}
                              title="Edit Marketing Impact Notes"
                            >
                              ✏️
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                    {isExpanded && (
                      <tr className="epics-expanded-row">
                        <td colSpan={showClosedInfo ? 11 : 9}>
                          <div className="epics-children-container">
                            <div className="epics-children-label">Child Issues</div>
                            <div className="epics-children-content">
                              <EpicChildIssues parentKey={epic.key} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      
      {/* Edit Marketing Impact Notes Modal */}
      <EditNotesModal
        isOpen={editNotesModal.isOpen}
        issueKey={editNotesModal.issueKey}
        currentValue={editNotesModal.currentValue}
        onClose={closeEditNotesModal}
        onSave={handleSaveNotes}
        isSaving={updateFieldMutation.isPending}
      />
      
      {/* Edit Target End Date Modal */}
      <EditDateModal
        isOpen={editDateModal.isOpen}
        issueKey={editDateModal.issueKey}
        currentDate={editDateModal.currentDate}
        onClose={closeEditDateModal}
        onSave={handleSaveDate}
        isSaving={updateFieldMutation.isPending}
      />
    </div>
  );
};

export default EpicsPanel;
