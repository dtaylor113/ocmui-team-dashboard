import React, { useState, useEffect, useMemo } from 'react';

interface UrlCheckResult {
  url: string;
  status: number | string;
  category: 'success' | 'redirect' | 'client_error' | 'server_error' | 'request_error' | 'skipped';
  redirectUrl?: string;
  redirectStatus?: number;
  error?: string;
}

interface DocLinksSummary {
  total: number;
  success: number;
  redirects: number;
  redirectErrors: number;
  clientErrors: number;
  serverErrors: number;
  requestErrors: number;
  skipped: number;
}

interface DocLinksResponse {
  success: boolean;
  results: UrlCheckResult[];
  summary: DocLinksSummary;
  lastChecked: string;
  source: string;
}

type FilterType = 'all' | 'success' | 'redirects' | 'errors' | 'client-errors' | 'server-errors';

interface ProgressState {
  stage: 'fetching' | 'checking' | 'redirects';
  current: number;
  total: number;
  message: string;
}

const DocLinksPanel: React.FC = () => {
  const [results, setResults] = useState<UrlCheckResult[]>([]);
  const [summary, setSummary] = useState<DocLinksSummary | null>(null);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [progress, setProgress] = useState<ProgressState | null>(null);

  const fetchDocLinks = (forceRefresh = false) => {
    if (forceRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    setProgress(null);
    
    // Use Server-Sent Events for real-time progress
    const url = forceRefresh ? '/api/doc-links/stream?refresh=true' : '/api/doc-links/stream';
    const eventSource = new EventSource(url);
    
    eventSource.addEventListener('progress', (event) => {
      const data = JSON.parse(event.data);
      setProgress(data);
    });
    
    eventSource.addEventListener('complete', (event) => {
      const data: DocLinksResponse = JSON.parse(event.data);
      setResults(data.results);
      setSummary(data.summary);
      setLastChecked(data.lastChecked);
      setLoading(false);
      setRefreshing(false);
      setProgress(null);
      eventSource.close();
    });
    
    eventSource.addEventListener('error', (event) => {
      // Check if it's an SSE error event with data
      if (event instanceof MessageEvent) {
        const data = JSON.parse(event.data);
        setError(data.error || 'Failed to fetch doc links');
      } else {
        // Connection error
        setError('Connection lost while checking links');
      }
      setLoading(false);
      setRefreshing(false);
      setProgress(null);
      eventSource.close();
    });
    
    eventSource.onerror = () => {
      // Only handle error if we haven't received data yet
      if (loading || refreshing) {
        setError('Connection error while checking links');
        setLoading(false);
        setRefreshing(false);
        setProgress(null);
      }
      eventSource.close();
    };
  };

  useEffect(() => {
    fetchDocLinks();
  }, []);

  // Filter and search results
  const filteredResults = useMemo(() => {
    let filtered = results;
    
    // Apply category filter
    switch (filter) {
      case 'success':
        filtered = filtered.filter(r => r.category === 'success');
        break;
      case 'redirects':
        filtered = filtered.filter(r => r.category === 'redirect');
        break;
      case 'errors':
        filtered = filtered.filter(r => 
          r.category === 'client_error' || 
          r.category === 'server_error' || 
          r.category === 'request_error'
        );
        break;
      case 'client-errors':
        filtered = filtered.filter(r => r.category === 'client_error');
        break;
      case 'server-errors':
        filtered = filtered.filter(r => r.category === 'server_error');
        break;
    }
    
    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(r => 
        r.url.toLowerCase().includes(query) ||
        (r.redirectUrl && r.redirectUrl.toLowerCase().includes(query))
      );
    }
    
    return filtered;
  }, [results, filter, searchQuery]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (result: UrlCheckResult) => {
    const status = typeof result.status === 'number' ? result.status : 0;
    
    switch (result.category) {
      case 'success':
        return <span className="dl-status-badge dl-status-success">✓ {status}</span>;
      case 'redirect':
        const redirectOk = result.redirectStatus && result.redirectStatus >= 200 && result.redirectStatus < 300;
        return (
          <span className={`dl-status-badge ${redirectOk ? 'dl-status-redirect-ok' : 'dl-status-redirect-warn'}`}>
            ↪ {status}
          </span>
        );
      case 'client_error':
        return <span className="dl-status-badge dl-status-error">✗ {status}</span>;
      case 'server_error':
        return <span className="dl-status-badge dl-status-error">⚠ {status}</span>;
      case 'request_error':
        return <span className="dl-status-badge dl-status-error">⚡ Error</span>;
      case 'skipped':
        return <span className="dl-status-badge dl-status-skipped">— Skip</span>;
      default:
        return <span className="dl-status-badge">{result.status}</span>;
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'success': return 'OK';
      case 'redirect': return 'Redirect';
      case 'client_error': return '4xx Error';
      case 'server_error': return '5xx Error';
      case 'request_error': return 'Network Error';
      case 'skipped': return 'Skipped';
      default: return category;
    }
  };

  // Extract domain from URL for display
  const getDomain = (url: string) => {
    try {
      const u = new URL(url);
      return u.hostname;
    } catch {
      return url;
    }
  };

  // Truncate URL path for display
  const truncateUrl = (url: string, maxLength = 80) => {
    if (url.length <= maxLength) return url;
    try {
      const u = new URL(url);
      const pathParts = u.pathname.split('/').filter(Boolean);
      if (pathParts.length <= 2) return url;
      return `${u.origin}/.../${pathParts.slice(-2).join('/')}`;
    } catch {
      return url.substring(0, maxLength) + '...';
    }
  };

  if (loading || refreshing) {
    return (
      <div className="dl-panel">
        <div className="dl-loading">
          <div className="dl-loading-spinner"></div>
          <p className="dl-progress-message">
            {progress?.message || (refreshing ? 'Re-checking documentation links...' : 'Checking documentation links...')}
          </p>
          {progress && progress.total > 0 && (
            <div className="dl-progress-bar-container">
              <div 
                className="dl-progress-bar" 
                style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
              />
            </div>
          )}
          <small>
            {progress?.stage === 'fetching' && 'Connecting to uhc-portal...'}
            {progress?.stage === 'checking' && `${progress.current} of ${progress.total} URLs checked`}
            {progress?.stage === 'redirects' && `${progress.current} of ${progress.total} redirects verified`}
            {!progress && (refreshing ? 'Refreshing cached data...' : 'This may take a moment for the first load')}
          </small>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dl-panel">
        <div className="dl-error">
          <div className="dl-error-icon">❌</div>
          <h3>Error Loading Doc Links</h3>
          <p>{error}</p>
          <button className="dl-retry-btn" onClick={() => fetchDocLinks()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const totalErrors = (summary?.clientErrors || 0) + (summary?.serverErrors || 0) + (summary?.requestErrors || 0);

  return (
    <div className="dl-panel">
      {/* Header */}
      <div className="dl-header">
        <div className="dl-header-title">
          <h2>🔗 Doc Links Health Check</h2>
          <span className="dl-subtitle">
            uhc-portal external documentation links
          </span>
        </div>
        <div className="dl-header-actions">
          <span className="dl-last-checked">
            Last checked: {formatDate(lastChecked)}
          </span>
          <button 
            className="dl-refresh-btn" 
            onClick={() => fetchDocLinks(true)} 
            disabled={refreshing}
            title="Force re-check all URLs"
          >
            {refreshing ? '⏳ Checking...' : '🔄 Refresh'}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="dl-summary">
          <div 
            className={`dl-summary-card ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            <div className="dl-summary-value">{summary.total}</div>
            <div className="dl-summary-label">Total URLs</div>
          </div>
          <div 
            className={`dl-summary-card dl-summary-success ${filter === 'success' ? 'active' : ''}`}
            onClick={() => setFilter('success')}
          >
            <div className="dl-summary-value">{summary.success}</div>
            <div className="dl-summary-label">✓ OK (200)</div>
          </div>
          <div 
            className={`dl-summary-card dl-summary-redirect ${filter === 'redirects' ? 'active' : ''}`}
            onClick={() => setFilter('redirects')}
          >
            <div className="dl-summary-value">{summary.redirects}</div>
            <div className="dl-summary-label">↪ Redirects</div>
          </div>
          {totalErrors > 0 && (
            <div 
              className={`dl-summary-card dl-summary-error ${filter === 'errors' ? 'active' : ''}`}
              onClick={() => setFilter('errors')}
            >
              <div className="dl-summary-value">{totalErrors}</div>
              <div className="dl-summary-label">⚠ Errors</div>
            </div>
          )}
          {summary.clientErrors > 0 && (
            <div 
              className={`dl-summary-card dl-summary-404 ${filter === 'client-errors' ? 'active' : ''}`}
              onClick={() => setFilter('client-errors')}
            >
              <div className="dl-summary-value">{summary.clientErrors}</div>
              <div className="dl-summary-label">✗ 4xx Errors</div>
            </div>
          )}
        </div>
      )}

      {/* Search and filters */}
      <div className="dl-controls">
        <div className="dl-search">
          <input
            type="text"
            placeholder="Search URLs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="dl-search-input"
          />
          {searchQuery && (
            <button className="dl-search-clear" onClick={() => setSearchQuery('')}>
              ×
            </button>
          )}
        </div>
        <div className="dl-filter-info">
          Showing {filteredResults.length} of {results.length} URLs
        </div>
      </div>

      {/* Results table */}
      <div className="dl-table-container">
        <table className="dl-table">
          <thead>
            <tr>
              <th className="dl-th-status">Status</th>
              <th className="dl-th-category">Type</th>
              <th className="dl-th-url">URL</th>
              <th className="dl-th-domain">Domain</th>
            </tr>
          </thead>
          <tbody>
            {filteredResults.length === 0 ? (
              <tr>
                <td colSpan={4} className="dl-empty">
                  No URLs match your search criteria
                </td>
              </tr>
            ) : (
              filteredResults.map((result, index) => (
                <tr 
                  key={`${result.url}-${index}`} 
                  className={`dl-row dl-row-${result.category}`}
                >
                  <td className="dl-cell-status">
                    {getStatusBadge(result)}
                  </td>
                  <td className="dl-cell-category">
                    <span className={`dl-category-badge dl-category-${result.category}`}>
                      {getCategoryLabel(result.category)}
                    </span>
                  </td>
                  <td className="dl-cell-url">
                    <a 
                      href={result.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="dl-url-link"
                      title={result.url}
                    >
                      {truncateUrl(result.url)}
                    </a>
                    {result.redirectUrl && (
                      <div className="dl-redirect-target">
                        ↪ <a 
                          href={result.redirectUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="dl-url-link dl-url-secondary"
                          title={result.redirectUrl}
                        >
                          {truncateUrl(result.redirectUrl, 60)}
                        </a>
                        {result.redirectStatus && (
                          <span className={`dl-redirect-status ${result.redirectStatus >= 200 && result.redirectStatus < 300 ? 'ok' : 'warn'}`}>
                            ({result.redirectStatus})
                          </span>
                        )}
                      </div>
                    )}
                    {result.error && (
                      <div className="dl-error-detail">
                        ⚡ {result.error}
                      </div>
                    )}
                  </td>
                  <td className="dl-cell-domain">
                    <span className="dl-domain">{getDomain(result.url)}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer with link to GitHub action */}
      <div className="dl-footer">
        <a 
          href="https://github.com/RedHatInsights/uhc-portal/actions/workflows/check-links.yml"
          target="_blank"
          rel="noopener noreferrer"
          className="dl-github-link"
        >
          📋 View GitHub Actions workflow
        </a>
        <span className="dl-source-info">
          Data sourced from uhc-portal installLinks.mjs + supportLinks.mjs
        </span>
      </div>
    </div>
  );
};

export default DocLinksPanel;
