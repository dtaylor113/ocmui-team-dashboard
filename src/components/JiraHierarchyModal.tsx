import React, { useEffect, useState } from 'react';
import { useJiraTicket } from '../hooks/useApiQueries';
import { useSettings } from '../contexts/SettingsContext';
import { formatJiraTimestamp } from '../utils/formatting';
import { PriorityIcon, getPriorityColor } from '../utils/priorityIcons';

interface JiraTicket {
  key: string;
  summary: string;
  description?: string;
  status: string;
  priority: string;
  assignee: string;
  reporter: string;
  type: string;
  created: string;
  updated: string;
  duedate?: string | null;
  sprint?: string;
}

interface JiraHierarchyNode {
  ticket: JiraTicket;
  parentKey?: string | null;
  epicKey?: string | null;
  featureKey?: string | null;
  level: number;
}

interface JiraHierarchyModalProps {
  jiraKey: string;
  isOpen: boolean;
  onClose: () => void;
}

const JiraHierarchyModal: React.FC<JiraHierarchyModalProps> = ({ jiraKey, isOpen, onClose }) => {
  const [hierarchyChain, setHierarchyChain] = useState<JiraHierarchyNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { userPreferences } = useSettings(); // apiTokens not needed - server provides JIRA token

  // Fetch the initial ticket
  const { data: initialTicketData } = useJiraTicket(jiraKey);

  useEffect(() => {
    if (!isOpen || !initialTicketData?.success || !initialTicketData?.ticket) {
      return;
    }

    const buildHierarchy = async () => {
      setIsLoading(true);
      const chain: JiraHierarchyNode[] = [];
      
      // Start with the current ticket
      let currentTicket = initialTicketData.ticket;
      let currentKey = jiraKey;
      let level = 0;
      
      // Build chain by following parent links up
      const seenKeys = new Set<string>();
      seenKeys.add(currentKey);
      
      // Add current ticket to chain
      chain.push({
        ticket: currentTicket,
        parentKey: initialTicketData.ticket.parentKey,
        epicKey: initialTicketData.ticket.epicKey,
        featureKey: initialTicketData.ticket.featureKey,
        level: level
      });

      // Recursively fetch parents
      let parentKey = initialTicketData.ticket.parentKey || initialTicketData.ticket.epicKey || initialTicketData.ticket.featureKey;
      
      while (parentKey && !seenKeys.has(parentKey)) {
        seenKeys.add(parentKey);
        level++;
        
        try {
          const response = await fetch('/api/jira-ticket', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jiraId: parentKey,
              token: '' // Server provides token
            })
          });

          if (response.ok) {
            const parentData = await response.json();
            if (parentData.success && parentData.ticket) {
              chain.push({
                ticket: parentData.ticket,
                parentKey: parentData.ticket.parentKey,
                epicKey: parentData.ticket.epicKey,
                featureKey: parentData.ticket.featureKey,
                level: level
              });
              
              // Continue up the chain
              parentKey = parentData.ticket.parentKey || parentData.ticket.epicKey || parentData.ticket.featureKey;
            } else {
              break;
            }
          } else {
            break;
          }
        } catch (error) {
          console.error('Error fetching parent JIRA:', error);
          break;
        }
      }

      // Reverse to show oldest ancestor at top
      setHierarchyChain(chain.reverse());
      setIsLoading(false);
    };

    buildHierarchy();
  }, [jiraKey, isOpen, initialTicketData]);

  if (!isOpen) return null;

  const getTypeColor = (type: string) => {
    switch (type.toUpperCase()) {
      case 'STORY': return '#22c55e';
      case 'TASK': return '#3b82f6';
      case 'BUG': return '#ef4444';
      case 'EPIC': return '#8b5cf6';
      case 'FEATURE': return '#f59e0b';
      case 'INITIATIVE': return '#ec4899';
      default: return '#6b7280';
    }
  };

  const getTypeIcon = (type: string): string => {
    switch (type.toUpperCase()) {
      case 'STORY': return '🟩';
      case 'TASK': return '🟦';
      case 'BUG': return '🐞';
      case 'EPIC': return '🟪';
      default: return '⬡';
    }
  };

  const getStatusColor = (status: string) => {
    const normalizedStatus = status.toUpperCase().replace(/\s+/g, '_');
    switch (normalizedStatus) {
      case 'TO_DO':
      case 'TODO':
      case 'OPEN':
        return '#42526E';
      case 'IN_PROGRESS':
      case 'IN PROGRESS':
        return '#0052CC';
      case 'CODE_REVIEW':
      case 'IN_REVIEW':
      case 'REVIEW':
        return '#0052CC';
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

  const toTitleCase = (value: string) => {
    if (!value) return '';
    return value
      .toString()
      .replace(/[_-]+/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const getDueDateColor = (duedate: string | null | undefined) => {
    if (!duedate) return null;
    
    const due = new Date(duedate);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dueDateOnly = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    
    const diffTime = dueDateOnly.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // Due this month (within 31 days) - orange
    if (diffDays <= 31 && diffDays >= 0) {
      return { border: '#ea580c', text: '#ea580c', background: '#000000' };
    }
    // Due next month (32-62 days) - yellow
    if (diffDays > 31 && diffDays <= 62) {
      return { border: '#eab308', text: '#eab308', background: '#000000' };
    }
    // Due in 1+ months - white text on black background
    if (diffDays > 62) {
      return { border: '#ffffff', text: '#ffffff', background: '#000000' };
    }
    // Overdue - red
    return { border: '#ef4444', text: '#ef4444', background: '#000000' };
  };

  const formatDueDate = (duedate: string | null | undefined) => {
    if (!duedate) return null;
    const due = new Date(duedate);
    return due.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      timeZone: userPreferences.timezone || 'UTC'
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content hierarchy-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>⧉ JIRA Hierarchy for {jiraKey}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        
        <div className="modal-body">
          {isLoading && hierarchyChain.length === 0 ? (
            <div className="loading">Loading Jira Cards...</div>
          ) : (
            <div className="hierarchy-tree">
              {hierarchyChain.map((node) => {
                const isSelected = node.ticket.key === jiraKey;
                const indentLevel = hierarchyChain.length - 1 - node.level;
                const dueDateColorInfo = getDueDateColor(node.ticket.duedate);
                const formattedDueDate = formatDueDate(node.ticket.duedate);
                
                // Debug logging
                if (node.ticket.duedate) {
                  console.log(`📅 Hierarchy: ${node.ticket.key} (${node.ticket.type}): duedate=${node.ticket.duedate}, formatted=${formattedDueDate}, color=${JSON.stringify(dueDateColorInfo)}`);
                } else {
                  console.log(`❌ Hierarchy: ${node.ticket.key} (${node.ticket.type}): NO DUE DATE`);
                }
                
                return (
                  <div 
                    key={node.ticket.key} 
                    className={`hierarchy-node ${isSelected ? 'selected' : ''}`}
                    style={{ 
                      marginLeft: `${indentLevel * 24}px`
                    }}
                  >
                    {/* Title */}
                    <div className="hierarchy-node-header">
                      <a 
                        href={`https://issues.redhat.com/browse/${node.ticket.key}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hierarchy-node-title"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {node.ticket.key}: {node.ticket.summary}
                      </a>
                    </div>
                    
                    {/* Badge Row */}
                    <div className="hierarchy-node-badges">
                      <span 
                        className="jira-badge jira-type" 
                        style={{ borderColor: getTypeColor(node.ticket.type) }}
                      >
                        <span className="jira-badge-icon" aria-hidden="true">{getTypeIcon(node.ticket.type)}</span>
                        {toTitleCase(node.ticket.type)}
                      </span>
                      
                      <span 
                        className="jira-badge jira-priority" 
                        style={{ borderColor: getPriorityColor(node.ticket.priority) }}
                      >
                        <PriorityIcon priority={node.ticket.priority} />
                        {toTitleCase(node.ticket.priority)}
                      </span>
                      
                      <span 
                        className="jira-badge jira-status" 
                        style={{ 
                          backgroundColor: getStatusColor(node.ticket.status),
                          borderColor: getStatusColor(node.ticket.status)
                        }}
                      >
                        {node.ticket.status.toUpperCase()}
                      </span>
                    </div>
                    
                    {/* Metadata Rows */}
                    <div className="hierarchy-node-metadata">
                      <div className="hierarchy-metadata-row">
                        <div className="hierarchy-field">
                          <span className="jira-field-label">Assignee:</span>
                          <span className="jira-field-value">{node.ticket.assignee || 'Unassigned'}</span>
                        </div>
                        <div className="hierarchy-field">
                          <span className="jira-field-label">Last Updated:</span>
                          <span className="jira-field-value">{formatJiraTimestamp(node.ticket.updated, userPreferences.timezone)}</span>
                        </div>
                      </div>
                      <div className="hierarchy-metadata-row">
                        <div className="hierarchy-field">
                          <span className="jira-field-label">Reporter:</span>
                          <span className="jira-field-value">{node.ticket.reporter || 'Unknown'}</span>
                        </div>
                        <div className="hierarchy-field">
                          <span className="jira-field-label">Created:</span>
                          <span className="jira-field-value">{formatJiraTimestamp(node.ticket.created, userPreferences.timezone)}</span>
                        </div>
                      </div>
                      {formattedDueDate && dueDateColorInfo && (
                        <div className="hierarchy-metadata-row">
                          <div className="hierarchy-field">
                            {/* Empty space to align with left column */}
                          </div>
                          <div className="hierarchy-field">
                            <span className="jira-field-label">Target End:</span>
                            <span 
                              className="jira-field-value hierarchy-target-end-value"
                              style={{ 
                                color: dueDateColorInfo.text
                              }}
                            >
                              {formattedDueDate}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default JiraHierarchyModal;

