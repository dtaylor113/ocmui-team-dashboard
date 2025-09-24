import React, { useState, useEffect, useMemo } from 'react';
import { useSettings } from '../contexts/SettingsContext';

interface TeamMember {
  name: string;
  role: string;
  location: string;
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
  const [refHour, setRefHour] = useState(9);
  const [refTz, setRefTz] = useState('America/New_York');
  const [editingMemberIndex, setEditingMemberIndex] = useState(-1);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  
  // "I am..." functionality
  const [showIdentitySelection, setShowIdentitySelection] = useState(false);
  const [selectedIdentity, setSelectedIdentity] = useState<TeamMember | null>(null);
  const [timeRefreshKey, setTimeRefreshKey] = useState(0); // For triggering time updates
  
  // Form state for member management
  const [memberForm, setMemberForm] = useState({
    name: '',
    role: '',
    location: '',
    tz: ''
  });

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
          setMembers(customMembers);
          console.log(`🕐 Loaded ${customMembers.length} team members from localStorage`);
          return;
        }
      }

      // Fallback to built-in JSON file
      const response = await fetch('/timeboard/members.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const membersData = await response.json();
      setMembers(membersData);
      console.log(`🕐 Loaded ${membersData.length} team members from JSON`);
    } catch (error) {
      console.error('🕐 Failed to load members:', error);
      setMembers([]);
    }
  };

  const saveMembers = async (newMembers: TeamMember[]) => {
    try {
      localStorage.setItem('ocmui_timeboard_members', JSON.stringify(newMembers));
      console.log(`🕐 Saved ${newMembers.length} team members to localStorage`);
      setMembers(newMembers);
    } catch (error) {
      console.error('🕐 Failed to save members:', error);
    }
  };

  // Get unique timezones for reference dropdown
  const uniqueTimezones = useMemo(() => {
    return [...new Set(members.map(m => m.tz))].sort();
  }, [members]);

  // Current local time string (updates with timer)
  const currentLocalTime = useMemo(() => {
    const now = new Date();
    return now.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      timeZoneName: 'short'
    });
  }, [timeRefreshKey]); // Updates when timer ticks

  // Set default reference timezone when members load
  useEffect(() => {
    if (uniqueTimezones.length > 0 && !uniqueTimezones.includes(refTz)) {
      const ny = "America/New_York";
      setRefTz(uniqueTimezones.includes(ny) ? ny : uniqueTimezones[0]);
    }
  }, [uniqueTimezones, refTz]);

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
    
    // Calculate UTC time for the reference hour in reference timezone
    const utcMinutes = refHour * 60 - offsetMinutes;
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
  }, [members, searchFilter, referenceMode, refHour, refTz, timeRefreshKey]);

  // Member management functions

  const closeManageModal = () => {
    setIsManageModalOpen(false);
    clearMemberForm();
    setEditingMemberIndex(-1);
  };

  const clearMemberForm = () => {
    setMemberForm({ name: '', role: '', location: '', tz: '' });
    setEditingMemberIndex(-1);
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

  const editMember = (index: number) => {
    const member = members[index];
    setMemberForm({
      name: member.name,
      role: member.role,
      location: member.location,
      tz: member.tz
    });
    setEditingMemberIndex(index);
  };

  const deleteMember = async (index: number) => {
    if (confirm(`Delete ${members[index].name}?`)) {
      const newMembers = [...members];
      newMembers.splice(index, 1);
      await saveMembers(newMembers);
    }
  };

  const saveMember = async () => {
    const { name, role, location, tz } = memberForm;
    
    if (!name.trim() || !role.trim() || !location.trim() || !tz) {
      alert('Please fill in all fields');
      return;
    }

    const memberData = {
      name: name.trim(),
      role: role.trim(),
      location: location.trim(),
      tz
    };

    let newMembers = [...members];
    
    if (editingMemberIndex >= 0) {
      // Update existing member
      newMembers[editingMemberIndex] = memberData;
    } else {
      // Add new member
      newMembers.push(memberData);
    }

    await saveMembers(newMembers);
    clearMemberForm();
  };

  // Timezone options for member form
  const timezoneOptions = [
    { value: 'America/Los_Angeles', label: 'America/Los_Angeles (Pacific)' },
    { value: 'America/Denver', label: 'America/Denver (Mountain)' },
    { value: 'America/Chicago', label: 'America/Chicago (Central)' },
    { value: 'America/New_York', label: 'America/New_York (Eastern)' },
    { value: 'Europe/London', label: 'Europe/London (UK)' },
    { value: 'Europe/Amsterdam', label: 'Europe/Amsterdam (Netherlands)' },
    { value: 'Europe/Berlin', label: 'Europe/Berlin (Germany)' },
    { value: 'Europe/Rome', label: 'Europe/Rome (Italy)' },
    { value: 'Europe/Prague', label: 'Europe/Prague (Czech Republic)' },
    { value: 'Asia/Jerusalem', label: 'Asia/Jerusalem (Israel)' },
    { value: 'Asia/Singapore', label: 'Asia/Singapore (Singapore)' },
    { value: 'Asia/Tokyo', label: 'Asia/Tokyo (Japan)' },
    { value: 'Australia/Sydney', label: 'Australia/Sydney (Australia)' }
  ];

  if (!isOpen) return null;

  return (
    <div className="timeboard-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
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
            
            {/* Right side: I am... + Members buttons */}
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
                className="timeboard-manage-btn"
                title="Manage Team Members"
                onClick={() => setIsManageModalOpen(true)}
              >
                👥
              </button>
            </div>
          </div>

          {referenceMode === 'ref' && (
            <>
              <div className="timeboard-ctrl" title="Reference time (9am–5pm)">
                <label htmlFor="refHour">Time:</label>
                <select
                  id="refHour"
                  value={refHour}
                  onChange={(e) => setRefHour(Number(e.target.value))}
                >
                  <option value={9}>9:00</option>
                  <option value={10}>10:00</option>
                  <option value={11}>11:00</option>
                  <option value={12}>12:00</option>
                  <option value={13}>1:00</option>
                  <option value={14}>2:00</option>
                  <option value={15}>3:00</option>
                  <option value={16}>4:00</option>
                  <option value={17}>5:00</option>
                </select>
              </div>

              <div className="timeboard-ctrl" title="Reference timezone (from team tzs)">
                <label htmlFor="refTz">TZ:</label>
                <select
                  id="refTz"
                  value={refTz}
                  onChange={(e) => setRefTz(e.target.value)}
                >
                  {uniqueTimezones.map(tz => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>

        <main className="timeboard-main">
          <table className="timeboard-table">
            <thead>
              <tr>
                {showIdentitySelection && <th style={{width: '5%'}}></th>}
                <th style={{width: showIdentitySelection ? '25%' : '28%'}}>Name</th>
                <th style={{width: '16%'}}>Role</th>
                <th style={{width: showIdentitySelection ? '25%' : '28%'}}>IANA TZ</th>
                <th style={{width: '14%'}}>Local Time</th>
                <th style={{width: '14%'}}>Offset</th>
              </tr>
            </thead>
            <tbody>
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
                  <td>{member.name}</td>
                  <td className="muted">{member.role}</td>
                  <td className="mono">{member.tz}</td>
                  <td className={`mono ${member.off ? 'warn' : ''}`}>
                    {member.local}
                  </td>
                  <td className="mono">{member.offset}</td>
                </tr>
              ))}
            </tbody>
          </table>
          
          <footer className="timeboard-note">
            Times shown are each teammate's local time at the selected reference. 
            Off-hours (before 9am / after 5pm) are subtly highlighted in red. DST is automatic.
          </footer>
        </main>

        {/* Manage Members Modal */}
        {isManageModalOpen && (
          <div className="timeboard-sub-modal" onClick={(e) => e.target === e.currentTarget && closeManageModal()}>
            <div className="timeboard-sub-modal-content">
              <div className="timeboard-sub-modal-header">
                <h2>Manage Team Members</h2>
                <button className="timeboard-close-btn" onClick={closeManageModal}>×</button>
              </div>
              
              <div className="timeboard-sub-modal-body">
                <div className="timeboard-member-form">
                  <div className="timeboard-form-group">
                    <label htmlFor="memberName">Name</label>
                    <input
                      type="text"
                      id="memberName"
                      placeholder="Enter name"
                      value={memberForm.name}
                      onChange={(e) => setMemberForm(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>
                  
                  <div className="timeboard-form-group">
                    <label htmlFor="memberRole">Role</label>
                    <input
                      type="text"
                      id="memberRole"
                      placeholder="Enter role"
                      value={memberForm.role}
                      onChange={(e) => setMemberForm(prev => ({ ...prev, role: e.target.value }))}
                    />
                  </div>
                  
                  <div className="timeboard-form-group">
                    <label htmlFor="memberLocation">Location</label>
                    <input
                      type="text"
                      id="memberLocation"
                      placeholder="Enter location description"
                      value={memberForm.location}
                      onChange={(e) => setMemberForm(prev => ({ ...prev, location: e.target.value }))}
                    />
                  </div>
                  
                  <div className="timeboard-form-group">
                    <label htmlFor="memberTimezone">Timezone (IANA)</label>
                    <select
                      id="memberTimezone"
                      value={memberForm.tz}
                      onChange={(e) => setMemberForm(prev => ({ ...prev, tz: e.target.value }))}
                    >
                      <option value="">Select timezone...</option>
                      {timezoneOptions.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="timeboard-btn-group">
                    <button 
                      className="timeboard-btn timeboard-btn-secondary"
                      onClick={clearMemberForm}
                    >
                      Cancel
                    </button>
                    <button 
                      className="timeboard-btn timeboard-btn-primary"
                      onClick={saveMember}
                    >
                      {editingMemberIndex >= 0 ? 'Update' : 'Save'}
                    </button>
                  </div>
                </div>
                
                <div className="timeboard-members-section">
                  <h3>Current Members</h3>
                  <div className="timeboard-members-list">
        {members.map((member, memberIndex) => (
          <div key={`${member.name}-${memberIndex}`} className="member-item">
            <div className="member-info">
              <div className="member-name">{member.name}</div>
              <div className="member-details">{member.role} • {member.tz}</div>
            </div>
            <div className="member-actions">
              <button
                className="timeboard-btn timeboard-btn-secondary timeboard-btn-small"
                onClick={() => editMember(memberIndex)}
                title="Edit member"
              >
                ✏️
              </button>
              <button
                className="timeboard-btn timeboard-btn-danger timeboard-btn-small"
                onClick={() => deleteMember(memberIndex)}
                title="Delete member"
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TimeboardModal;
