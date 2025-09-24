import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useJiraTicket } from '../hooks/useApiQueries';
import { useSettings } from '../contexts/SettingsContext';
import JiraCard from './JiraCard';
import BasePanel from './BasePanel';
import jiraLogo from '../assets/jiraLogo.png';

// Types for JIRA history management
interface JiraHistoryItem {
  id: string;
  summary?: string;
  assignee?: string;
}

interface JiraLookupPanelProps {
  onTicketSelect?: (ticketKey: string) => void;
  selectedTicket?: string;
}

// Component for JIRA lookup with ticket selection support
const JiraLookupPanel: React.FC<JiraLookupPanelProps> = ({ onTicketSelect, selectedTicket }) => {
  // State management
  const [prefix, setPrefix] = useState<string>('OCMUI-');
  const [number, setNumber] = useState<string>('');
  const [selectedJiraId, setSelectedJiraId] = useState<string>('');
  const [showPrefixDropdown, setShowPrefixDropdown] = useState<boolean>(false);
  const [showHistoryDropdown, setShowHistoryDropdown] = useState<boolean>(false);
  const [jiraHistory, setJiraHistory] = useState<JiraHistoryItem[]>([]);
  const [prefixHistory, setPrefixHistory] = useState<string[]>([]);

  // Refs for input management
  const prefixInputRef = useRef<HTMLInputElement>(null);
  const numberInputRef = useRef<HTMLInputElement>(null);
  const historyDropdownRef = useRef<HTMLDivElement>(null);
  const prefixDropdownRef = useRef<HTMLDivElement>(null);

  // Settings context
  const { isConfigured, apiTokens } = useSettings();

  // API hook
  const { 
    data: jiraTicketData, 
    isLoading: jiraLoading, 
    error: jiraError
  } = useJiraTicket(selectedJiraId);

  // Load history from localStorage on mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('ocmui_jira_history');
    const savedPrefixes = localStorage.getItem('ocmui_jira_prefixes');
    
    if (savedHistory) {
      try {
        setJiraHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.warn('Failed to load JIRA history from localStorage');
      }
    }
    
    if (savedPrefixes) {
      try {
        setPrefixHistory(JSON.parse(savedPrefixes));
      } catch (e) {
        console.warn('Failed to load JIRA prefix history from localStorage');
      }
    }

    // Set default prefix if available
    const defaultPrefix = localStorage.getItem('ocmui_default_jira_prefix') || 'OCMUI-';
    setPrefix(defaultPrefix);
  }, []);

  // Add JIRA to history
  const addToJiraHistory = useCallback((jiraId: string, ticketData?: any) => {
    const historyItem: JiraHistoryItem = {
      id: jiraId,
      summary: ticketData?.summary || 'Loading...',
      assignee: ticketData?.assignee || 'Unassigned'
    };

    setJiraHistory(prev => {
      // Remove existing entry to avoid duplicates
      const filtered = prev.filter(item => item.id !== jiraId);
      
      // Add to beginning and limit to 10 items
      const updated = [historyItem, ...filtered].slice(0, 10);
      
      // Persist to localStorage
      localStorage.setItem('ocmui_jira_history', JSON.stringify(updated));
      
      return updated;
    });
  }, []);

  // Add prefix to history
  const addToPrefixHistory = useCallback((prefix: string) => {
    setPrefixHistory(prev => {
      // Remove existing to avoid duplicates
      const filtered = prev.filter(p => p !== prefix);
      
      // Add to beginning and limit to 8 prefixes
      const updated = [prefix, ...filtered].slice(0, 8);
      
      // Persist to localStorage
      localStorage.setItem('ocmui_jira_prefixes', JSON.stringify(updated));
      
      return updated;
    });
  }, []);

  // Handle prefix input
  const handlePrefixKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      numberInputRef.current?.focus();
    }
  };

  // Handle number input
  const handleNumberKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleJiraSubmit();
    }
  };

  // Handle JIRA submission
  const handleJiraSubmit = () => {
    const trimmedNumber = number.trim();
    const trimmedPrefix = prefix.trim();
    
    if (!trimmedNumber || !trimmedPrefix) {
      return;
    }

    // Validate number input
    if (!trimmedNumber.match(/^\d+$/)) {
      alert('Please enter only numbers in the JIRA number field');
      return;
    }

    // Ensure prefix ends with dash
    const normalizedPrefix = trimmedPrefix.endsWith('-') ? trimmedPrefix : trimmedPrefix + '-';
    const jiraId = normalizedPrefix + trimmedNumber;

    // Add to history and search
    addToPrefixHistory(normalizedPrefix);
    addToJiraHistory(jiraId);
    setSelectedJiraId(jiraId);
    
    // Clear number input
    setNumber('');
    
    // Update default prefix
    localStorage.setItem('ocmui_default_jira_prefix', normalizedPrefix);
  };

  // Handle history item click
  const handleHistoryItemClick = (jiraId: string) => {
    // Parse JIRA ID and populate input fields
    const match = jiraId.match(/^([A-Z]+-)(\d+)$/);
    if (match) {
      const [, extractedPrefix, extractedNumber] = match;
      setPrefix(extractedPrefix);
      setNumber(extractedNumber);
      numberInputRef.current?.focus();
    }
    
    setSelectedJiraId(jiraId);
    setShowHistoryDropdown(false);
  };

  // Handle prefix dropdown item click
  const handlePrefixItemClick = (selectedPrefix: string) => {
    setPrefix(selectedPrefix);
    setShowPrefixDropdown(false);
    numberInputRef.current?.focus();
  };

  // Handle ticket click for selection
  const handleTicketClick = (ticket: any) => {
    if (onTicketSelect) {
      onTicketSelect(ticket.key);
    }
  };

  // Handle outside clicks to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      if (historyDropdownRef.current && !historyDropdownRef.current.contains(target)) {
        setShowHistoryDropdown(false);
      }
      
      if (prefixDropdownRef.current && !prefixDropdownRef.current.contains(target)) {
        setShowPrefixDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update history when ticket data is loaded
  useEffect(() => {
    if (jiraTicketData?.success && jiraTicketData.ticket && selectedJiraId) {
      addToJiraHistory(selectedJiraId, jiraTicketData.ticket);
    }
  }, [jiraTicketData, selectedJiraId, addToJiraHistory]);

  // Auto-select ticket for Associated PRs when ticket is successfully loaded
  useEffect(() => {
    if (jiraTicketData?.success && jiraTicketData.ticket && selectedJiraId && onTicketSelect) {
      // Automatically trigger Associated PRs search since there's only one ticket in JIRA Lookup
      onTicketSelect(jiraTicketData.ticket.key);
    }
  }, [jiraTicketData, selectedJiraId, onTicketSelect]);

  // Show loading state
  if (jiraLoading) {
    return (
      <BasePanel 
        title="JIRA Lookup" 
        icon={jiraLogo}
        iconAlt="JIRA"
        isLoading={true}
        loadingMessage={`Loading ${selectedJiraId}...`}
      ><div>Loading...</div></BasePanel>
    );
  }

  // Show error state for configuration issues
  if (!isConfigured || !apiTokens.jira || !apiTokens.jiraUsername) {
    return (
      <BasePanel 
        title="JIRA Lookup" 
        icon={jiraLogo}
        iconAlt="JIRA"
        error={new Error("JIRA credentials required: Please configure your JIRA token and username (email) in Settings")}
      ><div>Configuration required</div></BasePanel>
    );
  }

  // Get current selection for history button
  const selectedHistoryItem = jiraHistory.find(item => item.id === selectedJiraId);

  return (
    <div className="panel-content">
      {/* Line 1: Icon + Title + Search Fields - FORCE TO SEPARATE DIV */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px', 
        padding: '12px 16px'
      }}>
        <img src={jiraLogo} alt="JIRA" className="column-icon" />
        <span style={{ color: '#fff', fontSize: '16px', fontWeight: '500' }}>JIRA Ticket</span>
        
        {/* Prefix Input with Dropdown */}
        <div className="jira-prefix-section">
          <input
            ref={prefixInputRef}
            type="text"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            onKeyDown={handlePrefixKeyDown}
            onFocus={() => prefixHistory.length > 0 && setShowPrefixDropdown(true)}
            placeholder="OCMUI-"
            maxLength={20}
            className="jira-prefix-input"
          />
          
          {showPrefixDropdown && prefixHistory.length > 0 && (
            <div 
              ref={prefixDropdownRef}
              className="jira-prefix-dropdown"
            >
              {prefixHistory.map(p => (
                <div
                  key={p}
                  className="prefix-item"
                  onClick={() => handlePrefixItemClick(p)}
                >
                  {p}
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Number Input */}
        <div className="jira-number-section">
          <input
            ref={numberInputRef}
            type="text"
            value={number}
            onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))}
            onKeyDown={handleNumberKeyDown}
            placeholder="1234"
            maxLength={8}
            className="jira-number-input"
          />
        </div>
      </div>
      
      {/* Line 2: Recent JIRAs - SEPARATE DIV */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '12px', 
        padding: '6px 16px 12px 16px',
        borderBottom: '1px solid #333'
      }}>
        <label style={{ 
          fontSize: '14px', 
          fontWeight: '500', 
          color: '#fff', 
          whiteSpace: 'nowrap',
          minWidth: 'fit-content'
        }}>
          Recent JIRAs:
        </label>
        
        <div className="jira-dropdown-wrapper" style={{ flex: 1, position: 'relative' }}>
          <div 
            className="jira-history-button"
            onClick={() => setShowHistoryDropdown(!showHistoryDropdown)}
          >
            <span className="selected-jira">
              {selectedHistoryItem 
                ? `${selectedHistoryItem.id}${selectedHistoryItem.summary && selectedHistoryItem.summary !== 'Loading...' ? ' - ' + (selectedHistoryItem.summary.length > 100 ? selectedHistoryItem.summary.substring(0, 97) + '...' : selectedHistoryItem.summary) : ''}`
                : 'Select a recent JIRA...'
              }
            </span>
            <span className="dropdown-arrow">
              {showHistoryDropdown ? '▲' : '▼'}
            </span>
          </div>
          
          {showHistoryDropdown && (
            <div 
              ref={historyDropdownRef}
              className="jira-history-dropdown"
            >
              {jiraHistory.length === 0 ? (
                <div className="history-placeholder">
                  Recent JIRAs will appear here
                </div>
              ) : (
                jiraHistory.slice(0, 10).map(item => {
                  const isSelected = selectedJiraId === item.id;
                  const assigneeText = item.assignee && item.assignee !== 'Unassigned' ? ` (${item.assignee})` : '';
                  const summary = item.summary && item.summary !== 'Loading...' ? 
                    (item.summary.length > 150 ? item.summary.substring(0, 147) + '...' : item.summary) : '';
                  
                  return (
                    <div
                      key={item.id}
                      className={`history-item${isSelected ? ' selected' : ''}`}
                      onClick={() => handleHistoryItemClick(item.id)}
                    >
                      <span className="history-jira-id">
                        {item.id}
                      </span>
                      {assigneeText && (
                        <span>{assigneeText}</span>
                      )}
                      {summary && (
                        <span className="history-summary">
                          {summary}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="jira-content-spacer" />
      
      <div className="jira-ticket-display">
        {!selectedJiraId ? (
          <div className="placeholder">
            Enter a JIRA ID to view ticket details
          </div>
        ) : jiraError ? (
          <div className="error">
            Error loading {selectedJiraId}: {(jiraError as Error).message}
          </div>
        ) : jiraTicketData?.success && jiraTicketData.ticket ? (
          <JiraCard 
            key={selectedJiraId}
            ticket={jiraTicketData.ticket}
            onClick={handleTicketClick}
            isSelected={selectedTicket === jiraTicketData.ticket.key}
          />
        ) : null}
      </div>
    </div>
  );
};

export default JiraLookupPanel;