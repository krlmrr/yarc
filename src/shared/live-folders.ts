import type { LiveSource } from './types'

export type GitHubPreset = 'mine' | 'review' | 'repo' | 'custom'

const OPEN_PRS = 'is:pr is:open'
const REPO = /^[\w.-]+\/[\w.-]+$/

export function githubQuery(preset: GitHubPreset, repo: string, custom: string): string {
  if (preset === 'mine') return `${OPEN_PRS} author:@me`
  if (preset === 'review') return `${OPEN_PRS} review-requested:@me`
  if (preset === 'repo') return `${OPEN_PRS} repo:${repoName(repo)}`
  return custom.trim()
}

export function githubPreset(query: string): { preset: GitHubPreset; repo: string } {
  if (query === githubQuery('mine', '', '')) return { preset: 'mine', repo: '' }
  if (query === githubQuery('review', '', '')) return { preset: 'review', repo: '' }
  const repo = query.startsWith(`${OPEN_PRS} repo:`) ? query.slice(OPEN_PRS.length + 6) : ''
  return REPO.test(repo) ? { preset: 'repo', repo } : { preset: 'custom', repo: '' }
}

/** Takes `owner/name` or a pasted github.com URL. */
export function repoName(input: string): string {
  const s = input.trim().replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '')
  return s.split('/').slice(0, 2).join('/').replace(/\.git$/, '')
}

export function isRepoName(input: string): boolean {
  return REPO.test(repoName(input))
}

/** Undefined when it can't be fetched: an empty search, or a feed address that isn't http(s). */
export function cleanLiveSource(source: LiveSource): LiveSource | undefined {
  if (source.kind === 'github') {
    const query = String(source.query ?? '').trim().slice(0, 256)
    return query ? { kind: 'github', query } : undefined
  }
  const raw = String(source.url ?? '').trim()
  const url = URL.parse(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`)
  return url?.protocol === 'https:' || url?.protocol === 'http:' ? { kind: 'feed', url: url.href } : undefined
}

export function liveFolderName(source: LiveSource): string {
  if (source.kind === 'feed') return URL.canParse(source.url) ? new URL(source.url).hostname.replace(/^www\./, '') : 'Feed'
  const { preset, repo } = githubPreset(source.query)
  if (preset === 'mine') return 'My Pull Requests'
  if (preset === 'review') return 'Review Requests'
  if (preset === 'repo') return `${repo.split('/')[1]} Pull Requests`
  return 'Pull Requests'
}

/** `@me` only means something to GitHub when it knows who's asking. */
export function needsGitHubSignIn(query: string): boolean {
  return /@me\b/.test(query)
}
