import React, { useState, useEffect, useMemo } from 'react';
import { auditFetch } from '../utils/auditFetch';

interface FeatureFlag {
  name: string;
  inCode: boolean;
  staging: 'ON' | 'OFF' | '-';
  production: 'ON' | 'OFF' | '-';
  mismatch: boolean;
  strategy: string;
  stagingOnly: boolean;
  prodOnly: boolean;
  modifiedBy: string | null;
  modifiedAt: string | null;
  modifiedAction: string | null;
  modifiedFromStaging?: boolean;
}

interface FlagsSummary {
  total: number;
  prodOn: number;
  notReleased: number;
  stagingOnly: number;
  prodOnly: number;
  orgRestricted: number;
}

interface FlagsResponse {
  success: boolean;
  flags: FeatureFlag[];
  summary: FlagsSummary;
  prefix: string;
}

type FilterType = 'all' | 'not-released' | 'staging-only' | 'prod-on' | 'org-restricted';

const FeatureFlagsPanel: React.FC = () => {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [summary, setSummary] = useState<FlagsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [configured, setConfigured] = useState<boolean | null>(null);

  const fetchFlags = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // First check if Unleash is configured
      const statusRes = await auditFetch('/api/unleash/status');
      const statusData = await statusRes.json();
      
      if (!statusData.configured) {
        setConfigured(false);
        setError('Unleash API tokens not configured on server');
        setLoading(false);
        return;
      }
      
      setConfigured(true);
      
      // Fetch flags
      const res = await auditFetch('/api/unleash/flags');
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg = errData.hint ? `${errData.error} ${errData.hint}` : (errData.error || `HTTP ${res.status}`);
        throw new Error(msg);
      }
      
      const data: FlagsResponse = await res.json();
      setFlags(data.flags);
      setSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch feature flags');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlags();
  }, []);

  // Filter and search flags
  const filteredFlags = useMemo(() => {
    let result = flags;
    
    // Apply filter
    switch (filter) {
      case 'not-released':
        result = result.filter(f => f.mismatch);
        break;
      case 'staging-only':
        result = result.filter(f => f.stagingOnly);
        break;
      case 'prod-on':
        result = result.filter(f => f.production === 'ON');
        break;
      case 'org-restricted':
        result = result.filter(f => f.strategy.includes('org'));
        break;
    }
    
    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(f => 
        f.name.toLowerCase().includes(query) ||
        (f.modifiedBy && f.modifiedBy.toLowerCase().includes(query))
      );
    }
    
    return result;
  }, [flags, filter, searchQuery]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getStatusBadge = (flag: FeatureFlag) => {
    if (flag.mismatch) {
      return (
        <span className="ff-status-badge ff-status-warning">
          ⚠️ Not Released
        </span>
      );
    }
    if (flag.stagingOnly) {
      return (
        <span className="ff-status-badge ff-status-staging">
          Staging only
        </span>
      );
    }
    if (flag.prodOnly) {
      return (
        <span className="ff-status-badge ff-status-prod-only">
          Prod only
        </span>
      );
    }
    if (flag.production === 'ON') {
      return (
        <span className="ff-status-badge ff-status-released">
          Released
        </span>
      );
    }
    return (
      <span className="ff-status-badge ff-status-off">
        OFF
      </span>
    );
  };

  if (loading) {
    return (
      <div className="ff-panel">
        <div className="ff-loading">
          <div className="ff-loading-spinner"></div>
          <p>Loading feature flags from Unleash...</p>
          <small>Comparing staging and production environments</small>
        </div>
      </div>
    );
  }

  if (configured === false) {
    return (
      <div className="ff-panel">
        <div className="ff-not-configured">
          <div className="ff-not-configured-icon">🔧</div>
          <h3>Unleash Not Configured</h3>
          <p>Feature flag integration requires Unleash API tokens to be configured on the server.</p>
          <div className="ff-config-help">
            <p>Required environment variables:</p>
            <code>UNLEASH_STAGING_TOKEN</code>
            <code>UNLEASH_PROD_TOKEN</code>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ff-panel">
        <div className="ff-error">
          <div className="ff-error-icon">❌</div>
          <h3>Error Loading Feature Flags</h3>
          <p>{error}</p>
          <button className="ff-retry-btn" onClick={fetchFlags}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ff-panel">
      {/* Header with summary */}
      <div className="ff-header">
        <div className="ff-header-title">
          <h2>🚩 Feature Flags</h2>
          <span className="ff-subtitle">Staging vs Production Comparison</span>
        </div>
        <button className="ff-refresh-btn" onClick={fetchFlags} title="Refresh">
          🔄 Refresh
        </button>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="ff-summary">
          <div 
            className={`ff-summary-card ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            <div className="ff-summary-value">{summary.total}</div>
            <div className="ff-summary-label">Total Flags</div>
          </div>
          <div 
            className={`ff-summary-card ff-summary-on ${filter === 'prod-on' ? 'active' : ''}`}
            onClick={() => setFilter('prod-on')}
          >
            <div className="ff-summary-value">{summary.prodOn}</div>
            <div className="ff-summary-label">Prod ON</div>
          </div>
          {summary.notReleased > 0 && (
            <div 
              className={`ff-summary-card ff-summary-warning ${filter === 'not-released' ? 'active' : ''}`}
              onClick={() => setFilter('not-released')}
            >
              <div className="ff-summary-value">{summary.notReleased}</div>
              <div className="ff-summary-label">⚠️ Not Released</div>
            </div>
          )}
          {summary.stagingOnly > 0 && (
            <div 
              className={`ff-summary-card ff-summary-staging ${filter === 'staging-only' ? 'active' : ''}`}
              onClick={() => setFilter('staging-only')}
            >
              <div className="ff-summary-value">{summary.stagingOnly}</div>
              <div className="ff-summary-label">Staging Only</div>
            </div>
          )}
          {summary.orgRestricted > 0 && (
            <div 
              className={`ff-summary-card ff-summary-org ${filter === 'org-restricted' ? 'active' : ''}`}
              onClick={() => setFilter('org-restricted')}
            >
              <div className="ff-summary-value">{summary.orgRestricted}</div>
              <div className="ff-summary-label">Org Restricted</div>
            </div>
          )}
        </div>
      )}

      {/* Search and filters */}
      <div className="ff-controls">
        <div className="ff-search">
          <input
            type="text"
            placeholder="Search flags by name or author..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="ff-search-input"
          />
          {searchQuery && (
            <button className="ff-search-clear" onClick={() => setSearchQuery('')}>
              ×
            </button>
          )}
        </div>
        <div className="ff-filter-info">
          Showing {filteredFlags.length} of {flags.length} flags
        </div>
      </div>

      {/* Flags table */}
      <div className="ff-table-container">
        <table className="ff-table">
          <thead>
            <tr>
              <th className="ff-th-name">Flag Name</th>
              <th className="ff-th-incode">In Code?</th>
              <th className="ff-th-env">Stage</th>
              <th className="ff-th-env">Prod</th>
              <th className="ff-th-strategy">Strategy</th>
              <th className="ff-th-status">Status / Last Modified (Prod or fallback to Stage)</th>
            </tr>
          </thead>
          <tbody>
            {filteredFlags.length === 0 ? (
              <tr>
                <td colSpan={6} className="ff-empty">
                  No flags match your search criteria
                </td>
              </tr>
            ) : (
              filteredFlags.map(flag => (
                <tr 
                  key={flag.name} 
                  className={`ff-row ${flag.mismatch ? 'ff-row-warning' : ''}`}
                >
                  <td className="ff-cell-name">
                    <span className="ff-flag-name">{flag.name}</span>
                  </td>
                  <td className="ff-cell-incode">
                    <span className={`ff-incode-badge ${flag.inCode ? 'ff-incode-yes' : 'ff-incode-no'}`}>
                      {flag.inCode ? '✓' : '✗'}
                    </span>
                  </td>
                  <td className="ff-cell-env">
                    <span className={`ff-env-badge ff-env-${flag.staging.toLowerCase()}`}>
                      {flag.staging}
                    </span>
                  </td>
                  <td className="ff-cell-env">
                    <span className={`ff-env-badge ff-env-${flag.production.toLowerCase()}`}>
                      {flag.production}
                    </span>
                  </td>
                  <td className="ff-cell-strategy">
                    <span className={`ff-strategy ${flag.strategy.includes('org') ? 'ff-strategy-org' : ''}`}>
                      {flag.strategy}
                    </span>
                  </td>
                  <td className="ff-cell-status">
                    {getStatusBadge(flag)}
                    {(flag.modifiedBy || flag.modifiedAt) && (
                      <span className="ff-modified">
                        {flag.modifiedBy && <>by {flag.modifiedBy}</>}
                        {flag.modifiedAt && (flag.modifiedBy ? ` (${formatDate(flag.modifiedAt)})` : formatDate(flag.modifiedAt))}
                        {flag.modifiedFromStaging && ' (stage)'}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FeatureFlagsPanel;
