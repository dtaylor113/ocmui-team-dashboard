# 🎯 OCMUI Team Dashboard

> Modern React-based dashboard that unifies GitHub PR management with JIRA ticket tracking to streamline developer workflows for the Red Hat OCMUI team.

## ✨ Features

- **🔗 GitHub Integration**: Track PRs, code reviews, and repository activity  
- **📋 JIRA Integration**: Manage sprint tickets, view descriptions, comments with advanced markdown rendering
- **🌐 Unified Dashboard**: Single interface combining both platforms with auto-associations
- **⏰ Team Timeboard**: Multi-timezone team dashboard with business hours detection
- **🚀 Developer Productivity**: Reduce context switching between GitHub and JIRA
- **🛎 Activity Badges**: 
  - PR reviewer badges show a top-right notification circle for new or edited comments since last view
  - JIRA Comments section shows a superscript notification badge for new or edited comments since last view
  - Age-based urgency for PR badges (white/yellow/red outline)
  - “Needs Rebase” badge on PRs when branch is behind or has conflicts
  - “Ready to Merge” badge when 3+ approvals, checks pass, and branch is up-to-date (hides Checks badge)
- 
## 📱 Interface

### Navigation Tabs
1. **My Sprint JIRAs** - Current sprint tickets with status tracking
2. **My Code Reviews** - PRs awaiting user review 
3. **My PRs** - Personal PRs with open/closed filtering  
4. **JIRA Lookup** - Search any JIRA ticket with history

### Key Features
- **Auto-Association**: Click any JIRA to see related PRs, or any PR to see related JIRAs
- **Rich Markdown**: Full GitHub and JIRA markdown rendering with image support
- **Smart Caching**: Background updates with React Query
- **Timezone Awareness**: All timestamps in your selected timezone
- **Team Dashboard**: View all team members' local times simultaneously
 - **Comment Awareness**: JIRA comments sorted by latest activity (updated if present); edited comments labeled “(edited)”
 - **Accurate PR Checks**: Checks badge reflects GitHub combined status and shows failing/pending context names in a tooltip

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Yarn package manager
- GitHub personal access token
- Red Hat JIRA personal access token

### Installation & Setup

1. **Clone the repository**
   ```bash
   git clone git@github.com:dtaylor113/ocmui-team-dashboard.git
   cd ocmui-team-dashboard
   ```

2. **Install dependencies**
   ```bash
   yarn install
   ```

3. **Start the application**
   ```bash
   yarn start
   ```
   - Builds and serves the application at `http://localhost:3017`
   - **Single server setup** - Production-ready architecture
   - Automatically opens in browser

4. **Configure tokens**
   - Click Settings ⚙️ in the top-right corner
   - Add your GitHub personal access token
   - Add your JIRA token and email address
   - Settings are saved locally in your browser

## 🔧 Development (optional)

```bash
yarn start:dev
```
- **API Server**: `http://localhost:3017` (Express.js)
- **React App**: `http://localhost:5174` (Vite HMR)

## 📖 Documentation

- See `APP_TECH_NOTES.md` for detailed architecture, backend, and API integration.

## 🌍 Team Timeboard

- **Multi-timezone Support**: View all team members' local times
- **Business Hours Detection**: Visual indicators for off-hours
- **Identity Selection**: "I am..." feature for easy timezone setup
- **Reference Time Mode**: Compare times across timezones

## 🐛 Troubleshooting

### Common Issues

**Port 3017 already in use:**
```bash
lsof -ti:3017 | xargs kill -9
yarn start
```

**GitHub images not loading:**
- Images automatically fallback to clickable links when blocked
- Use `yarn start` (single server) for optimal image loading

**JIRA authentication errors:**
- Verify your JIRA token in Settings
- Ensure you're using a Personal Access Token, not password
- Check your Red Hat JIRA access

## 📖 Documentation

- **[APP_TECH_NOTES.md](APP_TECH_NOTES.md)** - Complete technical documentation
- **Component Architecture** - Detailed React component structure
- **API Integration** - GitHub and JIRA API usage patterns
- **Deployment Guide** - Production setup instructions

## 📄 License

MIT License - see LICENSE file for details

---

**Built for the Red Hat OCMUI Team** 🚀