import React, { useState } from 'react';

type FindType = 'jira' | 'pr';

interface QuickFindBarProps {
  onFind: (type: FindType, value: string) => void;
}

const QuickFindBar: React.FC<QuickFindBarProps> = ({ onFind }) => {
  const [findType, setFindType] = useState<FindType>('jira');
  const [inputValue, setInputValue] = useState('');

  const handleFind = () => {
    const trimmedValue = inputValue.trim();
    if (!trimmedValue) return;

    if (findType === 'jira') {
      // Normalize JIRA ID - add OCMUI- prefix if just a number
      let jiraId = trimmedValue.toUpperCase();
      if (/^\d+$/.test(jiraId)) {
        jiraId = `OCMUI-${jiraId}`;
      }
      onFind('jira', jiraId);
    } else {
      // PR number - strip # if present and ensure it's a number
      const prNumber = trimmedValue.replace(/^#/, '');
      if (/^\d+$/.test(prNumber)) {
        onFind('pr', prNumber);
      }
    }
    
    // Clear input after find
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleFind();
    }
  };

  return (
    <div className="quick-find-bar">
      <select
        className="quick-find-select"
        value={findType}
        onChange={(e) => setFindType(e.target.value as FindType)}
      >
        <option value="jira">Jira Id:</option>
        <option value="pr">PR #:</option>
      </select>
      <input
        type="text"
        className="quick-find-input"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={findType === 'jira' ? 'OCMUI-1234' : '1234'}
      />
      <button
        className="quick-find-btn"
        onClick={handleFind}
        disabled={!inputValue.trim()}
      >
        Find
      </button>
    </div>
  );
};

export default QuickFindBar;
