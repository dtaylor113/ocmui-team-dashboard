import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useSettings } from '../contexts/SettingsContext';
import { auditFetch, identifyUser } from '../utils/auditFetch';

interface TeamMember {
  name: string;
  role: string;
  tz: string;
  github?: string;
  jira?: string;
}

interface FirstRunIdentityModalProps {
  isOpen: boolean;
  onComplete: () => void;
}

const FirstRunIdentityModal: React.FC<FirstRunIdentityModalProps> = ({ isOpen, onComplete }) => {
  const { updateUserPreferences, apiTokens, saveSettings } = useSettings();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newMember, setNewMember] = useState<TeamMember>({ name: '', role: '', tz: '', github: '', jira: '' });
  const [loading, setLoading] = useState(true);

  // Load members on mount
  useEffect(() => {
    if (isOpen) {
      loadMembers();
    }
  }, [isOpen]);

  const loadMembers = async () => {
    setLoading(true);
    try {
      // Try server API first (Phase 4 - shared roster)
      const apiResponse = await auditFetch('/api/team/members');
      if (apiResponse.ok) {
        const data = await apiResponse.json();
        if (data.success && Array.isArray(data.members)) {
          setMembers(data.members);
          console.log(`👥 Loaded ${data.members.length} team members from server (${data.source})`);
          setLoading(false);
          return;
        }
      }
    } catch (error) {
      console.warn('API not available, falling back to local storage:', error);
    }
    
    // Fallback: try localStorage
    try {
      const stored = localStorage.getItem('ocmui_timeboard_members');
      if (stored) {
        const customMembers = JSON.parse(stored);
        if (customMembers && customMembers.length > 0) {
          setMembers(customMembers);
          setLoading(false);
          return;
        }
      }

      // Fallback to JSON file
      const response = await fetch('/timeboard/members.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const membersData = await response.json();
      setMembers(Array.isArray(membersData) ? membersData : []);
    } catch (error) {
      console.error('Failed to load members:', error);
      setMembers([]);
    }
    setLoading(false);
  };

  const filteredMembers = useMemo(() => {
    const query = searchFilter.trim().toLowerCase();
    if (!query) return members;
    return members.filter(m => 
      m.name.toLowerCase().includes(query) ||
      m.role.toLowerCase().includes(query)
    );
  }, [members, searchFilter]);

  // Get common timezones for new member
  const commonTimezones = useMemo(() => {
    try {
      const supported = (Intl as any).supportedValuesOf?.('timeZone');
      if (Array.isArray(supported)) return supported;
    } catch {}
    return [
      'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York',
      'Europe/London', 'Europe/Berlin', 'Europe/Rome', 'Europe/Prague',
      'Asia/Jerusalem', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo'
    ];
  }, []);

  const handleSelectMember = (member: TeamMember) => {
    setSelectedMember(member);
    setIsAddingNew(false);
  };

  const handleConfirmSelection = async () => {
    if (!selectedMember) return;

    // Set timezone
    updateUserPreferences({ timezone: selectedMember.tz });

    // Store identity
    localStorage.setItem('ocmui_selected_team_member', JSON.stringify({
      name: selectedMember.name,
      timezone: selectedMember.tz,
      github: selectedMember.github,
      jira: selectedMember.jira
    }));

    // Propagate github/jira to Settings if available
    if (selectedMember.github || selectedMember.jira) {
      const updatedTokens = { ...apiTokens };
      if (selectedMember.github) {
        updatedTokens.githubUsername = selectedMember.github;
      }
      if (selectedMember.jira) {
        updatedTokens.jiraUsername = selectedMember.jira;
      }
      saveSettings(updatedTokens);
    }

    // Log the user identification for audit trail
    await identifyUser(selectedMember.name);

    console.log(`✅ First-run identity set: ${selectedMember.name}`);
    onComplete();
  };

  const handleAddNewMember = () => {
    setIsAddingNew(true);
    setSelectedMember(null);
    // Default to user's system timezone
    setNewMember({ 
      name: '', 
      role: '', 
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      github: '',
      jira: ''
    });
  };

  const handleSaveNewMember = async () => {
    if (!newMember.name.trim() || !newMember.tz) {
      alert('Please enter at least your name and timezone');
      return;
    }

    const trimmedMember: TeamMember = {
      name: newMember.name.trim(),
      role: newMember.role.trim() || 'team member',
      tz: newMember.tz,
      github: newMember.github?.trim() || undefined,
      jira: newMember.jira?.trim() || undefined
    };

    // Try server API first (Phase 4)
    try {
      const response = await auditFetch('/api/team/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trimmedMember)
      });
      if (response.ok) {
        console.log(`✅ Added member ${trimmedMember.name} via API`);
        // Reload members from server
        await loadMembers();
        // Select the new member
        setSelectedMember(trimmedMember);
        setIsAddingNew(false);
        return;
      }
      if (response.status === 409) {
        alert(`Member "${trimmedMember.name}" already exists`);
        return;
      }
    } catch (error) {
      console.warn('API not available, using localStorage fallback');
    }

    // Fallback: save to localStorage
    const updatedMembers = [trimmedMember, ...members];
    setMembers(updatedMembers);
    localStorage.setItem('ocmui_timeboard_members', JSON.stringify(updatedMembers));

    // Select the new member
    setSelectedMember(trimmedMember);
    setIsAddingNew(false);
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="first-run-modal-backdrop">
      <div className="first-run-modal-content">
        <div className="first-run-modal-header">
          <h2>👋 Welcome to OCMUI Team Dashboard</h2>
          <p>Please select yourself from the team roster to personalize your experience.</p>
        </div>

        {loading ? (
          <div className="first-run-loading">Loading team members...</div>
        ) : (
          <>
            <div className="first-run-search">
              <input
                type="search"
                placeholder="Search by name or role..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                autoFocus
              />
              <button 
                className="first-run-add-btn"
                onClick={handleAddNewMember}
                title="Not in the list? Add yourself"
              >
                + I'm not listed
              </button>
            </div>

            {isAddingNew ? (
              <div className="first-run-add-form">
                <h3>Add Yourself</h3>
                <div className="first-run-form-row">
                  <label>Name *</label>
                  <input
                    type="text"
                    placeholder="Your name"
                    value={newMember.name}
                    onChange={(e) => setNewMember(prev => ({ ...prev, name: e.target.value }))}
                    maxLength={50}
                  />
                </div>
                <div className="first-run-form-row">
                  <label>Role</label>
                  <input
                    type="text"
                    placeholder="e.g., dev, qe, manager"
                    value={newMember.role}
                    onChange={(e) => setNewMember(prev => ({ ...prev, role: e.target.value }))}
                    maxLength={30}
                  />
                </div>
                <div className="first-run-form-row">
                  <label>Timezone *</label>
                  <select
                    value={newMember.tz}
                    onChange={(e) => setNewMember(prev => ({ ...prev, tz: e.target.value }))}
                  >
                    {commonTimezones.map(tz => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                </div>
                <div className="first-run-form-row">
                  <label>GitHub Username</label>
                  <input
                    type="text"
                    placeholder="your-github-username"
                    value={newMember.github || ''}
                    onChange={(e) => setNewMember(prev => ({ ...prev, github: e.target.value }))}
                    maxLength={40}
                  />
                </div>
                <div className="first-run-form-row">
                  <label>JIRA Email</label>
                  <input
                    type="email"
                    placeholder="you@redhat.com"
                    value={newMember.jira || ''}
                    onChange={(e) => setNewMember(prev => ({ ...prev, jira: e.target.value }))}
                    maxLength={60}
                  />
                </div>
                <div className="first-run-form-actions">
                  <button onClick={() => setIsAddingNew(false)} className="first-run-btn-secondary">
                    Cancel
                  </button>
                  <button onClick={handleSaveNewMember} className="first-run-btn-primary">
                    Add & Select Me
                  </button>
                </div>
              </div>
            ) : (
              <div className="first-run-members-list">
                {filteredMembers.length === 0 ? (
                  <div className="first-run-empty">
                    No team members found. Click "+ I'm not listed" to add yourself.
                  </div>
                ) : (
                  filteredMembers.map((member) => (
                    <div
                      key={`${member.name}-${member.tz}`}
                      className={`first-run-member-card ${selectedMember?.name === member.name ? 'selected' : ''}`}
                      onClick={() => handleSelectMember(member)}
                    >
                      <div className="member-name">{member.name}</div>
                      <div className="member-details">
                        <span className="member-role">{member.role}</span>
                        <span className="member-tz">{member.tz}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}

        <div className="first-run-modal-footer">
          {selectedMember && !isAddingNew && (
            <div className="first-run-selection">
              Selected: <strong>{selectedMember.name}</strong>
            </div>
          )}
          <button
            className="first-run-confirm-btn"
            onClick={handleConfirmSelection}
            disabled={!selectedMember || isAddingNew}
          >
            Continue as {selectedMember?.name || '...'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default FirstRunIdentityModal;
