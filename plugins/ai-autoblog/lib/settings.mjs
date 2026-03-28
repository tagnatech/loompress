import {
  computeNextRunAt,
  formatScheduleSummary,
  formatTimestampInTimeZone,
  normalizeAspectRatio,
  normalizeOptionalDate,
  normalizeScheduleMode,
  normalizeScheduleTime,
  normalizeWeekday,
} from './time.mjs';

export const AUTOBLOG_DEFAULTS = {
  enabled: 'false',
  openrouter_api_key: '',
  text_model: '',
  image_model: '',
  schedule_mode: 'daily',
  schedule_time: '09:00',
  schedule_day: '1',
  start_date: '',
  post_status: 'draft',
  content_brief: '',
  audience: '',
  brand_voice: '',
  keyword_focus: '',
  default_category: '',
  default_tags: '',
  author_user_id: '',
  research_with_web: 'false',
  image_enabled: 'true',
  image_aspect_ratio: '16:9',
  image_style: '',
  next_run_at: '',
  last_run_at: '',
  last_error: '',
  last_warning: '',
  last_post_id: '',
  last_post_title: '',
  last_post_slug: '',
};

export function getAutoblogSettingKey(name) {
  return `autoblog.${name}`;
}

export async function getAutoblogSettings(settingsService, siteId) {
  const allSettings = await settingsService.getAll(siteId);
  return hydrateAutoblogSettings(allSettings);
}

export function hydrateAutoblogSettings(rawSettings = {}) {
  const settings = {};

  for (const [key, fallback] of Object.entries(AUTOBLOG_DEFAULTS)) {
    settings[key] = rawSettings[getAutoblogSettingKey(key)] ?? fallback;
  }

  const storedApiKey = sanitizeSingleLine(settings.openrouter_api_key, 400);
  const apiKey = storedApiKey || sanitizeSingleLine(process.env.OPENROUTER_API_KEY, 400);

  return {
    enabled: settings.enabled === 'true',
    storedApiKey,
    apiKeySource: storedApiKey ? 'stored' : (apiKey ? 'env' : 'missing'),
    textModel: sanitizeSingleLine(settings.text_model, 120),
    imageModel: sanitizeSingleLine(settings.image_model, 120),
    scheduleMode: normalizeScheduleMode(settings.schedule_mode),
    scheduleTime: normalizeScheduleTime(settings.schedule_time),
    scheduleWeekday: normalizeWeekday(settings.schedule_day),
    startDate: normalizeStoredDate(settings.start_date),
    postStatus: settings.post_status === 'published' ? 'published' : 'draft',
    contentBrief: sanitizeMultiline(settings.content_brief, 6_000),
    audience: sanitizeSingleLine(settings.audience, 255),
    brandVoice: sanitizeMultiline(settings.brand_voice, 2_000),
    keywordFocus: sanitizeMultiline(settings.keyword_focus, 1_000),
    defaultCategory: sanitizeSingleLine(settings.default_category, 120),
    defaultTags: sanitizeSingleLine(settings.default_tags, 500),
    authorUserId: sanitizeSingleLine(settings.author_user_id, 64),
    researchWithWeb: settings.research_with_web === 'true',
    imageEnabled: settings.image_enabled === 'true',
    imageAspectRatio: normalizeAspectRatio(settings.image_aspect_ratio),
    imageStyle: sanitizeMultiline(settings.image_style, 1_000),
    nextRunAt: normalizeIsoString(settings.next_run_at),
    lastRunAt: normalizeIsoString(settings.last_run_at),
    lastError: sanitizeSingleLine(settings.last_error, 500),
    lastWarning: sanitizeSingleLine(settings.last_warning, 500),
    lastPostId: sanitizeSingleLine(settings.last_post_id, 64),
    lastPostTitle: sanitizeSingleLine(settings.last_post_title, 255),
    lastPostSlug: sanitizeSingleLine(settings.last_post_slug, 255),
  };
}

export function buildAutoblogSettingsUpdate({ body, existingSettings, site }) {
  const clearApiKey = body.clear_openrouter_api_key === 'on';
  const apiKeyInput = sanitizeSingleLine(body.openrouter_api_key, 400);
  const storedApiKey = clearApiKey
    ? ''
    : (apiKeyInput || existingSettings.storedApiKey);
  const enabled = body.enabled === 'on';
  const scheduleMode = normalizeScheduleMode(body.schedule_mode);
  const scheduleTime = normalizeScheduleTime(body.schedule_time);
  const scheduleWeekday = normalizeWeekday(body.schedule_day);
  const startDate = normalizeOptionalDate(body.start_date);

  return {
    enabled,
    storedApiKey,
    apiKeySource: storedApiKey ? 'stored' : (process.env.OPENROUTER_API_KEY ? 'env' : 'missing'),
    textModel: sanitizeSingleLine(body.text_model, 120),
    imageModel: sanitizeSingleLine(body.image_model, 120),
    scheduleMode,
    scheduleTime,
    scheduleWeekday,
    startDate,
    postStatus: body.post_status === 'published' ? 'published' : 'draft',
    contentBrief: sanitizeMultiline(body.content_brief, 6_000),
    audience: sanitizeSingleLine(body.audience, 255),
    brandVoice: sanitizeMultiline(body.brand_voice, 2_000),
    keywordFocus: sanitizeMultiline(body.keyword_focus, 1_000),
    defaultCategory: sanitizeSingleLine(body.default_category, 120),
    defaultTags: sanitizeSingleLine(body.default_tags, 500),
    authorUserId: sanitizeSingleLine(body.author_user_id, 64),
    researchWithWeb: body.research_with_web === 'on',
    imageEnabled: body.image_enabled === 'on',
    imageAspectRatio: normalizeAspectRatio(body.image_aspect_ratio),
    imageStyle: sanitizeMultiline(body.image_style, 1_000),
    nextRunAt: enabled
      ? computeNextRunAt({
        timeZone: site?.timezone || 'UTC',
        scheduleMode,
        scheduleTime,
        scheduleWeekday,
        startDate,
      })
      : null,
    lastRunAt: existingSettings.lastRunAt,
    lastError: '',
    lastWarning: '',
    lastPostId: existingSettings.lastPostId,
    lastPostTitle: existingSettings.lastPostTitle,
    lastPostSlug: existingSettings.lastPostSlug,
  };
}

export function serializeAutoblogSettings(settings) {
  return {
    [getAutoblogSettingKey('enabled')]: settings.enabled ? 'true' : 'false',
    [getAutoblogSettingKey('openrouter_api_key')]: settings.storedApiKey || '',
    [getAutoblogSettingKey('text_model')]: settings.textModel || '',
    [getAutoblogSettingKey('image_model')]: settings.imageModel || '',
    [getAutoblogSettingKey('schedule_mode')]: settings.scheduleMode || 'daily',
    [getAutoblogSettingKey('schedule_time')]: settings.scheduleTime || '09:00',
    [getAutoblogSettingKey('schedule_day')]: String(settings.scheduleWeekday ?? 1),
    [getAutoblogSettingKey('start_date')]: settings.startDate || '',
    [getAutoblogSettingKey('post_status')]: settings.postStatus || 'draft',
    [getAutoblogSettingKey('content_brief')]: settings.contentBrief || '',
    [getAutoblogSettingKey('audience')]: settings.audience || '',
    [getAutoblogSettingKey('brand_voice')]: settings.brandVoice || '',
    [getAutoblogSettingKey('keyword_focus')]: settings.keywordFocus || '',
    [getAutoblogSettingKey('default_category')]: settings.defaultCategory || '',
    [getAutoblogSettingKey('default_tags')]: settings.defaultTags || '',
    [getAutoblogSettingKey('author_user_id')]: settings.authorUserId || '',
    [getAutoblogSettingKey('research_with_web')]: settings.researchWithWeb ? 'true' : 'false',
    [getAutoblogSettingKey('image_enabled')]: settings.imageEnabled ? 'true' : 'false',
    [getAutoblogSettingKey('image_aspect_ratio')]: settings.imageAspectRatio || '16:9',
    [getAutoblogSettingKey('image_style')]: settings.imageStyle || '',
    [getAutoblogSettingKey('next_run_at')]: settings.nextRunAt || '',
    [getAutoblogSettingKey('last_run_at')]: settings.lastRunAt || '',
    [getAutoblogSettingKey('last_error')]: settings.lastError || '',
    [getAutoblogSettingKey('last_warning')]: settings.lastWarning || '',
    [getAutoblogSettingKey('last_post_id')]: settings.lastPostId || '',
    [getAutoblogSettingKey('last_post_title')]: settings.lastPostTitle || '',
    [getAutoblogSettingKey('last_post_slug')]: settings.lastPostSlug || '',
  };
}

export function resolveOpenRouterApiKey(settings) {
  return settings.storedApiKey || sanitizeSingleLine(process.env.OPENROUTER_API_KEY, 400);
}

export function getAutoblogRuntime(settings, site) {
  const missingFields = [];
  if (!resolveOpenRouterApiKey(settings)) {
    missingFields.push('OpenRouter API key');
  }
  if (!settings.textModel) {
    missingFields.push('OpenRouter text model');
  }
  if (!settings.contentBrief) {
    missingFields.push('content brief');
  }
  if (settings.imageEnabled && !settings.imageModel) {
    missingFields.push('OpenRouter image model');
  }

  const timeZone = site?.timezone || 'UTC';
  const nextRunAt = settings.enabled
    ? (settings.nextRunAt || computeNextRunAt({
      timeZone,
      scheduleMode: settings.scheduleMode,
      scheduleTime: settings.scheduleTime,
      scheduleWeekday: settings.scheduleWeekday,
      startDate: settings.startDate,
    }))
    : null;

  return {
    enabled: settings.enabled,
    ready: missingFields.length === 0,
    missingFields,
    apiKeySource: settings.apiKeySource,
    scheduleSummary: formatScheduleSummary({
      scheduleMode: settings.scheduleMode,
      scheduleTime: settings.scheduleTime,
      scheduleWeekday: settings.scheduleWeekday,
      timeZone,
    }),
    nextRunAt,
    nextRunLabel: formatTimestampInTimeZone(nextRunAt, timeZone),
    lastRunLabel: formatTimestampInTimeZone(settings.lastRunAt, timeZone),
  };
}

export function maskStoredSecret(value) {
  const normalized = sanitizeSingleLine(value, 400);
  if (!normalized) {
    return '';
  }

  if (normalized.length <= 8) {
    return `${normalized.slice(0, 2)}••••`;
  }

  return `${normalized.slice(0, 4)}••••${normalized.slice(-4)}`;
}

function normalizeStoredDate(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return null;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function normalizeIsoString(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function sanitizeSingleLine(input, maxLength = 255) {
  return String(input ?? '')
    .replace(/\0/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function sanitizeMultiline(input, maxLength = 5_000) {
  return String(input ?? '')
    .replace(/\0/g, '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, maxLength);
}
