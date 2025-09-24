import { marked } from 'marked';
import { WikiMarkupTransformer } from '@atlaskit/editor-wikimarkup-transformer';

// Complex image caching removed - not needed when serving from same origin (localhost:3017)
// Images now load directly like the old JS app

/**
 * Parse GitHub markdown to HTML (simplified - no caching needed on same origin)
 * Uses the marked library to convert GitHub Flavored Markdown to HTML
 * Same configuration as plain JS app for consistency
 * @param markdown - Raw markdown text  
 * @param token - GitHub token (not needed for image display on same origin)
 * @returns Promise<string> - HTML string with direct image loading
 */
/**
 * Add graceful fallback for broken images - converts them to clickable links
 * @param html - HTML string containing img tags
 * @returns HTML string with onerror handlers added to img tags
 */
function addImageFallback(html: string): string {
  return html.replace(/<img([^>]+)>/g, (match, attributes) => {
    // Extract src and alt from the attributes
    const srcMatch = attributes.match(/src=["']([^"']+)["']/);
    const altMatch = attributes.match(/alt=["']([^"']*)["']/);
    
    const src = srcMatch ? srcMatch[1] : '';
    const alt = altMatch ? altMatch[1] : 'image';
    
    if (!src) return match; // Keep original if no src found
    
    // Generate a unique ID for this image to handle the fallback
    const imageId = 'img_' + Math.random().toString(36).substr(2, 9);
    
    return `<img${attributes} id="${imageId}" onerror="
      this.style.display='none'; 
      document.getElementById('${imageId}_fallback').style.display='inline-block';
    ">
    <a 
      id="${imageId}_fallback" 
      href="${src}" 
      target="_blank" 
      rel="noopener noreferrer" 
      class="github-image-fallback" 
      style="display:none;"
      title="Click to open image: ${alt}"
    >
      🖼️ ${alt || 'View Image'}
    </a>`;
  });
}

export async function parseGitHubMarkdown(markdown: string, _token?: string): Promise<string> {
  if (!markdown) return '';
  
  console.log('📝 parseGitHubMarkdown called with:', {
    length: markdown.length,
    hasImages: /!\[[^\]]*\]\([^)]+\)|<img[^>]+>/i.test(markdown),
    preview: markdown.substring(0, 200) + (markdown.length > 200 ? '...' : '')
  });
  
  try {
    // Configure marked for GitHub Flavored Markdown (same as plain JS app)
    marked.setOptions({
      breaks: true,          // Convert line breaks to <br>
      gfm: true,            // GitHub Flavored Markdown
      sanitize: false,      // Don't sanitize HTML (we trust GitHub content)
      smartLists: true,     // Better list handling
      smartypants: false    // Don't convert quotes/dashes
    });
    
    let html = marked(markdown) as string;
    
    // Add graceful fallback for broken images
    html = addImageFallback(html);
    
    console.log('📄 Final GitHub markdown HTML (same origin - direct loading with fallback):', {
      length: html.length,
      hasImgTags: /<img[^>]+>/i.test(html),
      preview: html.substring(0, 300) + (html.length > 300 ? '...' : '')
    });
    
    return html;
  } catch (error) {
    console.error('❌ GitHub markdown parsing error:', error);
    return parseBasicMarkdown(markdown);
  }
}

/**
 * Synchronous version for backwards compatibility
 * @deprecated Use parseGitHubMarkdown (async) instead
 */
export function parseGitHubMarkdownSync(markdown: string): string {
  if (!markdown) return '';
  
  try {
    marked.setOptions({
      breaks: true,
      gfm: true,
      sanitize: false,
      smartLists: true,
      smartypants: false
    });
    
    return marked(markdown) as string;
  } catch (error) {
    console.error('❌ GitHub markdown parsing error:', error);
    return parseBasicMarkdown(markdown);
  }
}

/**
 * Basic markdown parser as fallback when marked library fails
 * @param markdown - Raw markdown text
 * @returns HTML string
 */
function parseBasicMarkdown(markdown: string): string {
  if (!markdown) return '';
  
  let html = markdown;
  
  // Headers
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  
  // Bold
  html = html.replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>');
  html = html.replace(/\*(.*)\*/gim, '<em>$1</em>');
  
  // Code blocks
  html = html.replace(/```([^`]*)```/gim, '<pre><code>$1</code></pre>');
  html = html.replace(/`([^`]*)`/gim, '<code>$1</code>');
  
  // Images - let them load directly like the old JS app (using browser session/cookies)
  html = html.replace(/!\[([^\]]*)\]\(([^)]*)\)/gim, (_, alt, src) => {
    return `<img src="${src}" alt="${alt}" loading="lazy" />`;
  });
  
  // Add graceful fallback for broken images
  html = addImageFallback(html);
  
  // Links
  html = html.replace(/\[([^\]]*)\]\(([^)]*)\)/gim, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  
  // Line breaks
  html = html.replace(/\n/gim, '<br>');
  
  return html;
}

/**
 * Parse JIRA wiki markup to HTML using official Atlassian library
 * Uses @atlaskit/editor-wikimarkup-transformer for proper JIRA formatting
 * @param jiraText - Raw JIRA wiki markup text
 * @param jiraKey - Optional JIRA ticket key for constructing image links
 * @param attachments - Optional attachment mapping for proper image URLs
 * @returns HTML string
 */
export async function parseJiraMarkdown(jiraText: string, jiraKey?: string, attachments?: Record<string, any>, token?: string): Promise<string> {
  if (!jiraText) return '';
  
  // Check for potential images in the content
  const hasImageSyntax = /!([^!]+)(!|\|)/.test(jiraText);
  if (hasImageSyntax) {
    console.log('🖼️ JIRA content appears to contain images, processing...');
  }
  
  try {
    // Use official Atlassian WikiMarkupTransformer
    const transformer = new WikiMarkupTransformer();
    
    // Transform wiki markup to ADF (Atlassian Document Format)
    const adfDocument = transformer.parse(jiraText);
    
    // Convert ADF to HTML with image caching
    const result = await convertAdfToHtml(adfDocument, jiraKey, attachments, token);
    
    if (hasImageSyntax && result.includes('<img')) {
      console.log('✅ Successfully processed JIRA images via ADF converter');
    } else if (hasImageSyntax) {
      console.log('⚠️ JIRA content had image syntax but no <img> tags generated - may need fallback parsing');
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ JIRA wiki markup parsing error:', error);
    console.error('Falling back to basic JIRA parsing');
    // Fallback to basic parsing if official library fails
    return await parseBasicJiraMarkdown(jiraText, jiraKey, attachments);
  }
}


/**
 * Convert ADF (Atlassian Document Format) to HTML
 * @param adfNode - ADF document node
 * @param jiraKey - Optional JIRA ticket key for constructing image links
 * @param attachments - Optional attachment mapping for proper image URLs
 * @returns HTML string
 */
async function convertAdfToHtml(adfNode: any, jiraKey?: string, attachments?: Record<string, any>, token?: string): Promise<string> {
  // Simple ADF to HTML conversion
  // This is a basic implementation - could be enhanced with more ADF node types
  let html = '';
  
  if (adfNode.type.name === 'doc') {
    if (adfNode.content) {
      for (let i = 0; i < adfNode.content.childCount; i++) {
        html += await convertAdfToHtml(adfNode.content.child(i), jiraKey, attachments, token);
      }
    }
  } else if (adfNode.type.name === 'paragraph') {
    let content = '';
    if (adfNode.content) {
      for (let i = 0; i < adfNode.content.childCount; i++) {
        content += await convertAdfToHtml(adfNode.content.child(i), jiraKey, attachments, token);
      }
    }
    html += `<p>${content}</p>`;
  } else if (adfNode.type.name === 'text') {
    let text = adfNode.text || '';
    
    // Apply text marks (bold, italic, etc.)
    if (adfNode.marks) {
      adfNode.marks.forEach((mark: any) => {
        switch (mark.type.name) {
          case 'strong':
            text = `<strong>${text}</strong>`;
            break;
          case 'em':
            text = `<em>${text}</em>`;
            break;
          case 'code':
            text = `<code>${text}</code>`;
            break;
          case 'strike':
            text = `<del>${text}</del>`;
            break;
          case 'underline':
            text = `<u>${text}</u>`;
            break;
          case 'textColor':
            const color = mark.attrs?.color;
            if (color) {
              text = `<span style="color: ${color}">${text}</span>`;
            }
            break;
          case 'link':
            const href = mark.attrs?.href;
            if (href) {
              text = `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
            }
            break;
        }
      });
    }
    html += text;
  } else if (adfNode.type.name === 'bulletList') {
    let items = '';
    if (adfNode.content) {
      for (let i = 0; i < adfNode.content.childCount; i++) {
        items += await convertAdfToHtml(adfNode.content.child(i), jiraKey, attachments, token);
      }
    }
    html += `<ul>${items}</ul>`;
  } else if (adfNode.type.name === 'orderedList') {
    let items = '';
    if (adfNode.content) {
      for (let i = 0; i < adfNode.content.childCount; i++) {
        items += await convertAdfToHtml(adfNode.content.child(i), jiraKey, attachments, token);
      }
    }
    html += `<ol>${items}</ol>`;
  } else if (adfNode.type.name === 'listItem') {
    let content = '';
    if (adfNode.content) {
      for (let i = 0; i < adfNode.content.childCount; i++) {
        content += await convertAdfToHtml(adfNode.content.child(i), jiraKey, attachments, token);
      }
    }
    html += `<li>${content}</li>`;
  } else if (adfNode.type.name === 'heading') {
    const level = adfNode.attrs?.level || 1;
    let content = '';
    if (adfNode.content) {
      for (let i = 0; i < adfNode.content.childCount; i++) {
        content += await convertAdfToHtml(adfNode.content.child(i), jiraKey, attachments, token);
      }
    }
    html += `<h${level}>${content}</h${level}>`;
  } else if (adfNode.type.name === 'codeBlock') {
    const language = adfNode.attrs?.language || '';
    let code = '';
    if (adfNode.content) {
      for (let i = 0; i < adfNode.content.childCount; i++) {
        code += adfNode.content.child(i).text || '';
      }
    }
    html += `<pre><code class="language-${language}">${escapeHtml(code)}</code></pre>`;
  } else if (adfNode.type.name === 'blockquote') {
    let content = '';
    if (adfNode.content) {
      for (let i = 0; i < adfNode.content.childCount; i++) {
        content += await convertAdfToHtml(adfNode.content.child(i), jiraKey, attachments, token);
      }
    }
    html += `<blockquote>${content}</blockquote>`;
  } else if (adfNode.type.name === 'mediaSingle') {
    // JIRA image container
    let mediaContent = '';
    if (adfNode.content) {
      for (let i = 0; i < adfNode.content.childCount; i++) {
        mediaContent += await convertAdfToHtml(adfNode.content.child(i), jiraKey, attachments, token);
      }
    }
    const layout = adfNode.attrs?.layout || 'center';
    html += `<div class="jira-image-container jira-image-${layout}">${mediaContent}</div>`;
  } else if (adfNode.type.name === 'media') {
    // JIRA image/media node - use image caching system
    const attrs = adfNode.attrs || {};
    const imageUrl = attrs.url || attrs.id || '';
    const alt = attrs.alt || 'Image';
    const filename = imageUrl.split('/').pop() || alt || 'Image';
    
    console.log('🖼️ Processing ADF media node:', { imageUrl, attrs, jiraKey, hasAttachments: !!attachments });
    
    let finalImageUrl = null;
    
    // Check if we have a proper attachment URL for this filename
    if (attachments && filename && attachments[filename]) {
      const attachment = attachments[filename];
      finalImageUrl = attachment.url || attachment.thumbnail;  // Full-size first
      console.log(`📎 Found attachment mapping: ${filename} -> ${finalImageUrl}`);
    } else if (imageUrl && imageUrl.startsWith('http')) {
      finalImageUrl = imageUrl;
      console.log(`🖼️ Using direct URL: ${imageUrl}`);
    }
    
    if (finalImageUrl) {
      try {
        // Direct image loading (same origin - no caching needed)
        html += `<img src="${finalImageUrl}" alt="${filename}" loading="lazy" class="jira-image" />`;
        console.log(`✅ Direct JIRA image: ${filename} -> ${finalImageUrl}`);
      } catch (error) {
        console.error(`❌ Error processing JIRA image: ${filename}`, error);
        html += `<a href="${finalImageUrl}" target="_blank" rel="noopener noreferrer" class="github-image-link">📎 ${filename}</a>`;
      }
    } else if (jiraKey) {
      // Fallback - link to the JIRA ticket where user can see the image
      const jiraUrl = `https://issues.redhat.com/browse/${jiraKey}`;
      console.log(`🔗 Fallback to JIRA link: ${filename} -> ${jiraUrl}`);
      html += `<a href="${jiraUrl}" target="_blank" rel="noopener noreferrer" class="github-image-link">📎 ${filename} (see in JIRA)</a>`;
    } else {
      console.warn('⚠️ JIRA media node missing attachment mapping and no jiraKey provided:', attrs);
      const filename = imageUrl || alt || 'Image';
      html += `<span class="github-image-link">📎 ${filename}</span>`;
    }
  } else {
    // For unhandled node types, try to process children
    if (adfNode.content) {
      for (let i = 0; i < adfNode.content.childCount; i++) {
        html += convertAdfToHtml(adfNode.content.child(i), jiraKey, attachments);
      }
    }
  }
  
  return html;
}

/**
 * Sync version of parseBasicJiraMarkdown for backwards compatibility
 */
function parseBasicJiraMarkdownSync(jiraText: string, jiraKey?: string, attachments?: Record<string, any>): string {
  if (!jiraText) return '';
  
  let html = jiraText;
  
  // Convert line breaks to <br>
  html = html.replace(/\n/g, '<br>');
  
  // Bold text: *bold*
  html = html.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
  
  // Italic text: _italic_
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
  
  // Code: {{code}}
  html = html.replace(/\{\{([^}]+)\}\}/g, '<code>$1</code>');
  
  // Links: [text|url]
  html = html.replace(/\[([^|]+)\|([^\]]+)\]/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  
  // Simple image handling for sync version - just create links
  html = html.replace(/!([^!]+?)(?:\|([^!]*?))?!/g, (_, imageName) => {
    const filename = imageName.split('/').pop() || imageName || 'Image';
    if (attachments && filename && attachments[filename]) {
      const attachment = attachments[filename];
      const actualImageUrl = attachment.url || attachment.thumbnail;
      return `<img src="${actualImageUrl}" alt="${filename}" loading="lazy" class="jira-image" />`;
    } else if (imageName.startsWith('http')) {
      return `<img src="${imageName}" alt="${filename}" loading="lazy" class="jira-image" />`;
    } else if (jiraKey) {
      const jiraUrl = `https://issues.redhat.com/browse/${jiraKey}`;
      return `<a href="${jiraUrl}" target="_blank" rel="noopener noreferrer" class="github-image-link">📎 ${filename} (see in JIRA)</a>`;
    } else {
      return `<span class="github-image-link">📎 ${filename}</span>`;
    }
  });
  
  return html;
}

/**
 * Async Fallback JIRA parser for when official library fails with image caching
 * @param jiraText - Raw JIRA wiki markup text
 * @param jiraKey - Optional JIRA ticket key for constructing image links
 * @param attachments - Optional attachment mapping for proper image URLs
 * @param token - JIRA token for authenticated requests
 * @returns Promise<string> - HTML string with cached images
 */
async function parseBasicJiraMarkdown(jiraText: string, jiraKey?: string, attachments?: Record<string, any>, _token?: string): Promise<string> {
  if (!jiraText) return '';
  
  let html = jiraText;
  
  // Convert line breaks to <br>
  html = html.replace(/\n/g, '<br>');
  
  // Bold text: *bold*
  html = html.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
  
  // Italic text: _italic_
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
  
  // Code: {{code}}
  html = html.replace(/\{\{([^}]+)\}\}/g, '<code>$1</code>');
  
  // Links: [text|url]
  html = html.replace(/\[([^|]+)\|([^\]]+)\]/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  
  // Process images with caching - need to collect all matches first
  const imageRegex = /!([^!]+?)(?:\|([^!]*?))?!/g;
  const imageMatches: Array<{ match: string, imageName: string, index: number }> = [];
  let match;
  
  while ((match = imageRegex.exec(html)) !== null) {
    imageMatches.push({
      match: match[0],
      imageName: match[1],
      index: match.index
    });
  }
  
  // Process images in reverse order to maintain indices
  for (const imageMatch of imageMatches.reverse()) {
    const { match: fullMatch, imageName, index } = imageMatch;
    const filename = imageName.split('/').pop() || imageName || 'Image';
    
    let finalImageUrl = null;
    
    // Check if we have attachment mapping
    if (attachments && filename && attachments[filename]) {
      const attachment = attachments[filename];
      finalImageUrl = attachment.url || attachment.thumbnail;
      console.log(`📎 Found attachment mapping: ${filename} -> ${finalImageUrl}`);
    } else if (imageName.startsWith('http')) {
      finalImageUrl = imageName;
      console.log(`🖼️ Using direct URL: ${imageName}`);
    }
    
    let replacement = '';
    
    if (finalImageUrl) {
      // Direct image loading (same origin - no caching needed)
      replacement = `<img src="${finalImageUrl}" alt="${filename}" loading="lazy" class="jira-image" />`;
      console.log(`✅ Direct JIRA image: ${filename} -> ${finalImageUrl}`);
    } else if (jiraKey) {
      // Fallback to JIRA ticket link
      const jiraUrl = `https://issues.redhat.com/browse/${jiraKey}`;
      replacement = `<a href="${jiraUrl}" target="_blank" rel="noopener noreferrer" class="github-image-link">📎 ${filename} (see in JIRA)</a>`;
      console.log(`🔗 Fallback to JIRA link: ${filename} -> ${jiraUrl}`);
    } else {
      replacement = `<span class="github-image-link">📎 ${filename}</span>`;
    }
    
    // Replace the match at the specific index
    html = html.substring(0, index) + replacement + html.substring(index + fullMatch.length);
  }
  
  return html;
}

/**
 * Synchronous version of convertAdfToHtml for backwards compatibility
 */
function convertAdfToHtmlSync(adfNode: any, jiraKey?: string, attachments?: Record<string, any>): string {
  let html = '';
  
  if (adfNode.type?.name === 'doc') {
    if (adfNode.content) {
      for (let i = 0; i < adfNode.content.childCount; i++) {
        html += convertAdfToHtmlSync(adfNode.content.child(i), jiraKey, attachments);
      }
    }
  } else if (adfNode.type?.name === 'paragraph') {
    let content = '';
    if (adfNode.content) {
      for (let i = 0; i < adfNode.content.childCount; i++) {
        content += convertAdfToHtmlSync(adfNode.content.child(i), jiraKey, attachments);
      }
    }
    html += `<p>${content}</p>`;
  } else if (adfNode.type?.name === 'text') {
    let text = adfNode.text || '';
    
    if (adfNode.marks) {
      adfNode.marks.forEach((mark: any) => {
        switch (mark.type?.name) {
          case 'strong':
            text = `<strong>${text}</strong>`;
            break;
          case 'em':
            text = `<em>${text}</em>`;
            break;
          case 'code':
            text = `<code>${text}</code>`;
            break;
        }
      });
    }
    html += text;
  } else if (adfNode.type?.name === 'media') {
    // For sync version, just create simple links or images
    const attrs = adfNode.attrs || {};
    const imageUrl = attrs.url || attrs.id || '';
    const alt = attrs.alt || 'Image';
    const filename = imageUrl.split('/').pop() || alt || 'Image';
    
    if (attachments && filename && attachments[filename]) {
      const attachment = attachments[filename];
      const actualImageUrl = attachment.url || attachment.thumbnail;
      html += `<img src="${actualImageUrl}" alt="${filename}" loading="lazy" class="jira-image" />`;
    } else if (imageUrl && imageUrl.startsWith('http')) {
      html += `<img src="${imageUrl}" alt="${filename}" loading="lazy" class="jira-image" />`;
    } else if (jiraKey) {
      const jiraUrl = `https://issues.redhat.com/browse/${jiraKey}`;
      html += `<a href="${jiraUrl}" target="_blank" rel="noopener noreferrer" class="github-image-link">📎 ${filename} (see in JIRA)</a>`;
    } else {
      html += `<span class="github-image-link">📎 ${filename}</span>`;
    }
  } else {
    // For unhandled node types, try to process children
    if (adfNode.content) {
      for (let i = 0; i < adfNode.content.childCount; i++) {
        html += convertAdfToHtmlSync(adfNode.content.child(i), jiraKey, attachments);
      }
    }
  }
  
  return html;
}

/**
 * Escape HTML special characters
 * @param text - Text to escape
 * @returns Escaped text
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * GitHub Comment interface matching API response
 */
export interface GitHubComment {
  id: number | string; // Can be number or string like "review-123"
  user: {
    login: string;
    avatar_url?: string;
  };
  body: string;
  created_at: string;
  updated_at?: string;
  submitted_at?: string; // For reviews
  comment_type?: 'general' | 'review' | 'inline'; // Type of comment for enhanced display
  state?: string; // For review comments (approved, changes_requested, etc.)
  path?: string; // For inline comments - file path
  line?: number; // For inline comments - line number
}

/**
 * Sort and prepare GitHub comments for display
 * Based on plain JS app implementation
 * @param comments - Array of GitHub comment objects
 * @returns Sorted array of comments
 */
export function prepareGitHubComments(comments: GitHubComment[]): GitHubComment[] {
  if (!comments || comments.length === 0) {
    return [];
  }
  
  // Sort comments by creation date (most recent first)
  return [...comments].sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

/**
 * Inject GitHub tokens into proxy URLs for image authentication
 * @param html - HTML string with token placeholders
 * @param githubToken - GitHub token for API access
 * @returns HTML string with actual tokens
 */
export function injectTokens(html: string, githubToken?: string): string {
  if (!html) return '';
  
  let result = html;
  
  // Replace GitHub token placeholder
  if (githubToken) {
    const beforeReplace = result;
    result = result.replace(/GITHUB_TOKEN_PLACEHOLDER/g, encodeURIComponent(githubToken));
    if (beforeReplace !== result) {
      console.log('✅ GitHub token injected successfully');
    }
  } else {
    // Remove token parameter if no token available (some images might still work)
    const beforeReplace = result;
    result = result.replace(/&token=GITHUB_TOKEN_PLACEHOLDER/g, '');
    if (beforeReplace !== result) {
      console.log('🔄 GitHub token placeholder removed (no token available)');
    }
  }
  
  return result;
}

/**
 * Synchronous version of parseJiraMarkdown for JIRA components (keeps the working direct image display)
 */
export function parseJiraMarkdownSync(jiraText: string, jiraKey?: string, attachments?: Record<string, any>): string {
  if (!jiraText) return '';
  
  const transformer = new WikiMarkupTransformer();
  
  try {
    const adfDocument = transformer.parse(jiraText);
    return convertAdfToHtmlSync(adfDocument, jiraKey, attachments);
  } catch (error) {
    console.warn('🔄 ADF parsing failed, falling back to basic JIRA markdown:', error);
    return parseBasicJiraMarkdownSync(jiraText, jiraKey, attachments);
  }
}

/**
 * Simplified GitHub markdown parser (replaces the complex caching version)  
 * All images now load directly since we're on same origin (localhost:3017)
 */
export async function parseGitHubMarkdownWithCaching(markdown: string, token?: string): Promise<string> {
  // Just use the simple direct loading parser
  return await parseGitHubMarkdown(markdown, token);
}// TIMEZONE-AWARE UTILITIES FOR EXISTING FUNCTIONS
// ===========================================

/**
 * Enhanced GitHub comment preparation with timezone awareness
 * @param comments - Array of GitHub comment objects
 * @param userTimezone - User's preferred timezone for timestamp formatting
 * @returns Sorted array of comments with timezone-aware timestamps
 */
export function prepareGitHubCommentsWithTimezone(
  comments: GitHubComment[],
  userTimezone?: string
): (GitHubComment & { formattedDate?: string })[] {
  if (!comments || comments.length === 0) {
    return [];
  }
  
  // Sort comments by creation date and add formatted timestamps
  return [...comments]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map(comment => ({
      ...comment,
      formattedDate: formatCommentTimestamp(comment.created_at, userTimezone)
    }));
}

/**
 * Format a comment/conversation timestamp with timezone awareness
 * @param dateInput - Comment timestamp
 * @param userTimezone - User's preferred timezone
 * @returns Formatted timestamp for comment displays
 */
export function formatCommentTimestamp(dateInput: string | Date | number, userTimezone?: string): string {
  if (!dateInput) return 'N/A';
  
  // Use relative formatting for recent comments, absolute for older ones
  const date = new Date(dateInput);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays < 7) {
    return formatRelativeDateInTimezone(dateInput, userTimezone);
  }
  
  return formatDateInTimezone(dateInput, userTimezone, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Format a GitHub PR/issue timestamp with timezone awareness
 * @param dateInput - GitHub timestamp string
 * @param userTimezone - User's preferred timezone
 * @returns Formatted timestamp for PR/issue displays
 */
export function formatGitHubTimestamp(
  dateInput: string | Date | number,
  userTimezone?: string
): string {
  if (!dateInput) return 'N/A';
  
  return formatDateInTimezone(dateInput, userTimezone, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Format a JIRA timestamp with timezone awareness
 * @param dateInput - JIRA timestamp string (usually ISO format)
 * @param userTimezone - User's preferred timezone
 * @returns Formatted timestamp for JIRA displays
 */
export function formatJiraTimestamp(
  dateInput: string | Date | number,
  userTimezone?: string
): string {
  if (!dateInput) return 'N/A';
  
  return formatDateInTimezone(dateInput, userTimezone, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Format a date as a short relative time ("2 days ago") with timezone awareness
 * @param dateInput - Date string, Date object, or timestamp
 * @param userTimezone - User's preferred timezone
 * @returns Formatted relative time string
 */
export function formatRelativeDateInTimezone(
  dateInput: string | Date | number,
  userTimezone?: string
): string {
  if (!dateInput) return 'N/A';
  
  try {
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return 'Invalid Date';
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    // For recent times, show relative
    if (diffHours < 1) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return diffMinutes < 1 ? 'just now' : `${diffMinutes}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    }
    
    // For older dates, show formatted date in user's timezone
    return formatDateInTimezone(date, userTimezone, {
      month: 'short',
      day: 'numeric',
      year: diffDays > 365 ? 'numeric' : undefined
    });
  } catch (error) {
    console.error('❌ Error formatting relative date:', error);
    return 'Invalid Date';
  }
}

/**
 * Format a date/time in the user's preferred timezone
 * @param dateInput - Date string, Date object, or timestamp
 * @param userTimezone - User's preferred timezone (IANA format)
 * @param options - Intl.DateTimeFormat options for customization
 * @returns Formatted date string in user's timezone
 */
export function formatDateInTimezone(
  dateInput: string | Date | number,
  userTimezone?: string,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!dateInput) return 'N/A';
  
  try {
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return 'Invalid Date';
    
    // Use user's timezone or fall back to system timezone
    const timezone = userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    // Default formatting options
    const defaultOptions: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
      ...options
    };
    
    return new Intl.DateTimeFormat('en-US', defaultOptions).format(date);
  } catch (error) {
    console.error('❌ Error formatting date in timezone:', error);
    return 'Invalid Date';
  }
}
