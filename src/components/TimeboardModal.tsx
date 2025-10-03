import React, { useState, useEffect, useMemo } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import slackIcon from '../assets/slack-dark-theme-icon.png';

interface TeamMember {
  name: string;
  role: string;
  tz: string;
}

interface TimeDisplayMember extends TeamMember {
  local: string;
  offset: string;
  sortKey: number;
  off: boolean; // Off-hours flag
}

interface TimeboardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TimeboardModal: React.FC<TimeboardModalProps> = ({ isOpen, onClose }) => {
  const { updateUserPreferences } = useSettings();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [referenceMode, setReferenceMode] = useState<'now' | 'ref'>('now');
  const [refMinutes, setRefMinutes] = useState(540); // 09:00 default (minutes since midnight)
  const [refTz, setRefTz] = useState('America/New_York');
  // Inline editing state
  const [editingIndex, setEditingIndex] = useState<number | null>(null); // -1 for new, otherwise index
  const [draftMember, setDraftMember] = useState<TeamMember>({ name: '', role: '', tz: '' });
  
  // "I am..." functionality
  const [showIdentitySelection, setShowIdentitySelection] = useState(false);
  const [selectedIdentity, setSelectedIdentity] = useState<TeamMember | null>(null);
  const [timeRefreshKey, setTimeRefreshKey] = useState(0); // For triggering time updates
  
  // No separate form; inline row editing uses draftMember

  // Utilities for safe timezone handling
  const isValidTimezone = (tz: string): boolean => {
    try {
      if (!tz) return false;
      // Use Intl API to validate; throws RangeError for invalid tz
      new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
      return true;
    } catch {
      return false;
    }
  };

  // Load members on mount
  useEffect(() => {
    loadMembers();
  }, []); // Only run once on mount, not when members change!
  
  // Check for existing identity when members are loaded
  useEffect(() => {
    if (members.length === 0) return; // Wait for members to be loaded
    
    const storedMember = localStorage.getItem('ocmui_selected_team_member');
    if (storedMember) {
      try {
        const memberData = JSON.parse(storedMember);
        const member = members.find(m => m.name === memberData.name);
        if (member) {
          setSelectedIdentity(member);
        }
      } catch (error) {
        console.error('Error parsing stored team member:', error);
      }
    }
  }, [members]); // This one can depend on members since it doesn't fetch

  // Auto-refresh current time every minute (only when modal is open and in 'now' mode)
  useEffect(() => {
    if (!isOpen || referenceMode !== 'now') return;

    const interval = setInterval(() => {
      setTimeRefreshKey(prev => prev + 1); // Trigger time recalculation
    }, 60000);

    return () => clearInterval(interval);
  }, [isOpen, referenceMode]);

  const loadMembers = async () => {
    try {
      // First try localStorage for user modifications
      const stored = localStorage.getItem('ocmui_timeboard_members');
      if (stored) {
        const customMembers = JSON.parse(stored);
        if (customMembers && customMembers.length > 0) {
          // Backward compatibility: drop unknown fields like location
          const cleaned = customMembers
            .map((m: any) => ({ name: m.name, role: m.role, tz: m.tz }))
            .filter((m: any) => isValidTimezone(m.tz)); // guard invalid tz from previous saves
          setMembers(cleaned);
          console.log(`🕐 Loaded ${customMembers.length} team members from localStorage`);
          return;
        }
      }

      // Fallback to built-in JSON file
      const response = await fetch('/timeboard/members.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const membersData = await response.json();
      const cleaned = (Array.isArray(membersData) ? membersData : [])
        .map((m: any) => ({ name: m.name, role: m.role, tz: m.tz }))
        .filter((m: any) => isValidTimezone(m.tz));
      setMembers(cleaned);
      console.log(`🕐 Loaded ${membersData.length} team members from JSON`);
    } catch (error) {
      console.error('🕐 Failed to load members:', error);
      setMembers([]);
    }
  };

  const saveMembers = async (newMembers: TeamMember[]) => {
    try {
      // Filter out any invalid timezones before persisting
      const sanitized = newMembers.filter(m => isValidTimezone(m.tz));
      localStorage.setItem('ocmui_timeboard_members', JSON.stringify(sanitized));
      console.log(`🕐 Saved ${newMembers.length} team members to localStorage`);
      setMembers(sanitized);
    } catch (error) {
      console.error('🕐 Failed to save members:', error);
    }
  };

  // Full IANA timezone list (with fallback to common + present team tzs)
  const commonTzFallback = [
    'America/Los_Angeles','America/Denver','America/Chicago','America/New_York',
    'Europe/London','Europe/Amsterdam','Europe/Berlin','Europe/Rome','Europe/Prague',
    'Asia/Jerusalem','Asia/Singapore','Asia/Tokyo','Australia/Sydney','Asia/Kolkata'
  ];
  const allTimezones = useMemo(() => {
    try {
      const supported = (Intl as any).supportedValuesOf?.('timeZone');
      if (Array.isArray(supported) && supported.length > 0) {
        return supported as string[];
      }
    } catch {}
    return Array.from(new Set([ ...members.map(m => m.tz), ...commonTzFallback ])).sort();
  }, [members]);

  const getTimezoneLabel = (tz: string): string => {
    try {
      const now = new Date();
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(now);
      const name = parts.find(p => p.type === 'timeZoneName')?.value || '';
      // Normalize name like "GMT+5:30" or "UTC+5:30" into "UTC+5:30"
      const labelOffset = name.replace('GMT', 'UTC');
      return `${tz} — ${labelOffset}`;
    } catch {
      return tz;
    }
  };

  // Optional: sort TZs by current offset for easier scanning
  const [sortTzByOffset, setSortTzByOffset] = useState(true);
  const tzWithSort = useMemo(() => {
    if (!sortTzByOffset) return allTimezones;
    const now = new Date();
    const withOffset = allTimezones.map(tz => {
      try {
        const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(now);
        const name = parts.find(p => p.type === 'timeZoneName')?.value || 'UTC+0';
        // Parse offset minutes
        const m = /([+-])(\d{1,2})(?::?(\d{2}))?/.exec(name);
        let minutes = 0;
        if (m) {
          const sign = m[1] === '-' ? -1 : 1;
          const hh = Number(m[2] || 0);
          const mm = Number(m[3] || 0);
          minutes = sign * (hh * 60 + mm);
        }
        return { tz, minutes };
      } catch {
        return { tz, minutes: 0 };
      }
    });
    withOffset.sort((a, b) => a.minutes - b.minutes || a.tz.localeCompare(b.tz));
    return withOffset.map(x => x.tz);
  }, [sortTzByOffset, allTimezones]);

  // Current local time string (updates with timer)
  const currentLocalTime = useMemo(() => {
    const now = new Date();
    return now.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      timeZoneName: 'short'
    });
  }, [timeRefreshKey]); // Updates when timer ticks

  // Set default reference timezone when timezones change
  useEffect(() => {
    if (allTimezones.length > 0 && !allTimezones.includes(refTz)) {
      const ny = "America/New_York";
      setRefTz(allTimezones.includes(ny) ? ny : allTimezones[0]);
    }
  }, [allTimezones, refTz]);

  // Calculate reference date/time
  const getReferenceDate = (): Date => {
    if (referenceMode === 'now') {
      return new Date();
    }

    // Reference mode - calculate specific time in specific timezone
    const now = new Date();
    const { y, m, d } = getYmdInTz(now, refTz);
    
    // Get timezone offset for reference timezone
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: refTz, 
      timeZoneName: "shortOffset"
    }).formatToParts(now);
    
    const tzName = parts.find(p => p.type === "timeZoneName")?.value || "GMT+0";
    const offsetMinutes = parseGmtOffset(tzName);
    
    // Calculate UTC time for the reference minutes in reference timezone
    const utcMinutes = refMinutes - offsetMinutes;
    const hours = Math.floor(utcMinutes / 60);
    const minutes = utcMinutes % 60;
    
    return new Date(Date.UTC(y, m - 1, d, hours, minutes, 0, 0));
  };

  // Helper function to get year/month/day in specific timezone
  const getYmdInTz = (date: Date, tz: string) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, 
      year: "numeric", 
      month: "2-digit", 
      day: "2-digit"
    }).formatToParts(date);
    
    return {
      y: Number(parts.find(p => p.type === "year")?.value || 0),
      m: Number(parts.find(p => p.type === "month")?.value || 0),
      d: Number(parts.find(p => p.type === "day")?.value || 0),
    };
  };

  // Parse GMT offset string to minutes
  const parseGmtOffset = (str: string): number => {
    const match = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(str || "");
    if (!match) return 0;
    const sign = match[1] === "-" ? -1 : 1;
    const hours = Number(match[2] || 0);
    const minutes = Number(match[3] || 0);
    return sign * (hours * 60 + minutes);
  };

  // Format time in specific timezone
  const formatTime = (date: Date, tz: string): string => {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  };

  // Format timezone offset
  const formatOffset = (date: Date, tz: string): string => {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        timeZoneName: "shortOffset",
      }).formatToParts(date);
      return parts.find(p => p.type === "timeZoneName")?.value || "";
    } catch {
      return "";
    }
  };

  // Get minutes since midnight for sorting and off-hours detection
  const getMinutesSinceMidnight = (date: Date, tz: string): number => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, 
      hour: "2-digit", 
      minute: "2-digit", 
      hour12: false,
    }).formatToParts(date);
    
    const hours = Number(parts.find(p => p.type === "hour")?.value || 0);
    const minutes = Number(parts.find(p => p.type === "minute")?.value || 0);
    return hours * 60 + minutes;
  };

  // Check if time is off-hours (before 9am or after 5pm)
  const isOffHours = (minutes: number): boolean => {
    return minutes < 540 || minutes > 1020; // 540 = 9am, 1020 = 5pm
  };

  // Compute display data for all members
  const displayMembers: TimeDisplayMember[] = useMemo(() => {
    const refDate = getReferenceDate();
    const query = searchFilter.trim().toLowerCase();
    
    return members
      .filter(member => {
        if (!query) return true;
        return member.name.toLowerCase().includes(query) ||
               member.role.toLowerCase().includes(query) ||
               member.tz.toLowerCase().includes(query);
      })
      .map(member => {
        const minutes = getMinutesSinceMidnight(refDate, member.tz);
        return {
          ...member,
          local: formatTime(refDate, member.tz),
          offset: formatOffset(refDate, member.tz),
          sortKey: minutes,
          off: isOffHours(minutes)
        };
      })
      .sort((a, b) => a.sortKey - b.sortKey); // Sort by local time (earliest first)
  }, [members, searchFilter, referenceMode, refMinutes, refTz, timeRefreshKey]);

  // Inline member management functions
  const startEditByKey = (memberKey: { name: string; tz: string }) => {
    const idx = members.findIndex(m => m.name === memberKey.name && m.tz === memberKey.tz);
    if (idx >= 0) {
      setEditingIndex(idx);
      setDraftMember({ ...members[idx] });
    }
  };

  const startAdd = () => {
    setEditingIndex(-1);
    setDraftMember({ name: '', role: '', tz: refTz || 'America/New_York' });
  };

  // Identity selection functions
  const handleIdentityButtonClick = () => {
    setShowIdentitySelection(!showIdentitySelection);
  };

  const handleIdentitySelection = (member: TeamMember) => {
    setSelectedIdentity(member);
    setShowIdentitySelection(false);
    
    // Set user's timezone to selected member's timezone
    updateUserPreferences({ timezone: member.tz });
    
    // Store selection for persistence
    localStorage.setItem('ocmui_selected_team_member', JSON.stringify({
      name: member.name,
      timezone: member.tz
    }));
    
    console.log(`✅ Set identity as ${member.name} with timezone ${member.tz}`);
  };

  const getIdentityButtonText = (): string => {
    if (selectedIdentity) {
      return `I am ${selectedIdentity.name}`;
    }
    return showIdentitySelection ? 'Cancel' : 'I am...';
  };

  const getIdentityButtonClass = (): string => {
    let baseClass = 'timeboard-identity-btn';
    if (selectedIdentity) {
      baseClass += ' identity-selected';
    } else {
      baseClass += ' identity-alert-active';
    }
    return baseClass;
  };

  const deleteMember = async (index: number) => {
    if (confirm(`Delete ${members[index].name}?`)) {
      const newMembers = [...members];
      newMembers.splice(index, 1);
      await saveMembers(newMembers);
    }
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setDraftMember({ name: '', role: '', tz: '' });
  };

  const saveDraft = async () => {
    const { name, role, tz } = draftMember;
    if (!name.trim() || !role.trim() || !tz) {
      alert('Please fill in all fields');
      return;
    }
    if (!isValidTimezone(tz)) {
      alert('Please choose a valid timezone from the list. You can search by city name like Bangalore.');
      return;
    }
    const trimmed: TeamMember = { name: name.trim(), role: role.trim(), tz };
    let newMembers = [...members];
    if (editingIndex === -1) {
      newMembers.unshift(trimmed);
    } else if (editingIndex !== null && editingIndex >= 0) {
      newMembers[editingIndex] = trimmed;
    }
    await saveMembers(newMembers);
    cancelEdit();
  };

  // Export/Reload actions
  const exportMembersToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(members, null, 2));
      alert('Members copied to clipboard as JSON');
    } catch (e) {
      console.error('Failed to copy members JSON:', e);
      alert('Failed to copy to clipboard');
    }
  };

  const reloadMembersJson = async () => {
    if (!confirm('Reload from Public/timeboard/members.json and overwrite browser cookies/localStorage?')) return;
    try {
      const response = await fetch('/timeboard/members.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const cleaned = (Array.isArray(data) ? data : []).map((m: any) => ({ name: m.name, role: m.role, tz: m.tz }));
      await saveMembers(cleaned);
      console.log('Reloaded /timeboard/members.json into localStorage');
    } catch (e) {
      console.error('Failed to reload members.json:', e);
      alert('Failed to reload members.json');
    }
  };

  // (Removed legacy timezoneOptions; using allTimezones instead)

  if (!isOpen) return null;

  return (
    <div className="timeboard-modal-backdrop">
      <div className="timeboard-modal-content">
        <div className="timeboard-modal-header">
          <div className="timeboard-header-left">
            <h1>🌍 OCMUI Team Timeboard</h1>
            <div className="timeboard-current-time">
              Your local time: {currentLocalTime}
            </div>
          </div>
          <button className="timeboard-close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="timeboard-controls">
          <div className="timeboard-controls-row">
            {/* Left side: Search + Now/Reference toggle */}
            <div className="timeboard-left-controls">
              <input
                type="search"
                placeholder="Filter by name, role, or timezone…"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="timeboard-search"
              />
              
              <div className="timeboard-pill">
                <label>
                  <input
                    type="radio"
                    name="refMode"
                    value="now"
                    checked={referenceMode === 'now'}
                    onChange={() => setReferenceMode('now')}
                  />
                  Now
                </label>
                <label>
                  <input
                    type="radio"
                    name="refMode"
                    value="ref"
                    checked={referenceMode === 'ref'}
                    onChange={() => setReferenceMode('ref')}
                  />
                  Reference
                </label>
              </div>
            </div>
            
            {/* Right side: Identity + Export/Reload + Add */}
            <div className="timeboard-right-controls">
              <button 
                className={getIdentityButtonClass()}
                onClick={handleIdentityButtonClick}
                title={selectedIdentity ? `You are identified as ${selectedIdentity.name}` : 'Select which team member you are'}
              >
                {getIdentityButtonText()}
                {!selectedIdentity && <span className="identity-alert">!</span>}
              </button>

              <button
                className="timeboard-btn timeboard-btn-small"
                title="Export Members (Copy JSON)"
                onClick={exportMembersToClipboard}
              >
                ⬆️ Export
              </button>

              <button
                className="timeboard-btn timeboard-btn-small"
                title="Reload members.json"
                onClick={reloadMembersJson}
              >
                🔄 Reload members.json
              </button>

              <button
                className="timeboard-btn timeboard-btn-small"
                title="Add member"
                onClick={startAdd}
              >
                ➕ Add
              </button>
            </div>
          </div>

          {referenceMode === 'ref' && (
            <div className="timeboard-ref-row" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="timeboard-ctrl" title="Reference time (9am–5pm)">
                <label htmlFor="refTime">Time:</label>
                <input
                  id="refTime"
                  type="time"
                  step={1800}
                  min="09:00"
                  max="17:00"
                  value={`${String(Math.floor(refMinutes / 60)).padStart(2, '0')}:${String(refMinutes % 60).padStart(2, '0')}`}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(':').map(Number);
                    const mins = (isNaN(h) ? 9 : h) * 60 + (isNaN(m) ? 0 : m);
                    setRefMinutes(Math.max(540, Math.min(1020, mins)));
                  }}
                />
              </div>
              <div className="timeboard-ctrl" title="Reference timezone" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label htmlFor="refTz">TZ:</label>
                <select
                  id="refTz"
                  value={refTz}
                  onChange={(e) => setRefTz(e.target.value)}
                >
                  {tzWithSort.map(tz => (
                    <option key={tz} value={tz}>{getTimezoneLabel(tz)}</option>
                  ))}
                </select>
                <label style={{ marginLeft: '8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <input type="checkbox" checked={sortTzByOffset} onChange={(e) => setSortTzByOffset(e.target.checked)} />
                  <span style={{ fontSize: 12, color: '#9ca3af' }}>
                    {sortTzByOffset ? 'Sort TZ dropdown by GMT offset' : 'Sort TZ dropdown alphabetically'}
                  </span>
                </label>
              </div>
            </div>
          )}
        </div>

        <main className="timeboard-main">
          <table className="timeboard-table">
            <thead>
              <tr>
                {showIdentitySelection && <th style={{width: '5%'}}></th>}
                <th style={{width: '20%'}}>Name</th>
                <th style={{width: '10%'}}>Role</th>
                <th style={{width: showIdentitySelection ? '22%' : '24%'}}>IANA TZ</th>
                <th style={{width: '12%'}}>Local Time</th>
                <th style={{width: '9%'}}>Offset</th>
                <th style={{width: '11%'}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* New member inline row */}
              {editingIndex === -1 && (
                <tr key="new-member-row">
                  {showIdentitySelection && <td></td>}
                  <td style={{ width: '20%' }}>
                    <input
                      type="text"
                      placeholder="Name"
                      value={draftMember.name}
                      onChange={(e) => setDraftMember(prev => ({ ...prev, name: e.target.value }))}
                      style={{ padding: '4px 6px', width: '120px', minWidth: '120px', maxWidth: '120px', display: 'inline-block' }}
                      maxLength={25}
                    />
                  </td>
                  <td style={{ width: '10%' }}>
                    <input
                      type="text"
                      placeholder="Role"
                      value={draftMember.role}
                      onChange={(e) => setDraftMember(prev => ({ ...prev, role: e.target.value }))}
                      style={{ padding: '4px 6px', width: '80px', minWidth: '80px', maxWidth: '80px', display: 'inline-block' }}
                      maxLength={25}
                    />
                  </td>
                  <td>
                    <select
                      value={draftMember.tz}
                      onChange={(e) => setDraftMember(prev => ({ ...prev, tz: e.target.value }))}
                    >
                      <option value="">Select timezone…</option>
                      {tzWithSort.map(tz => (
                        <option key={tz} value={tz}>{getTimezoneLabel(tz)}</option>
                      ))}
                    </select>
                  </td>
                  <td className="mono" colSpan={2}>—</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="timeboard-btn timeboard-btn-primary timeboard-btn-small" onClick={saveDraft}>Save</button>
                      <button className="timeboard-btn timeboard-btn-secondary timeboard-btn-small" onClick={cancelEdit}>Cancel</button>
                    </div>
                  </td>
                </tr>
              )}

              {displayMembers.map((member) => (
                <tr 
                  key={`${member.name}-${member.tz}`}
                  className={selectedIdentity?.name === member.name ? 'identity-selected-row' : ''}
                >
                  {showIdentitySelection && (
                    <td className="identity-radio-cell">
                      <input
                        type="radio"
                        name="identity"
                        checked={selectedIdentity?.name === member.name}
                        onChange={() => handleIdentitySelection(member)}
                        className="identity-radio"
                      />
                    </td>
                  )}
                  {/* Inline edit vs read-only */}
                  {(() => {
                    const idx = members.findIndex(m => m.name === member.name && m.tz === member.tz);
                    const isEditing = editingIndex === idx;
                    if (isEditing) {
                      return (
                        <>
                          <td style={{ width: '20%' }}>
                            <input
                              type="text"
                              value={draftMember.name}
                              onChange={(e) => setDraftMember(prev => ({ ...prev, name: e.target.value }))}
                              style={{ padding: '4px 6px', width: '120px', minWidth: '120px', maxWidth: '120px', display: 'inline-block' }}
                              maxLength={25}
                            />
                          </td>
                          <td style={{ width: '10%' }}>
                            <input
                              type="text"
                              value={draftMember.role}
                              onChange={(e) => setDraftMember(prev => ({ ...prev, role: e.target.value }))}
                              style={{ padding: '4px 6px', width: '80px', minWidth: '80px', maxWidth: '80px', display: 'inline-block' }}
                              maxLength={25}
                            />
                          </td>
                          <td>
                            <select
                              value={draftMember.tz}
                              onChange={(e) => setDraftMember(prev => ({ ...prev, tz: e.target.value }))}
                            >
                              {tzWithSort.map(tz => (
                                <option key={tz} value={tz}>{getTimezoneLabel(tz)}</option>
                              ))}
                            </select>
                          </td>
                          <td className="mono">—</td>
                          <td className="mono">—</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="timeboard-btn timeboard-btn-primary timeboard-btn-small" onClick={saveDraft}>Save</button>
                              <button className="timeboard-btn timeboard-btn-secondary timeboard-btn-small" onClick={cancelEdit}>Cancel</button>
                            </div>
                          </td>
                        </>
                      );
                    }
                    return (
                      <>
                        <td style={{ width: '20%' }}>{member.name}</td>
                        <td className="muted" style={{ width: '10%' }}>{member.role}</td>
                        <td className="mono">{member.tz}</td>
                        <td className={`mono ${member.off ? 'warn' : ''}`}>{member.local}</td>
                        <td className="mono">{member.offset}</td>
                        <td>
                          <button
                            className="timeboard-btn timeboard-btn-secondary timeboard-btn-small"
                            onClick={() => startEditByKey({ name: member.name, tz: member.tz })}
                            title="Edit member"
                          >
                            ✏️
                          </button>
                          <button
                            className="timeboard-btn timeboard-btn-danger timeboard-btn-small"
                            onClick={() => {
                              const delIdx = members.findIndex(m => m.name === member.name && m.tz === member.tz);
                              if (delIdx >= 0) deleteMember(delIdx);
                            }}
                            title="Delete member"
                            style={{ marginLeft: '6px' }}
                          >
                            🗑️
                          </button>
                        </td>
                      </>
                    );
                  })()}
                </tr>
              ))}
            </tbody>
          </table>
          
          <footer className="timeboard-note">
            <div>
              Times shown are each teammate's local time at the selected reference. 
              Off-hours (before 9am / after 5pm) are subtly highlighted in red. DST is automatic.
            </div>
            <div style={{ marginTop: 8, textAlign: 'left' }}>
              <a 
                className="btn btn-feedback" 
                href="https://redhat-internal.slack.com/app_redirect?channel=UA0LKKEMU" 
                target="_blank" 
                rel="noopener noreferrer"
                title="Open Slack web to DM dtaylor"
              >
                <img src={slackIcon} alt="Slack" className="btn-icon" />
                Give feedback to dtaylor
              </a>
            </div>
          </footer>
        </main>

        {/* Inline-only management; nested modal removed */}
      </div>
    </div>
  );
};

export default TimeboardModal;
